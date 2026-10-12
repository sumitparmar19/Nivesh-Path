# Demo stack (Phase 3, PR E): the whole app on AWS - VPC, ALB, ECS Fargate (web + ai), RDS Postgres, ECR,
# CloudWatch dashboard and alarms. Created for demos and load tests, then destroyed; DigitalOcean stays the live site.
# Applied only by GitHub Actions (aws-demo environment, Sumit approves), with OIDC: see docs/AWS.md.
# State: s3://nivesh-path-tfstate-<account>/demo/terraform.tfstate (bucket passed with -backend-config).
terraform {
  required_version = ">= 1.10"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.60"
    }
  }

  backend "s3" {
    key          = "demo/terraform.tfstate"
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
      Stack     = "demo"
      ManagedBy = "terraform"
    }
  }
}

data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}

data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  name       = "nivesh-demo"
  account_id = data.aws_caller_identity.current.account_id
  partition  = data.aws_partition.current.partition
  azs        = slice(data.aws_availability_zones.available.names, 0, 2)
  # Created by infra/bootstrap; looked up by name so this stack never stores their values.
  boundary_arn = "arn:${local.partition}:iam::${local.account_id}:policy/nivesh-workload-boundary"
  https        = var.certificate_arn != ""
  base_url     = "${local.https ? "https" : "http"}://${aws_lb.main.dns_name}"
}

data "aws_secretsmanager_secret" "app" {
  name = var.app_secret_name
}

data "aws_sns_topic" "alerts" {
  name = var.alerts_topic_name
}
