# Read by infra/scripts/deploy.sh and the workflows (terraform output -json). Nothing secret.

output "app_url" {
  description = "Open this after a deploy."
  value       = local.base_url
}

output "cluster" {
  value = aws_ecs_cluster.main.name
}

output "services" {
  value = { for s in local.services : s => s }
}

output "ecr_repositories" {
  value = { for k, r in aws_ecr_repository.app : k => r.repository_url }
}

output "task_families" {
  value = {
    web     = aws_ecs_task_definition.web.family
    ai      = aws_ecs_task_definition.ai.family
    migrate = aws_ecs_task_definition.migrate.family
  }
}

output "task_subnets" {
  value = aws_subnet.public[*].id
}

output "web_security_group" {
  value = aws_security_group.web.id
}

output "migrate_log_group" {
  value = aws_cloudwatch_log_group.app["migrate"].name
}

output "dashboard_url" {
  value = "https://${var.region}.console.aws.amazon.com/cloudwatch/home?region=${var.region}#dashboards/dashboard/${aws_cloudwatch_dashboard.demo.dashboard_name}"
}
