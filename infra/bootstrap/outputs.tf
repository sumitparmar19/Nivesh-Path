# Printed at the end of the CloudShell bootstrap: the two role ARNs go into GitHub repository variables
# (AWS_ROLE_ARN, AWS_PLAN_ROLE_ARN); the rest is for reference. None of these is a secret.

output "AWS_ROLE_ARN" {
  description = "GitHub variable AWS_ROLE_ARN (deploy role, aws-demo environment only)."
  value       = aws_iam_role.deploy.arn
}

output "AWS_PLAN_ROLE_ARN" {
  description = "GitHub variable AWS_PLAN_ROLE_ARN (read-only plan role for pull requests)."
  value       = aws_iam_role.plan.arn
}

output "AWS_REGION" {
  description = "GitHub variable AWS_REGION."
  value       = var.region
}

output "state_bucket" {
  description = "Terraform state bucket (the workflows derive the same name from the account id)."
  value       = aws_s3_bucket.state.bucket
}

output "alerts_topic_arn" {
  description = "Alarm topic; confirm the subscription email AWS sent."
  value       = aws_sns_topic.alerts.arn
}

output "demo_secret_name" {
  description = "Fill its values in the Secrets Manager console before the first demo apply."
  value       = aws_secretsmanager_secret.demo.name
}

output "jobs_secret_name" {
  description = "Fill its values before the nightly job (PR F) is applied."
  value       = aws_secretsmanager_secret.jobs.name
}
