#!/bin/bash

ENVIRONMENT=$1

KEYS=(
    "/prod/kodus-orchestrator/API_PG_DB_HOST"
    "/prod/kodus-orchestrator/API_PG_DB_PORT"
    "/prod/kodus-orchestrator/API_PG_DB_USERNAME"
    "/prod/kodus-orchestrator/API_PG_DB_PASSWORD"
    "/prod/kodus-orchestrator/API_PG_DB_DATABASE"
    "/prod/kodus-service-ast/RABBIT_URL"
    "/prod/kodus-service-ast/S3_ENABLED"
    "/prod/kodus-service-ast/S3_BUCKET_NAME"
    "/prod/kodus-service-ast/AWS_REGION"
    "/prod/kodus-service-ast/SHARED_STORAGE_PATH"
)

ENV_FILE=".env.$ENVIRONMENT"

> "$ENV_FILE"

quote_env_value() {
  local value="$1"
  if [[ ! "$value" =~ [[:space:]#\$] ]]; then
    printf "%s" "$value"
    return
  fi

  if [[ "$value" != *"'"* ]]; then
    printf "'%s'" "$value"
    return
  fi

  if [[ "$value" != *'"'* ]]; then
    printf "\"%s\"" "$value"
    return
  fi

  printf "%s" "$value"
}

for KEY in "${KEYS[@]}"; do
  VALUE=$(aws ssm get-parameter --name "$KEY" --with-decryption --query "Parameter.Value" --output text 2>/dev/null)

  if [ -z "$VALUE" ] || [[ "$VALUE" == "ParameterNotFound" ]]; then
    echo "WARNING: Parâmetro $KEY não encontrado." >&2
  else
    FORMATTED_VALUE=$(quote_env_value "$VALUE")
    printf '%s=%s\n' "${KEY##*/}" "$FORMATTED_VALUE" >> "$ENV_FILE"
  fi
done

cat <<'EOF' >> "$ENV_FILE"
NODE_ENV=production
API_NODE_ENV=production
API_LOG_PRETTY=true
API_LOG_LEVEL=info
API_PORT=3002
API_DATABASE_ENV=production
API_PG_DB_SCHEMA=kodus_workflow
CONTAINER_NAME=kodus-service-ast
RABBIT_RETRY_QUEUE=ast.jobs.retry.q
RABBIT_RETRY_TTL_MS=60000
RABBIT_PREFETCH=1
RABBIT_PUBLISH_TIMEOUT_MS=5000
RABBIT_SAC=false
EOF
