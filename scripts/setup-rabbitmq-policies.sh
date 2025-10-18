#!/bin/bash

# Script para configurar políticas RabbitMQ para kodus-service-ast
# Aplica DLX, delivery-limit, SAC e outros argumentos via políticas em vez de argumentos de fila

set -e

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

# Detectar comando rabbitmqctl
setup_rabbitmqctl() {
    if check_docker_environment; then
        # Tentar diferentes nomes de container
        if docker ps | grep -q "rabbitmq-local"; then
            RABBITMQCTL="docker exec rabbitmq-local rabbitmqctl"
        elif docker ps | grep -q "rabbitmq$"; then
            RABBITMQCTL="docker exec rabbitmq rabbitmqctl"
        else
            RABBITMQCTL="docker exec $(docker ps | grep rabbitmq | awk '{print $NF}') rabbitmqctl"
        fi
    else
        RABBITMQCTL="rabbitmqctl"
    fi
}

# Verificar se plugin delayed-message-exchange está habilitado
check_delayed_plugin() {
    log "Verificando plugin rabbitmq_delayed_message_exchange..."

    if $RABBITMQCTL list_plugins | grep -q "rabbitmq_delayed_message_exchange"; then
        success "Plugin delayed-message-exchange está habilitado"
        return 0
    else
        warning "Plugin delayed-message-exchange NÃO está habilitado"
        warning "Para usar delayed messages, habilite o plugin:"
        echo "  docker exec rabbitmq-local rabbitmq-plugins enable rabbitmq_delayed_message_exchange"
        return 1
    fi
}

# Aplicar políticas de fila
apply_queue_policies() {
    log "Aplicando políticas de fila..."

    # Política para filas de processamento AST
    # Aplica delivery-limit, DLX e queue-type
    $RABBITMQCTL set_policy ast-queue-policy \
        "^ast\.initialize\.(repo|impact)\.q$" \
        '{"delivery-limit": 5, "dead-letter-exchange": "ast.jobs.dlx", "queue-type": "quorum"}' \
        --apply-to queues

    success "Política ast-queue-policy aplicada"

    # Política para DLQ
    $RABBITMQCTL set_policy ast-dlq-policy \
        "^ast\.jobs\.dlq$" \
        '{"queue-type": "quorum"}' \
        --apply-to queues

    success "Política ast-dlq-policy aplicada"

    # Política opcional para SAC (single active consumer)
    # Só ative se precisar de processamento ordenado
    if [ "${RABBIT_SAC:-false}" = "true" ]; then
        warning "Aplicando SAC (single active consumer) - pode impactar performance"
        $RABBITMQCTL set_policy ast-sac-policy \
            "^ast\.initialize\.(repo|impact)\.q$" \
            '{"single-active-consumer": true}' \
            --apply-to queues
        success "Política ast-sac-policy aplicada (SAC habilitado)"
    else
        # Remover política SAC se existir
        $RABBITMQCTL clear_policy ast-sac-policy 2>/dev/null || true
        success "Política SAC removida (processamento concorrente habilitado)"
    fi
}

# Aplicar políticas de exchange
apply_exchange_policies() {
    log "Aplicando políticas de exchange..."

    # Política para delayed exchange (se plugin estiver habilitado)
    if check_delayed_plugin; then
        $RABBITMQCTL set_policy ast-delayed-policy \
            "^ast\.jobs\.delayed\.x$" \
            '{"delayed-message": {"type": "topic"}}' \
            --apply-to exchanges
        success "Política delayed-exchange aplicada"
    fi
}

# Listar políticas aplicadas
list_policies() {
    log "Listando políticas aplicadas..."
    echo ""
    echo "📋 Políticas de fila:"
    $RABBITMQCTL list_policies --formatter pretty_table
    echo ""
    echo "📋 Políticas de exchange:"
    $RABBITMQCTL list_policies --apply-to exchanges --formatter pretty_table
}

# Verificar configuração
verify_configuration() {
    log "Verificando configuração..."

    # Verificar exchanges
    echo "🔄 Exchanges:"
    $RABBITMQCTL list_exchanges name type | grep "^ast\."

    echo ""
    echo "📋 Filas:"
    $RABBITMQCTL list_queues name policy | grep "^ast\."

    echo ""
    echo "📋 Políticas:"
    $RABBITMQCTL list_policies
}

# Função principal
main() {
    log "🐰 Configurando políticas RabbitMQ para $PROJECT_NAME"

    # Verificar se rabbitmqctl está disponível
    if ! command -v $RABBITMQCTL &> /dev/null && ! check_docker_environment; then
        error "rabbitmqctl não encontrado. Execute em ambiente com RabbitMQ ou Docker."
        exit 1
    fi

    setup_rabbitmqctl

    # Aplicar configurações
    apply_queue_policies
    apply_exchange_policies

    echo ""
    list_policies

    echo ""
    success "🎉 Configuração RabbitMQ concluída!"

    echo ""
    echo "💡 Recomendações para produção:"
    echo "  • Aplique essas políticas via infraestrutura (Terraform/Ansible)"
    echo "  • Monitore uso de DLQ para ajustar delivery-limit"
    echo "  • Use SAC apenas quando necessário (impacta concorrência)"
    echo "  • Configure backup/HA para políticas críticas"
}

# Verificar argumentos
case "${1:-}" in
    "--verify"|"-v")
        setup_rabbitmqctl
        verify_configuration
        ;;
    "--help"|"-h")
        echo "Uso: $0 [opções]"
        echo ""
        echo "Script para configurar políticas RabbitMQ para kodus-service-ast"
        echo ""
        echo "Opções:"
        echo "  --verify, -v    Apenas verificar configuração atual"
        echo "  --help, -h      Mostrar esta ajuda"
        echo ""
        echo "Este script aplica políticas para DLX, delivery-limit e SAC via RabbitMQ"
        echo "em vez de argumentos de fila, evitando conflitos PRECONDITION_FAILED."
        ;;
    *)
        main "$@"
        ;;
esac
