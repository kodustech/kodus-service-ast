#!/bin/bash

ENVIRONMENT=$1

KEYS=(
    "/qa/kodus-service-ast/NODE_ENV"
    "/qa/kodus-service-ast/API_NODE_ENV"
    "/qa/kodus-service-ast/API_LOG_PRETTY"
    "/qa/kodus-service-ast/API_LOG_LEVEL"
    "/qa/kodus-service-ast/CONTAINER_NAME"
    "/qa/kodus-service-ast/API_PORT"
    "/qa/kodus-service-ast/API_DATABASE_ENV"
    "/qa/kodus-service-ast/API_PG_DB_HOST"
    "/qa/kodus-service-ast/API_PG_DB_PORT"
    "/qa/kodus-service-ast/API_PG_DB_USERNAME"
    "/qa/kodus-service-ast/API_PG_DB_PASSWORD"
    "/qa/kodus-service-ast/API_PG_DB_DATABASE"
    "/qa/kodus-service-ast/API_PG_DB_SCHEMA"
    "/qa/kodus-service-ast/RABBIT_URL"
    "/qa/kodus-service-ast/RABBIT_RETRY_QUEUE"
    "/qa/kodus-service-ast/RABBIT_RETRY_TTL_MS"
    "/qa/kodus-service-ast/RABBIT_PREFETCH"
    "/qa/kodus-service-ast/RABBIT_PUBLISH_TIMEOUT_MS"
    "/qa/kodus-service-ast/RABBIT_SAC"
    "/qa/kodus-service-ast/LANGCHAIN_TRACING_V2"
    "/qa/kodus-service-ast/LANGCHAIN_ENDPOINT"
    "/qa/kodus-service-ast/LANGCHAIN_HUB_API_URL"
    "/qa/kodus-service-ast/LANGCHAIN_API_KEY"
    "/qa/kodus-service-ast/LANGCHAIN_PROJECT"
    "/qa/kodus-service-ast/LANGCHAIN_CALLBACKS_BACKGROUND"
    "/qa/kodus-service-ast/S3_ENABLED"
    "/qa/kodus-service-ast/S3_BUCKET_NAME"
    "/qa/kodus-service-ast/AWS_REGION"
    "/qa/kodus-service-ast/SHARED_STORAGE_PATH"
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
