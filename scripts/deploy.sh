#!/bin/bash
# Deploy a released version to AWS. Usage: scripts/deploy.sh production <version>
#   1. the API image for <version> must already be in ECR (deploy.yml builds it; rollbacks reuse it)
#   2. register a new task definition revision with that image and roll the ECS service
#   3. wait for the service to be stable and the public /api/version to report <version>
#   4. publish web/ as it was at <version> to S3 and invalidate CloudFront
# If step 3 fails and there was a previous good revision, the service is put back on it.
# Needs AWS credentials and the repo variables written by ship-it-demo-infra:
#   ECR_REPOSITORY ECS_CLUSTER ECS_SERVICE ECS_TASK_FAMILY WEB_BUCKET CLOUDFRONT_ID CLOUDFRONT_DOMAIN
set -euo pipefail
env=${1:?environment}; version=${2:?version}
[[ "$env" == production ]] || { echo "unknown environment: $env" >&2; exit 1; }
for v in ECR_REPOSITORY ECS_CLUSTER ECS_SERVICE ECS_TASK_FAMILY WEB_BUCKET CLOUDFRONT_ID CLOUDFRONT_DOMAIN; do
  [[ -n "${!v:-}" ]] || { echo "missing $v" >&2; exit 1; }
done
region=${AWS_DEFAULT_REGION:-us-east-1}
registry="$(aws sts get-caller-identity --query Account --output text).dkr.ecr.$region.amazonaws.com"
image="$registry/$ECR_REPOSITORY:$version"

aws ecr describe-images --repository-name "$ECR_REPOSITORY" --image-ids imageTag="$version" >/dev/null \
  || { echo "image $image not found; build and push it first" >&2; exit 1; }

prev_arn=$(aws ecs describe-services --cluster "$ECS_CLUSTER" --services "$ECS_SERVICE" --query 'services[0].taskDefinition' --output text)
prev_image=$(aws ecs describe-task-definition --task-definition "$prev_arn" --query 'taskDefinition.containerDefinitions[0].image' --output text)

echo "registering task definition for $version"
new_def=$(aws ecs describe-task-definition --task-definition "$ECS_TASK_FAMILY" --query 'taskDefinition' \
  | jq --arg image "$image" --arg v "$version" '
      .containerDefinitions[0].image = $image
      | .containerDefinitions[0].environment = ([.containerDefinitions[0].environment[]? | select(.name != "APP_VERSION")] + [{name:"APP_VERSION", value:$v}])
      | del(.taskDefinitionArn, .revision, .status, .requiresAttributes, .compatibilities, .registeredAt, .registeredBy)')
new_arn=$(aws ecs register-task-definition --cli-input-json "$new_def" --query 'taskDefinition.taskDefinitionArn' --output text)

rollback() {
  if [[ "$prev_image" == *:placeholder ]]; then echo "no previous good revision (first deploy); leaving the service as is" >&2; return; fi
  echo "rolling the service back to $prev_arn" >&2
  aws ecs update-service --cluster "$ECS_CLUSTER" --service "$ECS_SERVICE" --task-definition "$prev_arn" >/dev/null
  aws ecs wait services-stable --cluster "$ECS_CLUSTER" --services "$ECS_SERVICE" || true
}

aws ecs update-service --cluster "$ECS_CLUSTER" --service "$ECS_SERVICE" --task-definition "$new_arn" --desired-count 1 >/dev/null
echo "waiting for the service to be stable"
if ! aws ecs wait services-stable --cluster "$ECS_CLUSTER" --services "$ECS_SERVICE"; then
  echo "service did not become stable" >&2; rollback; exit 1
fi

echo "smoke: https://$CLOUDFRONT_DOMAIN/api/version"
ok=
for _ in $(seq 1 30); do
  got=$(curl -fsS "https://$CLOUDFRONT_DOMAIN/api/version" 2>/dev/null | jq -r .version 2>/dev/null || true)
  [[ "$got" == "$version" ]] && { ok=1; break; }
  sleep 10
done
[[ -n "$ok" ]] || { echo "public API did not report $version (got '${got:-nothing}')" >&2; rollback; exit 1; }

tmp=$(mktemp -d)
git archive "$version" web | tar -x -C "$tmp"
aws s3 sync "$tmp/web" "s3://$WEB_BUCKET" --delete --cache-control "public,max-age=300" --exclude index.html >/dev/null
aws s3 cp "$tmp/web/index.html" "s3://$WEB_BUCKET/index.html" --cache-control "no-cache" >/dev/null
aws cloudfront create-invalidation --distribution-id "$CLOUDFRONT_ID" --paths '/*' >/dev/null
rm -rf "$tmp"

mkdir -p .deploy
printf '{"environment":"%s","version":"%s","task_definition":"%s","previous_task_definition":"%s","url":"https://%s","deployed_at":"%s"}\n' \
  "$env" "$version" "$new_arn" "$prev_arn" "$CLOUDFRONT_DOMAIN" "$(date -u +%FT%TZ)" | tee .deploy/production.json
