#!/bin/bash

# 🧮 CALCULADORA DE WORKERS
# Calcula quantos workers precisamos baseado nos dados reais

echo "🧮 CALCULADORA DE WORKERS"
echo "========================"
echo ""

# Função para obter dados atuais
get_current_stats() {
    local worker_stats=$(docker stats --no-stream --format "{{.CPUPerc}},{{.MemUsage}},{{.MemPerc}}" kodus-service-ast-worker 2>/dev/null)

    if [ -n "$worker_stats" ]; then
        IFS=',' read -r cpu_percent mem_usage mem_percent <<< "$worker_stats"
        echo "📊 DADOS ATUAIS DO WORKER:"
        echo "  🔥 CPU: $cpu_percent"
        echo "  💾 RAM: $mem_usage ($mem_percent)"
        echo ""

        # Calcular workers necessários
        calculate_workers "$cpu_percent" "$mem_usage" "$mem_percent"
    else
        echo "❌ Worker não encontrado ou não está rodando"
        echo ""
        echo "💡 Para calcular workers:"
        echo "  1. Execute operações pesadas"
        echo "  2. Use: ./monitor.sh"
        echo "  3. Observe os picos"
        echo "  4. Execute este script novamente"
    fi
}

# Função para calcular workers
calculate_workers() {
    local cpu_percent="$1"
    local mem_usage="$2"
    local mem_percent="$3"

    # Remover % e MiB para cálculos
    local cpu_clean=$(echo "$cpu_percent" | sed 's/%//')
    local mem_clean=$(echo "$mem_usage" | sed 's/MiB.*//')
    local mem_percent_clean=$(echo "$mem_percent" | sed 's/%//')

    echo "🧮 CÁLCULO DE WORKERS:"
    echo "====================="
    echo ""

    # CPU-based calculation
    local cpu_workers=1
    if (( $(echo "$cpu_clean > 80" | bc -l 2>/dev/null || echo "0") )); then
        cpu_workers=$(echo "scale=0; $cpu_clean / 60" | bc -l 2>/dev/null || echo "2")
        echo "🔥 CPU: ${cpu_percent} → Precisa de $cpu_workers workers (CPU > 80%)"
    elif (( $(echo "$cpu_clean > 60" | bc -l 2>/dev/null || echo "0") )); then
        cpu_workers=2
        echo "🟡 CPU: ${cpu_percent} → Recomenda 2 workers (CPU > 60%)"
    else
        echo "🟢 CPU: ${cpu_percent} → 1 worker suficiente (CPU < 60%)"
    fi

    # Memory-based calculation
    local mem_workers=1
    if (( $(echo "$mem_percent_clean > 80" | bc -l 2>/dev/null || echo "0") )); then
        mem_workers=$(echo "scale=0; $mem_percent_clean / 60" | bc -l 2>/dev/null || echo "2")
        echo "💾 RAM: ${mem_percent} → Precisa de $mem_workers workers (RAM > 80%)"
    elif (( $(echo "$mem_percent_clean > 60" | bc -l 2>/dev/null || echo "0") )); then
        mem_workers=2
        echo "🟡 RAM: ${mem_percent} → Recomenda 2 workers (RAM > 60%)"
    else
        echo "🟢 RAM: ${mem_percent} → 1 worker suficiente (RAM < 60%)"
    fi

    # Recomendação final
    local final_workers=$((cpu_workers > mem_workers ? cpu_workers : mem_workers))

    echo ""
    echo "🎯 RECOMENDAÇÃO FINAL:"
    echo "====================="
    echo "  👥 Workers necessários: $final_workers"
    echo "  💾 RAM por worker: ${mem_usage} (com margem: $(echo "scale=0; $mem_clean * 1.5" | bc -l 2>/dev/null || echo "1000")MiB)"
    echo "  🔥 CPU por worker: ${cpu_percent} (máximo recomendado: 60%)"
    echo ""

    # Configuração Docker Compose
    echo "🐳 CONFIGURAÇÃO DOCKER COMPOSE:"
    echo "==============================="
    local worker_cpus=$(echo "scale=1; 2.0 / $final_workers" | bc -l 2>/dev/null || echo "1.0")
    local worker_memory=$(echo "scale=0; $mem_clean * 1.5" | bc -l 2>/dev/null || echo "1000")

    echo "  Para $final_workers workers:"
    echo "    cpus: '$worker_cpus'"
    echo "    memory: ${worker_memory}M"
    echo ""

    # Script de deploy
    echo "🚀 SCRIPT DE DEPLOY:"
    echo "===================="
    echo "  # Para $final_workers workers:"
    echo "  docker-compose -f docker-compose.dev-with-limits.yml up --scale kodus-service-ast-worker=$final_workers -d"
    echo ""
}

# Função para mostrar exemplo de uso
show_example() {
    echo "💡 EXEMPLO DE USO:"
    echo "=================="
    echo "  1. Execute operações pesadas:"
    echo "     curl -X POST http://localhost:3002/api/ast/repositories/initialize"
    echo ""
    echo "  2. Monitore em tempo real:"
    echo "     ./monitor.sh"
    echo ""
    echo "  3. Calcule workers necessários:"
    echo "     ./calculate-workers.sh"
    echo ""
    echo "  4. Aplique limites e escale:"
    echo "     docker-compose -f docker-compose.dev-with-limits.yml up --scale kodus-service-ast-worker=2 -d"
}

# Função principal
main() {
    if [ "$1" = "example" ]; then
        show_example
    else
        get_current_stats
        echo ""
        show_example
    fi
}

main "$@"
