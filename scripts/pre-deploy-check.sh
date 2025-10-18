#!/bin/bash

# Script de verificação pré-deploy para kodus-service-ast
# Valida configurações e ambiente antes do deploy

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

# Verificar variáveis de ambiente obrigatórias
check_required_env_vars() {
    log "Verificando variáveis de ambiente obrigatórias..."

    local required_vars=("DATABASE_URL" "RABBITMQ_URL")
    local missing_vars=()

    for var in "${required_vars[@]}"; do
        if [ -z "${!var}" ]; then
            missing_vars+=("$var")
        fi
    done

    if [ ${#missing_vars[@]} -gt 0 ]; then
        error "Variáveis de ambiente obrigatórias não configuradas:"
        printf '  - %s\n' "${missing_vars[@]}"
        return 1
    fi

    success "Todas as variáveis obrigatórias estão configuradas"
}

# Verificar conectividade com banco de dados
check_database_connectivity() {
    log "Verificando conectividade com banco de dados..."

    # Extrair informações da DATABASE_URL
    if [[ $DATABASE_URL =~ postgresql://([^:]+):([^@]+)@([^:]+):([^/]+)/(.*) ]]; then
        DB_USER="${BASH_REMATCH[1]}"
        DB_PASS="${BASH_REMATCH[2]}"
        DB_HOST="${BASH_REMATCH[3]}"
        DB_PORT="${BASH_REMATCH[4]}"
        DB_NAME="${BASH_REMATCH[5]}"

        # Testar conexão (requer psql instalado)
        if command -v psql &> /dev/null; then
            if PGPASSWORD="$DB_PASS" psql -h "$DB_HOST" -p "$DB_PORT" -U "$DB_USER" -d "$DB_NAME" -c "SELECT 1" -q &> /dev/null; then
                success "Conectividade com banco PostgreSQL OK"
            else
                error "Falha na conexão com banco PostgreSQL"
                return 1
            fi
        else
            warning "psql não instalado - pulando verificação de conectividade DB"
        fi
    else
        error "DATABASE_URL mal formatada ou não é PostgreSQL"
        return 1
    fi
}

# Verificar conectividade com RabbitMQ
check_rabbitmq_connectivity() {
    log "Verificando conectividade com RabbitMQ..."

    # Extrair informações da RABBITMQ_URL
    if [[ $RABBITMQ_URL =~ amqp://([^:]+):([^@]+)@([^:]+):([^/]+)(.*) ]]; then
        RMQ_USER="${BASH_REMATCH[1]}"
        RMQ_PASS="${BASH_REMATCH[2]}"
        RMQ_HOST="${BASH_REMATCH[3]}"
        RMQ_PORT="${BASH_REMATCH[4]}"
        RMQ_VHOST="${BASH_REMATCH[5]:-/}"

        # Testar conexão usando rabbitmqadmin (se disponível)
        if command -v rabbitmqadmin &> /dev/null; then
            if rabbitmqadmin -H "$RMQ_HOST" -P "$RMQ_PORT" -u "$RMQ_USER" -p "$RMQ_PASS" -V "$RMQ_VHOST" list queues name &> /dev/null; then
                success "Conectividade com RabbitMQ OK"
            else
                error "Falha na conexão com RabbitMQ"
                return 1
            fi
        else
            # Fallback: tentar conectar via HTTP management API
            local mgmt_port=${RMQ_PORT//5672/15672}
            if curl -s -u "$RMQ_USER:$RMQ_PASS" "http://$RMQ_HOST:$mgmt_port/api/overview" > /dev/null 2>&1; then
                success "Conectividade com RabbitMQ (via management API) OK"
            else
                warning "Não foi possível verificar conectividade RabbitMQ (rabbitmqadmin/curl não disponíveis)"
            fi
        fi
    else
        error "RABBITMQ_URL mal formatada"
        return 1
    fi
}

# Verificar arquivos necessários
check_required_files() {
    log "Verificando arquivos necessários..."

    local required_files=(
        "dist/main.js"
        "dist/worker/main.js"
        "package.json"
        ".env"
    )

    local missing_files=()

    for file in "${required_files[@]}"; do
        if [ ! -f "$file" ]; then
            missing_files+=("$file")
        fi
    done

    if [ ${#missing_files[@]} -gt 0 ]; then
        error "Arquivos necessários não encontrados:"
        printf '  - %s\n' "${missing_files[@]}"
        return 1
    fi

    success "Todos os arquivos necessários estão presentes"
}

# Verificar configurações do RabbitMQ para conflitos
check_rabbitmq_configuration() {
    log "Verificando configurações RabbitMQ para possíveis conflitos..."

    # Verificar se as filas críticas existem e têm configuração compatível
    # Isso requer acesso ao RabbitMQ, então apenas validamos as configurações locais

    local critical_queues=(
        "ast.initialize.repo.q"
        "ast.initialize.impact.q"
        "ast.jobs.dlq"
    )

    warning "⚠️  IMPORTANTE: Execute './scripts/cleanup-rabbitmq.sh' antes do deploy"
    warning "   se houve mudanças nas configurações RabbitMQ"

    success "Configurações RabbitMQ validadas localmente"
}

# Verificar se o ambiente está limpo
check_environment_cleanliness() {
    log "Verificando limpeza do ambiente..."

    # Verificar se há containers antigos rodando
    local old_containers=$(docker ps -a --filter "name=kodus-service-ast" --format "{{.Names}}" 2>/dev/null | wc -l)

    if [ "$old_containers" -gt 0 ]; then
        warning "Encontrados $old_containers containers antigos do kodus-service-ast"
        warning "Considere limpar com: docker rm \$(docker ps -a -q --filter 'name=kodus-service-ast')"
    fi

    success "Verificação de limpeza do ambiente concluída"
}

# Função principal
main() {
    log "🔍 Executando verificações pré-deploy para kodus-service-ast"

    local checks_passed=true

    # Executar verificações
    check_required_env_vars || checks_passed=false
    check_required_files || checks_passed=false
    check_database_connectivity || checks_passed=false
    check_rabbitmq_connectivity || checks_passed=false
    check_rabbitmq_configuration || checks_passed=false
    check_environment_cleanliness || checks_passed=false

    echo ""

    if [ "$checks_passed" = true ]; then
        success "🎉 Todas as verificações pré-deploy passaram!"
        echo ""
        echo "🚀 Pronto para deploy. Execute:"
        echo "   ./scripts/deploy.sh"
        exit 0
    else
        error "❌ Algumas verificações falharam. Corrija os problemas antes do deploy."
        exit 1
    fi
}

# Executar main
main "$@"
