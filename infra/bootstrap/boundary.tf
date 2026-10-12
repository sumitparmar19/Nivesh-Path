# Permissions boundary for EVERY role the demo and jobs stacks create (ECS task/execution roles, Lambda, Step
# Functions, Scheduler). The deploy role may only create or change roles that carry this boundary, so even if a
# workflow were tampered with, a role it makes can never do more than what is listed here: pull images, write logs,
# read the two nivesh-path secrets and the RDS-managed password, and run the nightly job. A boundary grants
# nothing by itself; each role still needs its own (smaller) policy.

data "aws_iam_policy_document" "boundary" {
  #checkov:skip=CKV_AWS_356:ecr:GetAuthorizationToken and the Step Functions log-delivery actions only accept "*"; kms:Decrypt is limited to Secrets Manager by condition. This is a ceiling, not a grant.
  statement {
    sid = "PullImages"
    actions = [
      "ecr:GetAuthorizationToken",
      "ecr:BatchCheckLayerAvailability",
      "ecr:BatchGetImage",
      "ecr:GetDownloadUrlForLayer",
    ]
    resources = ["*"]
  }

  statement {
    sid = "WriteOwnLogs"
    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents",
      "logs:DescribeLogStreams",
    ]
    resources = [
      "arn:${local.partition}:logs:${var.region}:${local.account_id}:log-group:/nivesh-*",
      "arn:${local.partition}:logs:${var.region}:${local.account_id}:log-group:/nivesh-*:*",
      "arn:${local.partition}:logs:${var.region}:${local.account_id}:log-group:/aws/lambda/nivesh-jobs-*",
      "arn:${local.partition}:logs:${var.region}:${local.account_id}:log-group:/aws/lambda/nivesh-jobs-*:*",
    ]
  }

  statement {
    sid = "StepFunctionsLogDelivery"
    actions = [
      "logs:CreateLogDelivery",
      "logs:GetLogDelivery",
      "logs:UpdateLogDelivery",
      "logs:DeleteLogDelivery",
      "logs:ListLogDeliveries",
      "logs:PutResourcePolicy",
      "logs:DescribeResourcePolicies",
      "logs:DescribeLogGroups",
    ]
    resources = ["*"]
  }

  statement {
    sid     = "ReadAppSecrets"
    actions = ["secretsmanager:GetSecretValue"]
    resources = [
      "arn:${local.partition}:secretsmanager:${var.region}:${local.account_id}:secret:${var.project}/*",
      "arn:${local.partition}:secretsmanager:${var.region}:${local.account_id}:secret:rds!*",
    ]
  }

  statement {
    sid       = "DecryptSecretsOnly"
    actions   = ["kms:Decrypt"]
    resources = ["*"]

    condition {
      test     = "StringEquals"
      variable = "kms:ViaService"
      values   = ["secretsmanager.${var.region}.amazonaws.com"]
    }
  }

  statement {
    sid     = "RunNightlyJob"
    actions = ["lambda:InvokeFunction", "states:StartExecution", "states:DescribeExecution", "states:StopExecution"]
    resources = [
      "arn:${local.partition}:lambda:${var.region}:${local.account_id}:function:nivesh-jobs-*",
      "arn:${local.partition}:states:${var.region}:${local.account_id}:stateMachine:nivesh-jobs-*",
      "arn:${local.partition}:states:${var.region}:${local.account_id}:execution:nivesh-jobs-*:*",
    ]
  }

  statement {
    sid       = "AlertEmails"
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.alerts.arn]
  }
}

resource "aws_iam_policy" "boundary" {
  name        = "nivesh-workload-boundary"
  description = "Upper limit for every role the nivesh-path demo/jobs stacks create."
  policy      = data.aws_iam_policy_document.boundary.json
}
