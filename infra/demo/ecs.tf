# ECS Fargate: one cluster, a web service (behind the ALB) and an ai service (no load-balancer route at all).
# They find each other through Cloud Map private DNS (web.nivesh.internal, ai.nivesh.internal): plain DNS, no
# sidecar proxy, so the small tasks keep their memory. A third task definition, "migrate", runs
# `prisma migrate deploy` once per deploy, before the services change (infra/scripts/deploy.sh).
# Terraform creates the first task definitions; deploys register new revisions with the new image, so the
# services ignore task_definition changes here (and desired_count, which the autoscaler owns).

resource "aws_cloudwatch_log_group" "app" {
  #checkov:skip=CKV_AWS_158:CloudWatch encrypts logs by default; a customer-managed KMS key adds cost. Logs are scrubbed of secrets (src/lib/redact.js).
  #checkov:skip=CKV_AWS_338:7-day retention on purpose (task spec): a demo stack, and logs are also in Grafana when telemetry is on.
  for_each          = toset(["web", "ai", "migrate"])
  name              = "/${local.name}/${each.key}"
  retention_in_days = 7
}

resource "aws_ecs_cluster" "main" {
  #checkov:skip=CKV_AWS_65:Container Insights is off for cost (task spec); the dashboard uses the free ECS/ALB/RDS metrics.
  name = local.name

  setting {
    name  = "containerInsights"
    value = "disabled"
  }
}

resource "aws_service_discovery_private_dns_namespace" "main" {
  name        = "nivesh.internal"
  description = "Private DNS for the demo services"
  vpc         = aws_vpc.main.id
}

resource "aws_service_discovery_service" "app" {
  for_each = toset(local.services)
  name     = each.key

  dns_config {
    namespace_id   = aws_service_discovery_private_dns_namespace.main.id
    routing_policy = "MULTIVALUE"

    dns_records {
      type = "A"
      ttl  = 10
    }
  }
}

locals {
  image      = { for s in local.services : s => "${aws_ecr_repository.app[s].repository_url}:${var.image_tag}" }
  db_secret  = aws_db_instance.ledger.master_user_secret[0].secret_arn
  app_secret = data.aws_secretsmanager_secret.app.arn

  logs = { for k, g in aws_cloudwatch_log_group.app : k => {
    logDriver = "awslogs"
    options = {
      "awslogs-group"         = g.name
      "awslogs-region"        = var.region
      "awslogs-stream-prefix" = k
    }
  } }

  # Values ECS reads from Secrets Manager when a task starts ("arn:json-key::"). The demo secret's keys are
  # listed in docs/AWS.md; DB_USER/DB_PASSWORD come from the RDS-managed secret.
  web_secrets = [
    { name = "MONGO_URL", valueFrom = "${local.app_secret}:MONGO_URL::" },
    { name = "JWT_SECRET", valueFrom = "${local.app_secret}:JWT_SECRET::" },
    { name = "FINNHUB_API_KEY", valueFrom = "${local.app_secret}:FINNHUB_API_KEY::" },
    { name = "AI_INTERNAL_TOKEN", valueFrom = "${local.app_secret}:AI_INTERNAL_TOKEN::" },
    { name = "DB_USER", valueFrom = "${local.db_secret}:username::" },
    { name = "DB_PASSWORD", valueFrom = "${local.db_secret}:password::" },
  ]
  db_env = [
    { name = "DB_HOST", value = aws_db_instance.ledger.address },
    { name = "DB_PORT", value = tostring(aws_db_instance.ledger.port) },
    { name = "DB_NAME", value = aws_db_instance.ledger.db_name },
  ]
}

resource "aws_ecs_task_definition" "web" {
  #checkov:skip=CKV_AWS_336:The Node server and Prisma write temporary files; a read-only root file system is a follow-up.
  family                   = "${local.name}-web"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.web_cpu
  memory                   = var.web_memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task["web"].arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  container_definitions = jsonencode([{
    name         = "web"
    image        = local.image["web"]
    essential    = true
    portMappings = [{ containerPort = 3000, protocol = "tcp" }]
    environment = concat(local.db_env, [
      { name = "NODE_ENV", value = "production" },
      { name = "PORT", value = "3000" },
      { name = "LEDGER_BACKEND", value = "postgres" },
      { name = "AI_SERVICE_URL", value = "http://ai.${aws_service_discovery_private_dns_namespace.main.name}:8001" },
      { name = "PUBLIC_BASE_URL", value = local.base_url },
      { name = "DEPLOY_PLATFORM", value = "aws-demo" },
      { name = "DEMO_FAULTS", value = "1" },
    ])
    secrets          = local.web_secrets
    logConfiguration = local.logs["web"]
    healthCheck = {
      command     = ["CMD-SHELL", "wget -qO- http://localhost:3000/health || exit 1"]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 30
    }
  }])
}

