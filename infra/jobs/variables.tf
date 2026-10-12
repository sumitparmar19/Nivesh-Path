# Inputs for the nightly job. Defaults match the live site; the workflow passes none of them.

variable "region" {
  description = "AWS region (must match the bootstrap stack)."
  type        = string
  default     = "us-east-1"
}

variable "project" {
  description = "Project tag."
  type        = string
  default     = "nivesh-path"
}

variable "web_url" {
  description = "Public URL of the LIVE web service; the Lambda calls its /internal/jobs API with the token."
  type        = string
  default     = "https://nivesh-path-vzeak.ondigitalocean.app"

  validation {
    condition     = can(regex("^https://", var.web_url))
    error_message = "web_url must be an https:// URL (the internal token travels in a header)."
  }
}

variable "jobs_secret_name" {
  description = "Secrets Manager secret holding AI_INTERNAL_TOKEN (the live web service's value)."
  type        = string
  default     = "nivesh-path/jobs"
}

variable "alerts_topic_name" {
  description = "SNS topic for failure emails (created by infra/bootstrap)."
  type        = string
  default     = "nivesh-path-alerts"
}

variable "schedule_expression" {
  description = "When the job runs, in schedule_timezone. Weekdays 4:30 pm: half an hour after the US close."
  type        = string
  default     = "cron(30 16 ? * MON-FRI *)"
}

variable "schedule_timezone" {
  description = "Time zone of the schedule (daylight saving handled by EventBridge Scheduler)."
  type        = string
  default     = "America/New_York"
}

variable "snapshot_concurrency" {
  description = "Tickers fetched at the same time. Each call is one Finnhub quote; the free plan allows 60 a minute."
  type        = number
  default     = 2
}
