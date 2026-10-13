# The job's single Lambda (lambda/index.js): Node.js 22, no dependencies to bundle (fetch + the runtime's AWS
# SDK). Its role can write its own log group and read the jobs secret, nothing else (and it carries the boundary).

data "archive_file" "runner" {
  type        = "zip"
  source_file = "${path.module}/lambda/index.js"
  output_path = "${path.module}/build/runner.zip"
}

resource "aws_cloudwatch_log_group" "runner" {
  #checkov:skip=CKV_AWS_158:CloudWatch encrypts logs by default; a customer-managed KMS key adds cost. The Lambda logs no secrets.
  #checkov:skip=CKV_AWS_338:14 days is enough to debug a nightly job; longer retention costs more and keeps nothing useful.
  name              = "/aws/lambda/${local.name}-runner"
  retention_in_days = 14
}

data "aws_iam_policy_document" "lambda_trust" {
  statement {
    actions = ["sts:AssumeRole"]

    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [local.account_id]
    }
  }
}

resource "aws_iam_role" "runner" {
  name                 = "${local.name}-runner"
  description          = "Nightly job Lambda: write its logs, read the jobs secret."
  assume_role_policy   = data.aws_iam_policy_document.lambda_trust.json
  permissions_boundary = local.boundary_arn
}

data "aws_iam_policy_document" "runner" {
  statement {
    sid       = "OwnLogs"
    actions   = ["logs:CreateLogStream", "logs:PutLogEvents"]
    resources = ["${aws_cloudwatch_log_group.runner.arn}:*"]
  }

  statement {
    sid       = "ReadTheToken"
    actions   = ["secretsmanager:GetSecretValue"]
    resources = [data.aws_secretsmanager_secret.jobs.arn]
  }
}

resource "aws_iam_role_policy" "runner" {
  name   = "logs-and-token"
  role   = aws_iam_role.runner.id
  policy = data.aws_iam_policy_document.runner.json
}

resource "aws_lambda_function" "runner" {
  #checkov:skip=CKV_AWS_116:Step Functions is the caller: it retries and emails on failure, so a dead-letter queue adds nothing.
  #checkov:skip=CKV_AWS_117:Runs outside a VPC on purpose: it only calls the public web URL over HTTPS, and a VPC would need a NAT.
  #checkov:skip=CKV_AWS_173:The only environment values are the public web URL and the secret's name; the token itself is read from Secrets Manager.
  #checkov:skip=CKV_AWS_272:Code signing needs a signing profile and pipeline; the code is one reviewed file deployed by Terraform.
  #checkov:skip=CKV_AWS_50:X-Ray tracing adds cost for a once-a-day job; Step Functions keeps the execution history.
  #checkov:skip=CKV_AWS_115:Reserved concurrency can't be set on new accounts (minimum unreserved limit); Step Functions caps parallel calls at snapshot_concurrency.
  function_name    = "${local.name}-runner"
  description      = "Nightly job: calls the live web service's /internal/jobs API (list tickers, save closes, concentration check)."
  role             = aws_iam_role.runner.arn
  runtime          = "nodejs22.x"
  handler          = "index.handler"
  filename         = data.archive_file.runner.output_path
  source_code_hash = data.archive_file.runner.output_base64sha256
  timeout          = 30
  memory_size      = 128
  architectures    = ["arm64"]

  environment {
    variables = {
      WEB_URL         = var.web_url
      TOKEN_SECRET_ID = data.aws_secretsmanager_secret.jobs.name
    }
  }

  depends_on = [aws_cloudwatch_log_group.runner, aws_iam_role_policy.runner]
}
