#!/bin/bash

set -euo pipefail

ENVIRONMENT=${1:-}
GITHUB_SHA=${2:-}
GITHUB_REF=${3:-}

if [ -z "$ENVIRONMENT" ] || [ -z "$GITHUB_SHA" ] || [ -z "$GITHUB_REF" ]; then
  echo "Usage: $0 <qa|prod> <github_sha> <github_ref>" >&2
  exit 1
fi

AWS_REGION=${AWS_REGION:-${AWS_DEFAULT_REGION:-us-east-1}}
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_REGISTRY="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com"
ECR_REPOSITORY="kodus-service-ast-${ENVIRONMENT}"
IMAGE_TAG="$GITHUB_SHA"
IMAGE_NAME="${ECR_REGISTRY}/${ECR_REPOSITORY}:${IMAGE_TAG}"

export CONTAINER_NAME="kodus-service-ast-${ENVIRONMENT}-${GITHUB_SHA}"
export IMAGE_NAME
export IMAGE_NAME_PROD="$IMAGE_NAME"

aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$ECR_REGISTRY"

if [ "$ENVIRONMENT" == "qa" ]; then
  ./fetch-env-qa.sh "$ENVIRONMENT"
elif [ "$ENVIRONMENT" == "prod" ]; then
  ./fetch-env-prod.sh "$ENVIRONMENT"
else
  echo "Invalid environment: $ENVIRONMENT (expected qa or prod)" >&2
  exit 1
fi

docker compose -f docker-compose."$ENVIRONMENT".yml up -d --force-recreate

docker system prune -f -a
