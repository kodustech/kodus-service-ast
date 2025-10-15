#!/bin/bash

# Script para limpar filas RabbitMQ conflitantes
# Execute quando houver erros 406 PRECONDITION_FAILED devido a argumentos diferentes

set -e

# Configurações - ajuste conforme seu ambiente
RABBIT_HOST=${RABBIT_HOST:-localhost}
RABBIT_PORT=${RABBIT_PORT:-5672}
RABBIT_USER=${RABBIT_USER:-guest}
RABBIT_PASS=${RABBIT_PASS:-guest}
RABBIT_VHOST=${RABBIT_VHOST:-/}

echo "🐰 Limpando filas RabbitMQ conflitantes..."
echo "Host: $RABBIT_HOST:$RABBIT_PORT"
echo "VHost: $RABBIT_VHOST"

# Função para executar comandos rabbitmqctl
rabbitmqctl() {
    docker exec rabbitmq rabbitmqctl "$@"
}

# Verificar se estamos usando Docker ou instalação local
if command -v docker &> /dev/null && docker ps | grep -q rabbitmq; then
    echo "📦 Usando RabbitMQ via Docker"
    # Tentar diferentes nomes de container
    if docker ps | grep -q "rabbitmq-local"; then
        RABBITMQCTL="docker exec rabbitmq-local rabbitmqctl"
    elif docker ps | grep -q "rabbitmq$"; then
        RABBITMQCTL="docker exec rabbitmq rabbitmqctl"
    else
        RABBITMQCTL="docker exec $(docker ps | grep rabbitmq | awk '{print $NF}') rabbitmqctl"
    fi
else
    echo "💻 Usando RabbitMQ local"
    RABBITMQCTL="rabbitmqctl"
fi

# Filas que podem ter conflitos (baseado em QUEUE_CONFIG)
QUEUES_TO_CLEAN=(
    "ast.test.echo.q"           # QUEUE_CONFIG.ECHO_QUEUE
    "ast.initialize.repo.q"     # QUEUE_CONFIG.REPO_QUEUE
    "ast.initialize.impact.q"   # QUEUE_CONFIG.IMPACT_QUEUE
    "ast.jobs.dlq"             # QUEUE_CONFIG.DEAD_LETTER_QUEUE
)

echo "🧹 Removendo filas conflitantes..."

for queue in "${QUEUES_TO_CLEAN[@]}"; do
    echo "  Removendo fila: $queue"
    $RABBITMQCTL delete_queue "$queue" || echo "  ⚠️  Fila $queue não encontrada ou já removida"
done

echo "📋 Listando filas restantes no vhost $RABBIT_VHOST..."
$RABBITMQCTL list_queues

echo "✅ Limpeza concluída!"
echo ""
echo "💡 Agora você pode reiniciar a aplicação. As filas serão recriadas"
echo "   com a configuração correta pelos @RabbitSubscribe decorators."
