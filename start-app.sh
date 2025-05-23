#!/bin/bash

# Script para iniciar o serviço AST usando Docker Compose
# Uso: ./start-app.sh [ambiente] [imagem_completa] [ref]

set -e

# Verificar argumentos
if [ $# -lt 2 ]; then
  echo "Uso: $0 <ambiente> <imagem_completa> [ref]" >&2
  echo "  ambiente: 'qa' ou 'prod'" >&2
  echo "  imagem_completa: Caminho completo da imagem (incluindo tag)" >&2
  echo "  ref: Referência opcional do GitHub" >&2
  exit 1
fi

ENVIRONMENT=$1
IMAGE=$2
REF=$3

# Diretório do aplicativo
APP_DIR="$HOME/kodus-service-ast"
ENV_FILE="$APP_DIR/.env.$ENVIRONMENT"
COMPOSE_FILE="$APP_DIR/docker-compose.$ENVIRONMENT.yml"
CONTAINER_NAME="kodus-service-ast-$ENVIRONMENT"

# Verificar se os arquivos necessários existem
if [ ! -f "$ENV_FILE" ]; then
  echo "Arquivo de ambiente $ENV_FILE não encontrado!" >&2
  exit 1
fi

if [ ! -f "$COMPOSE_FILE" ]; then
  echo "Arquivo docker-compose $COMPOSE_FILE não encontrado!" >&2
  exit 1
fi

echo "=== Iniciando deploy para $ENVIRONMENT ==="
echo "Imagem: $IMAGE"

# Autenticar no Artifact Registry se necessário
if ! gcloud auth print-access-token | docker login -u oauth2accesstoken --password-stdin "$(echo $IMAGE | cut -d'/' -f1)" > /dev/null 2>&1; then
  echo "Falha na autenticação com o Artifact Registry" >&2
  exit 1
fi

# Parar e remover o container existente, se houver
echo "Parando serviços existentes..."
docker-compose -f "$COMPOSE_FILE" down 2>/dev/null || true

# Puxar a nova imagem
echo "Puxando nova imagem..."
docker pull $IMAGE

# Exportar variáveis para docker-compose
export IMAGE_NAME=$IMAGE
export CONTAINER_NAME=$CONTAINER_NAME

if [ "$ENVIRONMENT" = "prod" ]; then
  export IMAGE_NAME_PROD=$IMAGE
fi

# Iniciar com docker-compose
echo "Iniciando serviços com Docker Compose..."
docker-compose -f "$COMPOSE_FILE" up -d

# Verificar se o container está rodando
if ! docker ps | grep -q $CONTAINER_NAME; then
  echo "Falha ao iniciar o container!" >&2
  echo "Logs do container:" >&2
  docker-compose -f "$COMPOSE_FILE" logs >&2
  exit 1
fi

# Limpar imagens antigas
echo "Limpando imagens antigas..."
docker image prune -af --filter "until=24h" > /dev/null

echo "=== Deploy concluído com sucesso ==="
echo "Container $CONTAINER_NAME está rodando com a imagem $IMAGE"
