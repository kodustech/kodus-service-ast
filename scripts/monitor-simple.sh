#!/bin/bash

# 🚀 SCRIPT SIMPLES: Monitor contínuo
# Perfeito para monitorar durante operações reais

echo "🚀 MONITOR SIMPLES - Recursos em Tempo Real"
echo "==========================================="
echo ""
echo "💡 COMO USAR:"
echo "  1. Deixe este script rodando"
echo "  2. Execute operações pesadas (ex: processar repositório)"
echo "  3. Observe os picos de CPU e RAM"
echo "  4. Use os dados para dimensionar workers"
echo ""
echo "⏹️  Para parar: Ctrl+C"
echo ""

# Função para mostrar timestamp
show_timestamp() {
    echo "🕐 $(date '+%H:%M:%S')"
}

# Função para mostrar métricas Docker
show_docker_stats() {
    echo "🐳 DOCKER (HOST):"
    docker stats --no-stream --format "  📊 {{.Container}}: CPU {{.CPUPerc}} | RAM {{.MemUsage}} ({{.MemPerc}})" kodus-service-ast kodus-service-ast-worker 2>/dev/null || echo "  ❌ Containers não encontrados"
}

# Função para mostrar métricas internas
show_internal_stats() {
    local response=$(curl -s http://localhost:3002/api/health/resources 2>/dev/null)

    if [ $? -eq 0 ]; then
        echo "🖥️  INTERNO (Node.js):"
        echo "$response" | jq -r "  📊 API: CPU " + .resources.cpu.percentPerCore + "% | RAM " + .resources.memory.rss + " (" + .resources.memory.usagePercent + "%)"
    else
        echo "🖥️  INTERNO: ❌ API não disponível"
    fi
}

# Função para mostrar recomendações
show_recommendations() {
    local response=$(curl -s http://localhost:3002/api/health/resources 2>/dev/null)

    if [ $? -eq 0 ]; then
        echo "💡 RECOMENDAÇÕES:"
        echo "$response" | jq -r "  👥 Workers: " + .scaling.recommendedWorkers + " | 💾 RAM/Worker: " + .scaling.memoryPerWorker + " | 🎯 " + .scaling.recommendations.current
    fi
}

# Loop principal
while true; do
    clear
    echo "🚀 MONITOR SIMPLES - Recursos em Tempo Real"
    echo "==========================================="
    echo ""

    show_timestamp
    echo ""

    show_docker_stats
    echo ""

    show_internal_stats
    echo ""

    show_recommendations
    echo ""

    echo "⏳ Próxima atualização em 3s... (Ctrl+C para parar)"

    sleep 3
done
