#!/bin/bash
set -euo pipefail

# Function to display error messages and exit
abort() {
  echo "ERROR: $1" >&2
  exit 1
}

# Check arguments
if [ $# -lt 2 ]; then
  echo "Usage: $0 <environment> <github_sha>" >&2
  exit 1
fi

# Configuration
ENVIRONMENT=$1
SHA=$2

# Verify required environment variables
[[ -z "$REGISTRY_URL" ]] && abort "REGISTRY_URL environment variable is required"
[[ -z "$PROJECT_ID" ]] && abort "PROJECT_ID environment variable is required"
[[ -z "$ARTIFACT_REPO" ]] && abort "ARTIFACT_REPO environment variable is required"
[[ -z "$IMAGE_NAME" ]] && abort "IMAGE_NAME environment variable is required"

# Build the full image path
IMAGE="${REGISTRY_URL}/${PROJECT_ID}/${ARTIFACT_REPO}/${IMAGE_NAME}@sha256:${SHA}"
SERVICE_NAME="${IMAGE_NAME}"
COMPOSE_FILE="docker-compose.${ENVIRONMENT}.yml"

# Export variables for Docker Compose
export CONTAINER_NAME="${SERVICE_NAME}"
export IMAGE="${IMAGE}"
export IMAGE_NAME_PROD="${IMAGE}"

# Check if docker-compose file exists
[ ! -f "$COMPOSE_FILE" ] && abort "File $COMPOSE_FILE not found!"

# Configure Docker registry
if ! gcloud auth configure-docker ${REGISTRY_URL} --quiet >/dev/null 2>&1; then
  abort "Failed to configure Docker for registry"
fi

# Update image in compose file
sed -i "s|image:.*|image: ${IMAGE}|" "$COMPOSE_FILE"

# Fix .env file if it's a directory
ENV_FILE=".env.${ENVIRONMENT}"
[ -d "$ENV_FILE" ] && rm -rf "$ENV_FILE" && touch "$ENV_FILE"

# Deploy service
docker compose -f "$COMPOSE_FILE" pull --quiet
docker compose -f "$COMPOSE_FILE" down >/dev/null 2>&1 || true
docker compose -f "$COMPOSE_FILE" up -d >/dev/null 2>&1

# Verify service is running
sleep 3
if ! docker compose -f "$COMPOSE_FILE" ps | grep -q "Up"; then
  docker compose -f "$COMPOSE_FILE" logs
  abort "Service failed to start"
fi

echo "SUCCESS: Service $SERVICE_NAME deployed and running"
