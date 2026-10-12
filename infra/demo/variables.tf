# Inputs for the demo stack. Defaults are the sizes described in docs/AWS.md; the workflows pass none of them,
# except image_tag, which is only a starting value (the deploy workflow registers new task revisions itself).

variable "region" {
  description = "AWS region (must match the bootstrap stack)."
  type        = string
  default     = "us-east-1"
}

variable "project" {
  description = "Project tag and secret/topic prefix."
  type        = string
  default     = "nivesh-path"
}

variable "app_secret_name" {
  description = "Secrets Manager secret with the app keys (created empty by infra/bootstrap, filled by Sumit)."
  type        = string
  default     = "nivesh-path/demo"
}

variable "alerts_topic_name" {
  description = "SNS topic for alarm emails (created by infra/bootstrap)."
  type        = string
  default     = "nivesh-path-alerts"
}

variable "vpc_cidr" {
  description = "Address range of the demo VPC."
  type        = string
  default     = "10.20.0.0/16"
}

variable "image_tag" {
  description = "Image tag in the first task definitions. Deploys replace it (infra/scripts/deploy.sh)."
  type        = string
  default     = "initial"
}

variable "web_cpu" {
  description = "Web task CPU units (256 = 0.25 vCPU)."
  type        = number
  default     = 256
}

variable "web_memory" {
  description = "Web task memory (MiB)."
  type        = number
  default     = 512
}

variable "ai_cpu" {
  description = "AI task CPU units (512 = 0.5 vCPU)."
  type        = number
  default     = 512
}

variable "ai_memory" {
  description = "AI task memory (MiB): FastAPI + ChromaDB."
  type        = number
  default     = 1024
}

variable "web_min_tasks" {
  description = "Fewest web tasks."
  type        = number
  default     = 1
}

variable "web_max_tasks" {
  description = "Most web tasks when CPU is high."
  type        = number
  default     = 3
}

variable "web_cpu_target" {
  description = "Average web CPU (%) the autoscaler aims for."
  type        = number
  default     = 60
}

variable "db_instance_class" {
  description = "RDS instance size."
  type        = string
  default     = "db.t4g.micro"
}

variable "certificate_arn" {
  description = "An ISSUED ACM certificate for aws.<domain>. Empty = HTTP only (stated in docs/AWS.md)."
  type        = string
  default     = ""
}
