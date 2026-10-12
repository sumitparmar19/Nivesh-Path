# Long-lived pieces the demo and jobs stacks look up by name: two secrets (created EMPTY: Sumit types the values in
# the console, so they never reach Terraform state or Git) and the alert topic with Sumit's email subscribed once.

resource "aws_secretsmanager_secret" "demo" {
  #checkov:skip=CKV_AWS_149:The AWS-managed key (aws/secretsmanager) encrypts it; a customer-managed key adds cost and nothing here needs one.
  #checkov:skip=CKV2_AWS_57:Values are typed by hand; rotation would need a Lambda per key and the demo stack is short-lived.
  name                    = "${var.project}/demo"
  description             = "AWS demo stack (infra/demo). JSON keys: MONGO_URL, JWT_SECRET, FINNHUB_API_KEY, ANTHROPIC_API_KEY, AI_INTERNAL_TOKEN. Filled in by hand."
  recovery_window_in_days = 7
}

resource "aws_secretsmanager_secret" "jobs" {
  #checkov:skip=CKV_AWS_149:The AWS-managed key (aws/secretsmanager) encrypts it; a customer-managed key adds cost and nothing here needs one.
  #checkov:skip=CKV2_AWS_57:Values are typed by hand; rotation would need a Lambda per key.
  name                    = "${var.project}/jobs"
  description             = "Nightly job (infra/jobs, PR F). JSON keys: AI_INTERNAL_TOKEN (the live site's), FINNHUB_API_KEY. No database credentials. Filled in by hand."
  recovery_window_in_days = 7
}

resource "aws_sns_topic" "alerts" {
  #checkov:skip=CKV_AWS_26:CloudWatch alarms cannot publish to a topic encrypted with the AWS-managed SNS key; a customer-managed key adds $1/month. Messages carry alarm names and numbers, no user data.
  name = "${var.project}-alerts"
}

resource "aws_sns_topic_subscription" "alert_email" {
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}
