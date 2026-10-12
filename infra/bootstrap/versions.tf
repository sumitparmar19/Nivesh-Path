# Bootstrap stack (Phase 3, PR E): the few AWS resources everything else depends on. Sumit runs it once in AWS
# CloudShell (docs/AWS.md, "Bootstrap"); its state starts local and is then moved into the bucket it creates.
# It is never destroyed by the demo workflows: the state bucket, GitHub's sign-in (OIDC) and two roles, the
# permissions boundary for every role the stacks create, two empty secrets and the alert topic.
terraform {
  required_version = ">= 1.10" # native S3 state locking (use_lockfile)

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 6.60"
    }
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project   = var.project
      Stack     = "bootstrap"
      ManagedBy = "terraform"
    }
  }
}

data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}

locals {
  account_id   = data.aws_caller_identity.current.account_id
  partition    = data.aws_partition.current.partition
  state_bucket = "${var.project}-tfstate-${local.account_id}"
}
