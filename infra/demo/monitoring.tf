# CloudWatch for the demo: one dashboard and four alarms that email Sumit (SNS topic from infra/bootstrap).
# Only free, built-in metrics are used (ALB, ECS service CPU/memory, RDS); Container Insights stays off.
# The ALB's HealthyHostCount doubles as "how many web tasks are serving", which is how scaling shows up.

locals {
  alb_dim = aws_lb.main.arn_suffix
  tg_dim  = aws_lb_target_group.web.arn_suffix
  alarm_targets = {
    alarm_actions = [data.aws_sns_topic.alerts.arn]
    ok_actions    = [data.aws_sns_topic.alerts.arn]
  }
}

resource "aws_cloudwatch_dashboard" "demo" {
  dashboard_name = local.name

  dashboard_body = jsonencode({
    widgets = [
      {
        type = "metric", x = 0, y = 0, width = 12, height = 6
        properties = {
          title   = "Requests per minute (load balancer)"
          region  = var.region
          stat    = "Sum"
          period  = 60
          metrics = [["AWS/ApplicationELB", "RequestCount", "LoadBalancer", local.alb_dim]]
        }
      },
      {
        type = "metric", x = 12, y = 0, width = 12, height = 6
        properties = {
          title  = "5xx per minute (app and load balancer)"
          region = var.region
          stat   = "Sum"
          period = 60
          metrics = [
            ["AWS/ApplicationELB", "HTTPCode_Target_5XX_Count", "LoadBalancer", local.alb_dim, { label = "from the app" }],
            ["AWS/ApplicationELB", "HTTPCode_ELB_5XX_Count", "LoadBalancer", local.alb_dim, { label = "from the load balancer" }],
          ]
        }
      },
      {
        type = "metric", x = 0, y = 6, width = 12, height = 6
        properties = {
          title  = "Response time p50 / p95 (seconds)"
          region = var.region
          period = 60
          metrics = [
            ["AWS/ApplicationELB", "TargetResponseTime", "LoadBalancer", local.alb_dim, { stat = "p50", label = "p50" }],
            ["AWS/ApplicationELB", "TargetResponseTime", "LoadBalancer", local.alb_dim, { stat = "p95", label = "p95" }],
          ]
          annotations = { horizontal = [{ value = 1.5, label = "p95 alarm" }] }
        }
      },
      {
        type = "metric", x = 12, y = 6, width = 12, height = 6
        properties = {
          title  = "Web tasks serving (healthy targets) - shows autoscaling"
          region = var.region
          stat   = "Maximum"
          period = 60
          metrics = [
            ["AWS/ApplicationELB", "HealthyHostCount", "TargetGroup", local.tg_dim, "LoadBalancer", local.alb_dim, { label = "healthy" }],
            ["AWS/ApplicationELB", "UnHealthyHostCount", "TargetGroup", local.tg_dim, "LoadBalancer", local.alb_dim, { label = "unhealthy" }],
          ]
        }
      },
      {
        type = "metric", x = 0, y = 12, width = 12, height = 6
        properties = {
          title  = "ECS CPU / memory (% of task size)"
          region = var.region
          stat   = "Average"
          period = 60
          metrics = [
            ["AWS/ECS", "CPUUtilization", "ClusterName", aws_ecs_cluster.main.name, "ServiceName", "web", { label = "web CPU" }],
            ["AWS/ECS", "MemoryUtilization", "ClusterName", aws_ecs_cluster.main.name, "ServiceName", "web", { label = "web memory" }],
            ["AWS/ECS", "CPUUtilization", "ClusterName", aws_ecs_cluster.main.name, "ServiceName", "ai", { label = "ai CPU" }],
            ["AWS/ECS", "MemoryUtilization", "ClusterName", aws_ecs_cluster.main.name, "ServiceName", "ai", { label = "ai memory" }],
          ]
          annotations = { horizontal = [{ value = var.web_cpu_target, label = "scaling target" }] }
        }
      },
      {
        type = "metric", x = 12, y = 12, width = 12, height = 6
        properties = {
          title  = "RDS CPU (%) and connections"
          region = var.region
          stat   = "Average"
          period = 60
          metrics = [
            ["AWS/RDS", "CPUUtilization", "DBInstanceIdentifier", aws_db_instance.ledger.identifier, { label = "CPU %" }],
            ["AWS/RDS", "DatabaseConnections", "DBInstanceIdentifier", aws_db_instance.ledger.identifier, { label = "connections", yAxis = "right" }],
          ]
        }
      },
    ]
  })
}

# 5xx from the app or the load balancer: 5 or more in one minute. GET /internal/demo-fault (DEMO_FAULTS=1, token
# only) produces them on purpose for the alarm test.
resource "aws_cloudwatch_metric_alarm" "errors_5xx" {
  alarm_name          = "${local.name}-5xx"
  alarm_description   = "5 or more 5xx responses in a minute (app or load balancer)."
  comparison_operator = "GreaterThanOrEqualToThreshold"
  threshold           = 5
  evaluation_periods  = 1
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_targets.alarm_actions
  ok_actions          = local.alarm_targets.ok_actions

  metric_query {
    id          = "total"
    expression  = "FILL(app, 0) + FILL(lb, 0)"
    label       = "5xx per minute"
    return_data = true
  }

  metric_query {
    id = "app"
    metric {
      namespace   = "AWS/ApplicationELB"
      metric_name = "HTTPCode_Target_5XX_Count"
      dimensions  = { LoadBalancer = local.alb_dim }
      period      = 60
      stat        = "Sum"
    }
  }

  metric_query {
    id = "lb"
    metric {
      namespace   = "AWS/ApplicationELB"
      metric_name = "HTTPCode_ELB_5XX_Count"
      dimensions  = { LoadBalancer = local.alb_dim }
      period      = 60
      stat        = "Sum"
    }
  }
}

resource "aws_cloudwatch_metric_alarm" "p95_latency" {
  alarm_name          = "${local.name}-p95-latency"
  alarm_description   = "Response time p95 above 1.5 s for 5 minutes in a row."
  namespace           = "AWS/ApplicationELB"
  metric_name         = "TargetResponseTime"
  dimensions          = { LoadBalancer = local.alb_dim }
  extended_statistic  = "p95"
  period              = 60
  evaluation_periods  = 5
  datapoints_to_alarm = 5
  comparison_operator = "GreaterThanThreshold"
  threshold           = 1.5
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_targets.alarm_actions
  ok_actions          = local.alarm_targets.ok_actions
}

resource "aws_cloudwatch_metric_alarm" "unhealthy_targets" {
  alarm_name          = "${local.name}-unhealthy-targets"
  alarm_description   = "A web task has failed its /health check for 3 minutes."
  namespace           = "AWS/ApplicationELB"
  metric_name         = "UnHealthyHostCount"
  dimensions          = { LoadBalancer = local.alb_dim, TargetGroup = local.tg_dim }
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 3
  comparison_operator = "GreaterThanThreshold"
  threshold           = 0
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_targets.alarm_actions
  ok_actions          = local.alarm_targets.ok_actions
}

resource "aws_cloudwatch_metric_alarm" "rds_cpu" {
  alarm_name          = "${local.name}-rds-cpu"
  alarm_description   = "RDS CPU above 80% for 15 minutes."
  namespace           = "AWS/RDS"
  metric_name         = "CPUUtilization"
  dimensions          = { DBInstanceIdentifier = aws_db_instance.ledger.identifier }
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 3
  comparison_operator = "GreaterThanThreshold"
  threshold           = 80
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alarm_targets.alarm_actions
  ok_actions          = local.alarm_targets.ok_actions
}
