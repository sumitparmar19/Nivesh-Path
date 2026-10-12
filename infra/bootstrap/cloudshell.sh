#!/usr/bin/env bash
# One-time AWS bootstrap, run by Sumit in AWS CloudShell (browser only; docs/AWS.md, step B2):
#   1. installs Terraform 1.15.9 into ~/bin (HashiCorp's zip, checked against the SHA-256 below; CloudShell has none);
#   2. applies infra/bootstrap: state bucket, GitHub OIDC + two roles, permissions boundary, 2 empty secrets, alert topic
#      (Terraform shows the plan and waits for "yes");
#   3. moves this stack's own state into the new bucket, so nothing important lives only in CloudShell;
#   4. prints the values for GitHub (AWS_ROLE_ARN, AWS_PLAN_ROLE_ARN, AWS_REGION).
# Safe to run again: once backend.tf exists it just re-applies against the bucket.
set -euo pipefail

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
REGION=${AWS_REGION:-us-east-1}

if [ ! -f backend.tf ]; then
  read -r -p "Email address for alarm emails: " ALERT_EMAIL
  terraform init -input=false
  terraform apply -var "alert_email=$ALERT_EMAIL" -var "region=$REGION"
  BUCKET=$(terraform output -raw state_bucket)
  cat > backend.tf <<BACKEND
# Written by cloudshell.sh after the first apply: this stack's state lives in the bucket it created.
terraform {
  backend "s3" {
    bucket       = "$BUCKET"
    key          = "bootstrap/terraform.tfstate"
    region       = "$REGION"
    use_lockfile = true
    encrypt      = true
  }
}
BACKEND
  terraform init -input=false -migrate-state -force-copy
  rm -f terraform.tfstate terraform.tfstate.backup
  echo "Saved the bootstrap state to s3://$BUCKET/bootstrap/terraform.tfstate"
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
