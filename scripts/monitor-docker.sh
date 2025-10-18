#!/bin/bash

# 🐳 SCRIPT: Monitor de recursos Docker vs Interno
# Compara recursos do HOST vs processo Node.js

echo "🐳 MONITOR DOCKER - Recursos Reais vs Internos"
echo "==============================================="

# Configurações
API_URL="http://localhost:3002"
DURATION=${1:-60}
INTERVAL=${2:-5}

echo "🎯 Configurações:"
echo "  ⏱️  Duração: ${DURATION}s"
echo "  📊 Intervalo: ${INTERVAL}s"
echo "  🌐 API: ${API_URL}"
echo ""

# Função para obter métricas Docker (HOST)
get_docker_stats() {
    docker stats --no-stream --format "{{.CPUPerc}},{{.MemUsage}},{{.MemPerc}}" kodus-service-ast kodus-service-ast-worker 2>/dev/null | while IFS=',' read -r cpu mem_usage mem_perc; do
        echo "DOCKER,$cpu,$mem_usage,$mem_perc"
    done
}

# Função para obter métricas internas (Node.js)
get_internal_stats() {
    local response=$(curl -s "${API_URL}/api/health/resources" 2>/dev/null)

    if [ $? -eq 0 ]; then
        echo "$response" | jq -r '
            "INTERNAL," +
            .resources.cpu.percentPerCore + "," +
            .resources.memory.rss + "," +
            .resources.memory.usagePercent
        '
    else
        echo "INTERNAL,ERROR,ERROR,ERROR"
    fi
}

# Função para formatar saída
format_output() {
    local timestamp=$(date +%H:%M:%S)
    local docker_line="$1"
    local internal_line="$2"

    if [[ "$docker_line" == "DOCKER,"* ]]; then
        IFS=',' read -r type cpu mem_usage mem_perc <<< "$docker_line"
        echo "[$timestamp] 🐳 DOCKER: CPU: $cpu | RAM: $mem_usage ($mem_perc)"
    fi

    if [[ "$internal_line" == "INTERNAL,"* ]]; then
        IFS=',' read -r type cpu mem_usage mem_perc <<< "$internal_line"
        echo "[$timestamp] 🖥️  INTERNO: CPU: ${cpu}% | RAM: ${mem_usage} (${mem_perc}%)"
    fi
}

# Monitoramento principal
echo "🚀 Iniciando monitoramento Docker vs Interno..."
echo "💡 Dica: Execute operações pesadas durante o monitoramento!"
echo ""

start_time=$(date +%s)
end_time=$((start_time + DURATION))

while [ $(date +%s) -lt $end_time ]; do
    # Obter métricas Docker
    docker_stats=$(get_docker_stats)

    # Obter métricas internas
    internal_stats=$(get_internal_stats)

    # Mostrar comparação
    echo "---"
    format_output "$docker_stats" "$internal_stats"
    echo ""

    sleep $INTERVAL
done

# Resumo final
echo "📊 RESUMO FINAL:"
echo "==============="

echo ""
echo "🐳 DOCKER (HOST):"
docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.MemPerc}}" kodus-service-ast kodus-service-ast-worker

echo ""
echo "🖥️  INTERNO (Node.js):"
curl -s "${API_URL}/api/health/resources" | jq -r '
    "API: CPU " + .resources.cpu.percentPerCore + "% | RAM " + .resources.memory.rss + " (" + .resources.memory.usagePercent + "%)"
'

echo ""
echo "🎯 ANÁLISE:"
echo "  🐳 Docker Stats = Recursos do HOST (incluindo overhead)"
echo "  🖥️  Endpoint Interno = Recursos do processo Node.js"
echo "  📈 Diferença = Overhead do container + outros processos"
echo ""
echo "💡 RECOMENDAÇÕES:"
echo "  🔍 Use Docker Stats para dimensionamento de containers"
echo "  📊 Use Endpoint Interno para otimização de código"
echo "  ⚖️  Considere 1.5x de margem de segurança"
