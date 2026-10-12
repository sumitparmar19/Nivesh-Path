#!/usr/bin/env bash
# Build-and-deploy for the AWS demo stack (infra/demo), run by the "AWS demo" workflows after `terraform apply`:
#   1. build the web and ai images for this commit and push them to ECR (skipped if that tag already exists);
#   2. register a new "migrate" task revision with the new web image and run it: `prisma migrate deploy` on RDS;
#      stop here if it fails, so the services never run code ahead of their database;
#   3. register new web/ai task revisions with the new images and roll both services, then wait until stable;
#   4. check /health and /api/status through the load balancer.
# Every new revision starts from the family's LATEST revision, so changes Terraform made (env vars, sizes) carry over.
# Needs: AWS credentials (OIDC deploy role), docker, jq, and TF_DIR pointing at an initialised infra/demo.
set -euo pipefail

TF_DIR=${TF_DIR:-infra/demo}
TAG=${IMAGE_TAG:-${GITHUB_SHA:?set IMAGE_TAG or GITHUB_SHA}}
OUT=$(terraform -chdir="$TF_DIR" output -json)
o() { jq -r "$1" <<<"$OUT"; }

CLUSTER=$(o '.cluster.value')
WEB_REPO=$(o '.ecr_repositories.value.web')
AI_REPO=$(o '.ecr_repositories.value.ai')
REGISTRY=${WEB_REPO%%/*}
SUBNETS=$(o '.task_subnets.value | join(",")')
WEB_SG=$(o '.web_security_group.value')
APP_URL=$(o '.app_url.value')

echo "::group::Images ($TAG)"
aws ecr get-login-password | docker login --username AWS --password-stdin "$REGISTRY"
push() { # repo context [dockerfile dir]
  local repo=$1 context=$2 name=${1#*/}
  if aws ecr describe-images --repository-name "$name" --image-ids imageTag="$TAG" >/dev/null 2>&1; then
    echo "$repo:$TAG already in ECR"
  else
    docker build --pull -t "$repo:$TAG" "$context"
    docker push "$repo:$TAG"
  fi
}
push "$WEB_REPO" .
push "$AI_REPO" ai-service
echo "::endgroup::"

# New revision of a task family with its (single) container's image replaced; prints the new ARN.
register() {
  local family=$1 image=$2
  aws ecs describe-task-definition --task-definition "$family" --include TAGS --output json |
    jq --arg img "$image" '.tags as $tags
      | .taskDefinition
      | del(.taskDefinitionArn, .revision, .status, .requiresAttributes, .compatibilities, .registeredAt, .registeredBy, .deregisteredAt)
      | .containerDefinitions[0].image = $img
      | if ($tags | length) > 0 then . + {tags: $tags} else . end' >/tmp/taskdef.json
  aws ecs register-task-definition --cli-input-json file:///tmp/taskdef.json --query taskDefinition.taskDefinitionArn --output text
}

echo "::group::Database migrations"
MIGRATE_TD=$(register "$(o '.task_families.value.migrate')" "$WEB_REPO:$TAG")
TASK=$(aws ecs run-task --cluster "$CLUSTER" --launch-type FARGATE --task-definition "$MIGRATE_TD" \
  --network-configuration "awsvpcConfiguration={subnets=[$SUBNETS],securityGroups=[$WEB_SG],assignPublicIp=ENABLED}" \
  --query 'tasks[0].taskArn' --output text)
echo "Migration task: $TASK"
aws ecs wait tasks-stopped --cluster "$CLUSTER" --tasks "$TASK"
EXIT_CODE=$(aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$TASK" --query 'tasks[0].containers[0].exitCode' --output text)
aws logs tail "$(o '.migrate_log_group.value')" --since 30m --format short || true
if [ "$EXIT_CODE" != "0" ]; then
  REASON=$(aws ecs describe-tasks --cluster "$CLUSTER" --tasks "$TASK" --query 'tasks[0].stoppedReason' --output text)
  echo "::error::Migration failed (exit code $EXIT_CODE: $REASON). The services were not changed."
  exit 1
fi
echo "::endgroup::"

echo "::group::Roll out web and ai"
AI_TD=$(register "$(o '.task_families.value.ai')" "$AI_REPO:$TAG")
WEB_TD=$(register "$(o '.task_families.value.web')" "$WEB_REPO:$TAG")
aws ecs update-service --cluster "$CLUSTER" --service ai --task-definition "$AI_TD" --query 'service.serviceName' --output text
aws ecs update-service --cluster "$CLUSTER" --service web --task-definition "$WEB_TD" --query 'service.serviceName' --output text
aws ecs wait services-stable --cluster "$CLUSTER" --services ai web
echo "::endgroup::"

echo "::group::Smoke check through the load balancer"
for _ in $(seq 1 20); do
  if curl -sf "$APP_URL/health" >/dev/null; then break; fi
  sleep 6
done
curl -sf "$APP_URL/health"
echo
curl -sf "$APP_URL/api/status" | jq '{web, db, ledger, ai: {reachable: .ai.reachable, model: .ai.model}, platform}'
echo "::endgroup::"
echo "Deployed $TAG -> $APP_URL"
