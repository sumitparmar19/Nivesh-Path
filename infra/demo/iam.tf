# Roles for the ECS tasks. Every role carries the nivesh-workload-boundary from infra/bootstrap (the deploy role
# can't create a role without it). Each container gets two roles:
#   execution role - used by ECS itself to start the task: pull the image, write logs, read the two secrets;
#   task role      - what the running code may call in AWS: nothing (the app only talks to its own services).

data "aws_iam_policy_document" "ecs_tasks_trust" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [local.account_id]
    }
  }
}

resource "aws_iam_role" "execution" {
  name                 = "${local.name}-execution"
  description          = "ECS: start nivesh-demo tasks (pull images, write logs, read the app secret and the RDS password)."
  assume_role_policy   = data.aws_iam_policy_document.ecs_tasks_trust.json
  permissions_boundary = local.boundary_arn
}

data "aws_iam_policy_document" "execution" {
  statement {
    sid       = "EcrLogin"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }

  statement {
    sid       = "PullOwnImages"
    actions   = ["ecr:BatchCheckLayerAvailability", "ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer"]
    resources = [for r in aws_ecr_repository.app : r.arn]
  }

  statement {
    sid       = "WriteOwnLogs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = [for g in aws_cloudwatch_log_group.app : "${g.arn}:*"]
  }

  statement {
    sid     = "ReadSecrets"
    actions = ["secretsmanager:GetSecretValue"]
    resources = [
      data.aws_secretsmanager_secret.app.arn,
      aws_db_instance.ledger.master_user_secret[0].secret_arn,
    ]
  }
}

resource "aws_iam_role_policy" "execution" {
  name   = "start-tasks"
  role   = aws_iam_role.execution.id
  policy = data.aws_iam_policy_document.execution.json
}

# Task roles with no policies: the code needs no AWS API. Separate per service, so a future permission for one
# service never leaks to the other.
resource "aws_iam_role" "task" {
  for_each             = toset(local.services)
  name                 = "${local.name}-${each.key}-task"
  description          = "Runtime role of the ${each.key} container: no AWS permissions."
  assume_role_policy   = data.aws_iam_policy_document.ecs_tasks_trust.json
  permissions_boundary = local.boundary_arn
}
