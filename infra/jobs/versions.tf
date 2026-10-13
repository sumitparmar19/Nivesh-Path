# Nightly job stack (Phase 3, PR F): EventBridge Scheduler (weekdays 4:30 pm New York) -> Step Functions ->
# one small Lambda that calls the LIVE web service's token-only /internal/jobs API:
#   list held tickers -> save each one's daily close (2 at a time, paced, retried) -> overconcentration check
# for every user. Failures email the alert topic. AWS holds no database credentials and no Finnhub key: only
# the internal token, in the nivesh-path/jobs secret (created empty by infra/bootstrap, filled by Sumit).
# Always on, unlike infra/demo; costs cents a month. Applied by the "AWS jobs" workflow (aws-demo environment).
# State: s3://nivesh-path-tfstate-<account>/jobs/terraform.tfstate (bucket passed with -backend-config).
terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.60"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.8"
    }
  }

  backend "s3" {
    key          = "jobs/terraform.tfstate"
    region       = "us-east-1"
    use_lockfile = true
    encrypt      = true
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project   = var.project
      Stack     = "jobs"
      ManagedBy = "terraform"
    }
  }
}

data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}

locals {
  name         = "nivesh-jobs"
  account_id   = data.aws_caller_identity.current.account_id
  partition    = data.aws_partition.current.partition
  boundary_arn = "arn:${local.partition}:iam::${local.account_id}:policy/nivesh-workload-boundary"
}

data "aws_secretsmanager_secret" "jobs" {
  name = var.jobs_secret_name
}

data "aws_sns_topic" "alerts" {
  name = var.alerts_topic_name
}
