#!/bin/sh
set -eu

# Default heap size based on common memory configurations
# Calculated as: (Task Memory × 0.75) - 512MB buffer
# Default is for 2GB task memory (1024MB heap)
# Override via NODE_MAX_OLD_SPACE_SIZE env var in Task Definition
: "${NODE_MAX_OLD_SPACE_SIZE:=3072}"

export NODE_OPTIONS="--max-old-space-size=${NODE_MAX_OLD_SPACE_SIZE} --expose-gc ${NODE_OPTIONS:-}"

echo "[worker] NODE_OPTIONS=${NODE_OPTIONS}"
exec node dist/worker/main.js
