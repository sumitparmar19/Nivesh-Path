#!/usr/bin/env bash
# One-time AWS bootstrap, run by Sumit in AWS CloudShell (browser only; docs/AWS.md, step B2):
#   1. installs Terraform 1.15.9 into ~/bin (HashiCorp's zip, checked against the SHA-256 below; CloudShell has none);
#   2. applies infra/bootstrap: state bucket, GitHub OIDC + two roles, permissions boundary, 2 empty secrets, alert topic
#      (Terraform shows the plan and waits for "yes");
#   3. moves this stack's own state into the new bucket, so nothing important lives only in CloudShell;
#   4. prints the values for GitHub (AWS_ROLE_ARN, AWS_PLAN_ROLE_ARN, AWS_REGION).
# Safe to run again, from any region's CloudShell: once the state is in its bucket it just re-applies against it.
set -euo pipefail

# Everything goes to us-east-1 (docs/AWS.md B1). CloudShell sets AWS_REGION to the console's region, so a session
# opened from another region would build the bootstrap there (it happened once, in us-east-2): refuse instead.
REGION=${AWS_REGION:-us-east-1}
if [ "$REGION" != "us-east-1" ]; then
  echo "This CloudShell is in $REGION, but Nivesh-Path's AWS stacks live in us-east-1." >&2
  echo "Switch the console to US East (N. Virginia) and open CloudShell again, or run:" >&2
  echo "  AWS_REGION=us-east-1 bash ~/Nivesh-Path/infra/bootstrap/cloudshell.sh" >&2
  exit 1
fi

# CloudShell's home folder holds only 1 GB, and the AWS provider alone is several hundred MB: keep Terraform's
# working data (.terraform: providers, modules) in /tmp. It is re-downloaded by `terraform init` on every run.
export TF_DATA_DIR=${TF_DATA_DIR:-/tmp/tf-bootstrap}

TF_VERSION=1.15.9
case "$(uname -m)" in
  x86_64) ARCH=amd64 SUM=76edd0b22d2f27d3d2e097cd793209646f719cf60f02ff3af626b07361137da1 ;;
  aarch64) ARCH=arm64 SUM=0afa6c29f61ca5ea270e950e43e50ecf2418b598507bf580e8ae76e1e6699b19 ;;
  *) echo "Unsupported CPU: $(uname -m)"; exit 1 ;;
esac

mkdir -p "$HOME/bin"
export PATH="$HOME/bin:$PATH"
if ! terraform version 2>/dev/null | grep -q "v$TF_VERSION"; then
  ZIP="terraform_${TF_VERSION}_linux_${ARCH}.zip"
  curl -sSfL -o "/tmp/$ZIP" "https://releases.hashicorp.com/terraform/${TF_VERSION}/${ZIP}"
  echo "$SUM  /tmp/$ZIP" | sha256sum -c -
  unzip -o -q "/tmp/$ZIP" terraform -d "$HOME/bin"
  rm -f "/tmp/$ZIP"
fi
terraform version

cd "$(dirname "$0")"

write_backend() {
  cat > backend.tf <<BACKEND
# Written by cloudshell.sh: this stack's state lives in the bucket the first apply created.
terraform {
  backend "s3" {
    bucket       = "$1"
    key          = "bootstrap/terraform.tfstate"
    region       = "$REGION"
    use_lockfile = true
    encrypt      = true
  }
}
BACKEND
}

# backend.tf exists only in the CloudShell where the first run happened (each region's CloudShell has its own home
# folder). If it's missing here but the bootstrap's state is already in its bucket, point at that state instead of
# starting over, which would try to create everything a second time.
if [ ! -f backend.tf ]; then
  ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
  EXISTING="nivesh-path-tfstate-$ACCOUNT" # versions.tf: "${var.project}-tfstate-${account}", project = nivesh-path
  if aws s3api head-object --bucket "$EXISTING" --key bootstrap/terraform.tfstate --region "$REGION" >/dev/null 2>&1; then
    echo "Found the bootstrap state in s3://$EXISTING; using it."
    write_backend "$EXISTING"
  fi
fi

if [ ! -f backend.tf ]; then
  read -r -p "Email address for alarm emails: " ALERT_EMAIL
  terraform init -input=false
  terraform apply -var "alert_email=$ALERT_EMAIL" -var "region=$REGION"
  write_backend "$(terraform output -raw state_bucket)"
  terraform init -input=false -migrate-state -force-copy
  rm -f terraform.tfstate terraform.tfstate.backup
  echo "Saved the bootstrap state to s3://$(terraform output -raw state_bucket)/bootstrap/terraform.tfstate"
else
  terraform init -input=false
  terraform apply -var "region=$REGION"
fi

echo
echo "=== Copy these three into GitHub -> Settings -> Secrets and variables -> Actions -> Variables ==="
echo "AWS_ROLE_ARN      = $(terraform output -raw AWS_ROLE_ARN)"
echo "AWS_PLAN_ROLE_ARN = $(terraform output -raw AWS_PLAN_ROLE_ARN)"
echo "AWS_REGION        = $(terraform output -raw AWS_REGION)"
echo "Then confirm the subscription email from AWS Notifications, and fill the secret $(terraform output -raw demo_secret_name)."
