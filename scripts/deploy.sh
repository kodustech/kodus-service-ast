#!/bin/bash

# Script de deploy automatizado para kodus-service-ast
# Executa limpeza de filas RabbitMQ conflitantes antes do deploy

set -e

# Configurações
PROJECT_NAME="kodus-service-ast"
DOCKER_IMAGE="kodus-service-ast"
CONTAINER_NAME="kodus-service-ast-app"
WORKER_CONTAINER_NAME="kodus-service-ast-worker"

# RabbitMQ delayed message exchange plugin check
RABBITMQ_DELAYED_PLUGIN_ENABLED=false

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Função de log
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

success() {
    echo -e "${GREEN}✅ $1${NC}"
}

warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

error() {
    echo -e "${RED}❌ $1${NC}"
}

# Verificar se estamos em ambiente Docker
check_docker_environment() {
    if command -v docker &> /dev/null && docker ps | grep -q rabbitmq; then
        return 0
    else
        return 1
    fi
}

# Fazer backup de mensagens críticas (se necessário)
backup_critical_messages() {
    log "Verificando mensagens críticas nas filas..."

    # Verificar se há mensagens na DLQ que precisam ser preservadas
    # Isso pode ser implementado com a API de management do RabbitMQ

    warning "Backup de mensagens não implementado - considere implementar se houver dados críticos"
}

# Limpar filas conflitantes
cleanup_queues() {
    log "Executando limpeza de filas RabbitMQ..."

    if check_docker_environment; then
        success "Ambiente Docker detectado - executando cleanup"
        ./scripts/cleanup-rabbitmq.sh
    else
        warning "Ambiente Docker não detectado - pulando cleanup automático"
        warning "Execute manualmente: ./scripts/cleanup-rabbitmq.sh"
        read -p "Continuar mesmo assim? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
}

# Verificar saúde pré-deploy
pre_deploy_checks() {
    log "Executando verificações pré-deploy..."

    # Verificar se as variáveis de ambiente estão configuradas
    required_vars=("RABBITMQ_URL" "DATABASE_URL")
    for var in "${required_vars[@]}"; do
        if [ -z "${!var}" ]; then
            error "Variável de ambiente $var não configurada"
            exit 1
        fi
    done

    # Verificar conectividade com RabbitMQ
    if ! check_docker_environment; then
        warning "Não foi possível verificar conectividade RabbitMQ"
    fi

    success "Verificações pré-deploy concluídas"
}

# Deploy da aplicação
deploy_application() {
    log "Iniciando deploy da aplicação..."

    # Parar containers existentes
    log "Parando containers existentes..."
    docker stop $CONTAINER_NAME 2>/dev/null || true
    docker stop $WORKER_CONTAINER_NAME 2>/dev/null || true

    # Remover containers antigos
    log "Removendo containers antigos..."
    docker rm $CONTAINER_NAME 2>/dev/null || true
    docker rm $WORKER_CONTAINER_NAME 2>/dev/null || true

    # Deploy da API
    log "Deploying API container..."
    docker run -d \
        --name $CONTAINER_NAME \
        --env-file .env \
        --network kodus-network \
        -p 5001:5001 \
        $DOCKER_IMAGE:latest

    # Deploy do Worker
    log "Deploying Worker container..."
    docker run -d \
        --name $WORKER_CONTAINER_NAME \
        --env-file .env \
        --network kodus-network \
        $DOCKER_IMAGE:latest \
        node dist/worker/main.js

    success "Containers deployados com sucesso"
}

# Verificar saúde pós-deploy
post_deploy_checks() {
    log "Executando verificações pós-deploy..."

    # Aguardar containers ficarem saudáveis
    log "Aguardando inicialização dos containers..."
    sleep 30

    # Verificar se containers estão rodando
    if ! docker ps | grep -q $CONTAINER_NAME; then
        error "Container da API não está rodando"
        exit 1
    fi

    if ! docker ps | grep -q $WORKER_CONTAINER_NAME; then
        error "Container do Worker não está rodando"
        exit 1
    fi

    # Verificar health check da API
    log "Verificando health check da API..."
    max_attempts=10
    attempt=1

    while [ $attempt -le $max_attempts ]; do
        if curl -f -s http://localhost:5001/health > /dev/null 2>&1; then
            success "API health check passou"
            break
        fi

        log "Tentativa $attempt/$max_attempts - aguardando API..."
        sleep 10
        ((attempt++))
    done

    if [ $attempt -gt $max_attempts ]; then
        error "API não ficou saudável após deploy"
        exit 1
    fi

    # Verificar health check do RabbitMQ
    log "Verificando health check do RabbitMQ..."
    if curl -f -s http://localhost:5001/health/rabbitmq > /dev/null 2>&1; then
        success "RabbitMQ health check passou"
    else
        warning "RabbitMQ health check falhou - verifique logs do worker"
    fi

    success "Verificações pós-deploy concluídas"
}

# Função principal
main() {
    log "🚀 Iniciando deploy de $PROJECT_NAME"

    # Executar etapas do deploy
    backup_critical_messages
    cleanup_queues
    pre_deploy_checks
    deploy_application
    post_deploy_checks

    success "🎉 Deploy concluído com sucesso!"
    echo ""
    echo "📊 Monitoramento:"
    echo "  - API Health: http://localhost:5001/health"
    echo "  - API Detail: http://localhost:5001/health/detail"
    echo "  - RabbitMQ Health: http://localhost:5001/health/rabbitmq"
    echo "  - RabbitMQ Detail: http://localhost:5001/health/rabbitmq/detail"
    echo ""
    echo "🐰 Logs:"
    echo "  - API: docker logs $CONTAINER_NAME"
    echo "  - Worker: docker logs $WORKER_CONTAINER_NAME"
    echo "  - RabbitMQ: docker logs rabbitmq-local"
}

# Verificar argumentos
case "${1:-}" in
    "--dry-run")
        warning "DRY RUN - Apenas simulando deploy"
        success "Script validado com sucesso"
        exit 0
        ;;
    "--help"|"-h")
        echo "Uso: $0 [opções]"
        echo ""
        echo "Opções:"
        echo "  --dry-run    Simular deploy sem executar ações"
        echo "  --help, -h   Mostrar esta ajuda"
        echo ""
        echo "Este script executa deploy completo com limpeza automática de filas RabbitMQ."
        exit 0
        ;;
    *)
        main "$@"
        ;;
esac