resource "aws_ecs_task_definition" "ai" {
  #checkov:skip=CKV_AWS_336:ChromaDB writes its index to /data/chroma inside the container.
  family                   = "${local.name}-ai"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.ai_cpu
  memory                   = var.ai_memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task["ai"].arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  container_definitions = jsonencode([{
    name         = "ai"
    image        = local.image["ai"]
    essential    = true
    portMappings = [{ containerPort = 8001, protocol = "tcp" }]
    environment = [
      { name = "WEB_INTERNAL_URL", value = "http://web.${aws_service_discovery_private_dns_namespace.main.name}:3000" },
      { name = "CHROMA_PERSIST_DIR", value = "/data/chroma" },
    ]
    secrets = [
      { name = "ANTHROPIC_API_KEY", valueFrom = "${local.app_secret}:ANTHROPIC_API_KEY::" },
      { name = "MONGO_URL", valueFrom = "${local.app_secret}:MONGO_URL::" },
      { name = "AI_INTERNAL_TOKEN", valueFrom = "${local.app_secret}:AI_INTERNAL_TOKEN::" },
    ]
    logConfiguration = local.logs["ai"]
    # The AI service has no load balancer, so ECS checks /health itself and replaces a task that fails.
    healthCheck = {
      command     = ["CMD", "python", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:8001/health', timeout=4)"]
      interval    = 30
      timeout     = 5
      retries     = 3
      startPeriod = 60
    }
  }])
}

# One-off: `prisma migrate deploy` against RDS, run by the deploy script before the services update.
resource "aws_ecs_task_definition" "migrate" {
  #checkov:skip=CKV_AWS_336:Prisma's CLI writes temporary files.
  family                   = "${local.name}-migrate"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task["web"].arn

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "X86_64"
  }

  container_definitions = jsonencode([{
    name             = "migrate"
    image            = local.image["web"]
    essential        = true
    command          = ["node", "scripts/with-db-url.js", "npx", "--no-install", "prisma", "migrate", "deploy"]
    environment      = local.db_env
    secrets          = [for s in local.web_secrets : s if contains(["DB_USER", "DB_PASSWORD"], s.name)]
    logConfiguration = local.logs["migrate"]
  }])
}

resource "aws_ecs_service" "web" {
  #checkov:skip=CKV_AWS_333:No NAT gateway (docs/AWS.md): the public IP is the way out; the security group only admits the load balancer.
  name                              = "web"
  cluster                           = aws_ecs_cluster.main.id
  task_definition                   = aws_ecs_task_definition.web.arn
  desired_count                     = var.web_min_tasks
  launch_type                       = "FARGATE"
  health_check_grace_period_seconds = 60
  propagate_tags                    = "SERVICE"
  enable_execute_command            = false

  network_configuration {
    subnets          = aws_subnet.public[*].id
    security_groups  = [aws_security_group.web.id]
    assign_public_ip = true # no NAT: the public IP is how the task reaches ECR, Atlas and Finnhub
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.web.arn
    container_name   = "web"
    container_port   = 3000
  }

  service_registries {
    registry_arn = aws_service_discovery_service.app["web"].arn
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  lifecycle {
    ignore_changes = [task_definition, desired_count]
  }

  depends_on = [aws_lb_listener.http]
}

resource "aws_ecs_service" "ai" {
  #checkov:skip=CKV_AWS_333:No NAT gateway (docs/AWS.md): the public IP is the way out; the security group only admits web.
  name                   = "ai"
  cluster                = aws_ecs_cluster.main.id
  task_definition        = aws_ecs_task_definition.ai.arn
  desired_count          = 1
  launch_type            = "FARGATE"
  propagate_tags         = "SERVICE"
  enable_execute_command = false

  network_configuration {
    subnets          = aws_subnet.public[*].id
    security_groups  = [aws_security_group.ai.id]
    assign_public_ip = true
  }

  service_registries {
    registry_arn = aws_service_discovery_service.app["ai"].arn
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  lifecycle {
    ignore_changes = [task_definition]
  }
}
