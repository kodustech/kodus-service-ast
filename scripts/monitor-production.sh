#!/bin/bash

# 🚀 SCRIPT: Monitor de recursos para produção
# Monitora CPU e RAM durante operações reais

echo "📊 MONITOR DE PRODUÇÃO - CPU e RAM"
echo "=================================="

# Configurações
API_URL="http://localhost:3002"
DURATION=${1:-60}  # Duração em segundos (padrão: 60s)
INTERVAL=${2:-5}   # Intervalo entre medições (padrão: 5s)

echo "🎯 Configurações:"
echo "  ⏱️  Duração: ${DURATION}s"
echo "  📊 Intervalo: ${INTERVAL}s"
echo "  🌐 API: ${API_URL}"
echo ""

# Função para obter métricas
get_metrics() {
    local response=$(curl -s "${API_URL}/api/health/resources")

    if [ $? -eq 0 ]; then
        echo "$response" | jq -r '
            "[" + (.timestamp | strptime("%Y-%m-%dT%H:%M:%S.%fZ") | strftime("%H:%M:%S")) + "] " +
            "RAM: " + .resources.memory.rss + " (" + .resources.memory.usagePercent + ") " + .resources.memory.status + " | " +
            "CPU: " + .resources.cpu.percentPerCore + " " + .resources.cpu.status + " | " +
            "Workers: " + (.scaling.recommendedWorkers | tostring) + " | " +
            .scaling.recommendations.current
        '
    else
        echo "[$(date +%H:%M:%S)] ❌ Erro ao conectar com a API"
    fi
}

# Função para obter resumo final
get_summary() {
    echo ""
    echo "📊 RESUMO FINAL:"
    echo "==============="

    local response=$(curl -s "${API_URL}/api/health/resources")

    if [ $? -eq 0 ]; then
        echo "$response" | jq -r '
            "🖥️  Processo: PID " + (.process.pid | tostring) + " | Uptime: " + .process.uptime,
            "💾 RAM: " + .resources.memory.rss + " (" + .resources.memory.usagePercent + ") " + .resources.memory.status,
            "🔥 CPU: " + .resources.cpu.percentPerCore + " " + .resources.cpu.status,
            "👥 Workers recomendados: " + (.scaling.recommendedWorkers | tostring),
            "💾 RAM por worker: " + .scaling.memoryPerWorker,
            "💾 RAM total necessária: " + .scaling.totalMemoryNeeded,
            "🎯 Recomendação: " + .scaling.recommendations.current,
            "💡 Workers: " + .scaling.recommendations.workers
        '
    else
        echo "❌ Erro ao obter resumo final"
    fi
}

# Monitoramento principal
echo "🚀 Iniciando monitoramento..."
echo "💡 Dica: Execute operações pesadas durante o monitoramento!"
echo ""

start_time=$(date +%s)
end_time=$((start_time + DURATION))

while [ $(date +%s) -lt $end_time ]; do
    get_metrics
    sleep $INTERVAL
done

# Resumo final
get_summary

echo ""
echo "✅ Monitoramento concluído!"
echo ""
echo "🔍 PRÓXIMOS PASSOS:"
echo "  1. Analise os picos de CPU e RAM"
echo "  2. Verifique as recomendações de workers"
echo "  3. Considere escalonamento baseado nos dados"
echo "  4. Monitore em produção com carga real"
