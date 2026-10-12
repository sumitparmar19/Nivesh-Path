# GitHub Actions signs in to AWS with short-lived OIDC tokens: no AWS access keys exist anywhere. Two roles, because
# GitHub's token for an environment job ("...:environment:aws-demo") doesn't say which branch it ran on, and a pull
# request job can't use the environment at all ("...:pull_request"):
#   github-nivesh-deploy  - only jobs in the aws-demo environment (GitHub limits it to main + Sumit's approval);
#                           can change the demo/jobs stacks, but every role it creates is capped by the boundary below.
#   github-nivesh-plan    - pull request jobs; read-only, for `terraform plan` comments. Cannot read secret values.
# Neither name starts with "nivesh-demo-"/"nivesh-jobs-", so the deploy role can't edit itself or its sibling.

resource "aws_iam_openid_connect_provider" "github" {
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
}

locals {
  oidc_host = "token.actions.githubusercontent.com"
}

data "aws_iam_policy_document" "trust_deploy" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "${local.oidc_host}:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "${local.oidc_host}:sub"
      values   = ["repo:${var.github_repository}:environment:${var.deploy_environment}"]
    }
  }
}

data "aws_iam_policy_document" "trust_plan" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]

    principals {
      type        = "Federated"
      identifiers = [aws_iam_openid_connect_provider.github.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "${local.oidc_host}:aud"
      values   = ["sts.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "${local.oidc_host}:sub"
      values   = ["repo:${var.github_repository}:pull_request"]
    }
  }
}

resource "aws_iam_role" "deploy" {
  #checkov:skip=CKV2_NIVESH_1:Created once by Sumit (admin) in CloudShell; the boundary is for roles the deploy role creates.
  name                 = "github-nivesh-deploy"
  description          = "GitHub Actions, aws-demo environment only: apply/deploy/destroy the demo and jobs stacks."
  assume_role_policy   = data.aws_iam_policy_document.trust_deploy.json
  max_session_duration = 7200
}

resource "aws_iam_role_policy" "deploy" {
  name   = "deploy-demo-and-jobs"
  role   = aws_iam_role.deploy.id
  policy = data.aws_iam_policy_document.deploy.json
}

resource "aws_iam_role" "plan" {
  #checkov:skip=CKV2_NIVESH_1:Created once by Sumit (admin) in CloudShell; the boundary is for roles the deploy role creates.
  name               = "github-nivesh-plan"
  description        = "GitHub Actions, pull requests only: read-only, for terraform plan comments."
  assume_role_policy = data.aws_iam_policy_document.trust_plan.json
}

resource "aws_iam_role_policy_attachment" "plan_read_only" {
  role       = aws_iam_role.plan.name
  policy_arn = "arn:${local.partition}:iam::aws:policy/ReadOnlyAccess"
}

# ReadOnlyAccess can describe everything but must not read data: secret values, parameters, decrypt, or objects
# outside the state bucket.
data "aws_iam_policy_document" "plan_no_data" {
  statement {
    sid    = "NoSecretOrDataReads"
    effect = "Deny"
    actions = [
      "secretsmanager:GetSecretValue",
      "ssm:GetParameter",
      "ssm:GetParameters",
      "ssm:GetParametersByPath",
      "kms:Decrypt",
      "lambda:GetFunction",
      "logs:GetLogEvents",
      "logs:FilterLogEvents",
      "logs:StartQuery",
    ]
    resources = ["*"]
  }

  statement {
    sid           = "NoObjectReadsOutsideState"
    effect        = "Deny"
    actions       = ["s3:GetObject", "s3:GetObjectVersion"]
    not_resources = ["${aws_s3_bucket.state.arn}/*"]
  }
}

resource "aws_iam_role_policy" "plan_no_data" {
  name   = "no-data-reads"
  role   = aws_iam_role.plan.id
  policy = data.aws_iam_policy_document.plan_no_data.json
}
