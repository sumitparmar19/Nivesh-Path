# Inputs for the bootstrap stack. Only alert_email has no default: CloudShell asks for it.

variable "region" {
  description = "AWS region for every stack (the GitHub variable AWS_REGION must match)."
  type        = string
  default     = "us-east-1"
}

variable "project" {
  description = "Name prefix and Project tag."
  type        = string
  default     = "nivesh-path"
}

variable "github_repository" {
  description = "The only repository whose workflows may sign in, as GitHub writes it in the OIDC subject (case-sensitive). The repository sends the ID-based form owner@owner_id/name@repo_id, so a deleted and re-created repository with the same name can't sign in."
  type        = string
  default     = "sumitparmar19@159940528/Nivesh-Path@1440470058"
}

variable "deploy_environment" {
  description = "GitHub environment whose jobs may use the deploy role (restricted to main + the owner's approval in GitHub)."
  type        = string
  default     = "aws-demo"
}

variable "alert_email" {
  description = "Where CloudWatch alarms and failed nightly jobs are emailed (AWS sends a confirmation link first)."
  type        = string

  validation {
    condition     = can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", var.alert_email))
    error_message = "alert_email must be an email address."
  }
}
