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
  description = "owner/name of the only repository whose workflows may sign in (case-sensitive, as GitHub sends it)."
  type        = string
  default     = "sumitparmar19/Nivesh-Path"
}

variable "deploy_environment" {
  description = "GitHub environment whose jobs may use the deploy role (restricted to main + Sumit's approval in GitHub)."
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
