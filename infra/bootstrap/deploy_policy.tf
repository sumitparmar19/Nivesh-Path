# What the deploy role (github-nivesh-deploy) may do. Terraform needs broad create/delete rights on the services the
# demo and jobs stacks use, and per-action least privilege isn't practical for a Terraform runner, so it is fenced
# in three ways instead:
#   1. only those services, only in var.region;
#   2. IAM, the usual escalation path, only on roles named nivesh-demo-*/nivesh-jobs-* that carry the
#      nivesh-workload-boundary, which it can't remove or edit (and no users, access keys or managed policies);
#   3. it never reads secret values (the ECS execution role does that at container start).

locals {
  workload_roles = [
    "arn:${local.partition}:iam::${local.account_id}:role/nivesh-demo-*",
    "arn:${local.partition}:iam::${local.account_id}:role/nivesh-jobs-*",
  ]
}

data "aws_iam_policy_document" "deploy" {
  statement {
    sid       = "StateBucketList"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.state.arn]
  }

  statement {
    sid       = "StateObjects"
    actions   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
    resources = ["${aws_s3_bucket.state.arn}/*"]
  }

  statement {
    sid = "DemoServicesInRegion"
    actions = [
      "ec2:*",
      "ecs:*",
      "ecr:*",
      "elasticloadbalancing:*",
      "rds:*",
      "logs:*",
      "cloudwatch:*",
      "application-autoscaling:*",
      "servicediscovery:*",
      "route53:*",
      "lambda:ListFunctions",
      "lambda:GetAccountSettings",
      "states:ListStateMachines",
      "scheduler:ListSchedules",
      "sns:GetTopicAttributes",
      "sns:ListTopics",
      "sns:ListSubscriptionsByTopic",
      "kms:DescribeKey",
      "acm:DescribeCertificate",
      "acm:ListCertificates",
      "acm:GetCertificate",
      "secretsmanager:DescribeSecret",
      "secretsmanager:GetResourcePolicy",
      "secretsmanager:ListSecrets",
      "tag:GetResources",
    ]
    resources = ["*"]

    condition {
      test     = "StringEquals"
      variable = "aws:RequestedRegion"
      values   = [var.region]
    }
  }

  # The demo and jobs stacks read the alert topic with `data "aws_sns_topic"`; AWS provider 6.x also reads its tags
  # (sns:ListTagsForResource), which the first live `apply` of the jobs stack was refused. Scoped to this one topic.
  statement {
    sid       = "AlertTopicRead"
    actions   = ["sns:GetTopicAttributes", "sns:ListTagsForResource"]
    resources = [aws_sns_topic.alerts.arn]
  }

  statement {
    sid     = "NightlyJobResources"
    actions = ["lambda:*", "states:*", "scheduler:*"]
    resources = [
      "arn:${local.partition}:lambda:${var.region}:${local.account_id}:function:nivesh-jobs-*",
      "arn:${local.partition}:states:${var.region}:${local.account_id}:stateMachine:nivesh-jobs-*",
      "arn:${local.partition}:states:${var.region}:${local.account_id}:execution:nivesh-jobs-*:*",
      "arn:${local.partition}:scheduler:${var.region}:${local.account_id}:schedule/*/nivesh-jobs-*",
      "arn:${local.partition}:scheduler:${var.region}:${local.account_id}:schedule-group/*",
    ]
  }

  # RDS creates and stores the database password itself (manage_master_user_password); it does that with the
  # caller's rights, on secrets named rds!...
  statement {
    sid = "RdsManagedPassword"
    actions = [
      "secretsmanager:CreateSecret",
      "secretsmanager:TagResource",
      "secretsmanager:RotateSecret",
      "secretsmanager:DeleteSecret",
      "secretsmanager:DescribeSecret",
    ]
    resources = ["arn:${local.partition}:secretsmanager:${var.region}:${local.account_id}:secret:rds!*"]
  }

  statement {
    sid = "WorkloadRolesNeedTheBoundary"
    actions = [
      "iam:CreateRole",
      "iam:PutRolePolicy",
      "iam:DeleteRolePolicy",
    ]
    resources = local.workload_roles

    condition {
      test     = "StringEquals"
      variable = "iam:PermissionsBoundary"
      values   = [aws_iam_policy.boundary.arn]
    }
  }

  statement {
    sid = "WorkloadRolesManage"
    actions = [
      "iam:GetRole",
      "iam:GetRolePolicy",
      "iam:ListRolePolicies",
      "iam:ListAttachedRolePolicies",
      "iam:ListInstanceProfilesForRole",
      "iam:ListRoleTags",
      "iam:TagRole",
      "iam:UntagRole",
      "iam:UpdateRole",
      "iam:UpdateRoleDescription",
      "iam:UpdateAssumeRolePolicy",
      "iam:DeleteRole",
    ]
    resources = local.workload_roles
  }

  statement {
    sid       = "PassWorkloadRolesToServices"
    actions   = ["iam:PassRole"]
    resources = local.workload_roles

    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values = [
        "ecs-tasks.amazonaws.com",
        "lambda.amazonaws.com",
        "states.amazonaws.com",
        "scheduler.amazonaws.com",
      ]
    }
  }

  statement {
    sid       = "ServiceLinkedRoles"
    actions   = ["iam:CreateServiceLinkedRole"]
    resources = ["*"]

    condition {
      test     = "StringEquals"
      variable = "iam:AWSServiceName"
      values = [
        "ecs.amazonaws.com",
        "elasticloadbalancing.amazonaws.com",
        "rds.amazonaws.com",
        "ecs.application-autoscaling.amazonaws.com",
      ]
    }
  }

  statement {
    sid       = "ReadTheBoundary"
    actions   = ["iam:GetPolicy", "iam:GetPolicyVersion"]
    resources = [aws_iam_policy.boundary.arn]
  }

  statement {
    sid    = "NeverWeakenOrEscape"
    effect = "Deny"
    actions = [
      "iam:DeleteRolePermissionsBoundary",
      "iam:PutRolePermissionsBoundary",
      "iam:AttachRolePolicy",
      "iam:CreatePolicy",
      "iam:CreatePolicyVersion",
      "iam:SetDefaultPolicyVersion",
      "iam:CreateUser",
      "iam:CreateAccessKey",
      "iam:CreateLoginProfile",
      "iam:UpdateLoginProfile",
      "iam:AddUserToGroup",
      "iam:AttachUserPolicy",
      "iam:PutUserPolicy",
    ]
    resources = ["*"]
  }
}
