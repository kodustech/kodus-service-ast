#!/bin/bash

ENVIRONMENT=$1

KEYS=(
    "/prod/kodus-service-ast/NODE_ENV"
    "/prod/kodus-service-ast/API_NODE_ENV"
    "/prod/kodus-service-ast/API_LOG_PRETTY"
    "/prod/kodus-service-ast/API_LOG_LEVEL"
    "/prod/kodus-service-ast/CONTAINER_NAME"
    "/prod/kodus-service-ast/API_PORT"
    "/prod/kodus-service-ast/API_DATABASE_ENV"
    "/prod/kodus-service-ast/API_PG_DB_HOST"
    "/prod/kodus-service-ast/API_PG_DB_PORT"
    "/prod/kodus-service-ast/API_PG_DB_USERNAME"
    "/prod/kodus-service-ast/API_PG_DB_PASSWORD"
    "/prod/kodus-service-ast/API_PG_DB_DATABASE"
    "/prod/kodus-service-ast/API_PG_DB_SCHEMA"
    "/prod/kodus-service-ast/RABBIT_URL"
    "/prod/kodus-service-ast/RABBIT_RETRY_QUEUE"
    "/prod/kodus-service-ast/RABBIT_RETRY_TTL_MS"
    "/prod/kodus-service-ast/RABBIT_PREFETCH"
    "/prod/kodus-service-ast/RABBIT_PUBLISH_TIMEOUT_MS"
    "/prod/kodus-service-ast/RABBIT_SAC"
    "/prod/kodus-service-ast/S3_ENABLED"
    "/prod/kodus-service-ast/S3_BUCKET_NAME"
    "/prod/kodus-service-ast/AWS_REGION"
    "/prod/kodus-service-ast/SHARED_STORAGE_PATH"
)

ENV_FILE=".env.$ENVIRONMENT"

> "$ENV_FILE"

for KEY in "${KEYS[@]}"; do
  VALUE=$(aws ssm get-parameter --name "$KEY" --with-decryption --query "Parameter.Value" --output text 2>/dev/null)

  if [ -z "$VALUE" ] || [[ "$VALUE" == "ParameterNotFound" ]]; then
    echo "WARNING: Parâmetro $KEY não encontrado." >&2
  else
    echo "${KEY##*/}=$VALUE" >> "$ENV_FILE"
  fi
done
