#!/bin/bash

# 🚀 MONITOR ÚNICO - Docker Stats + Logs em Tempo Real
# Simples, direto ao ponto!

LOG_FILE="docker-stats-$(date +%Y%m%d-%H%M%S).log"

echo "🚀 MONITOR DOCKER - Tempo Real + Logs"
echo "===================================="
echo "📁 Log: $LOG_FILE"
echo "⏹️  Para parar: Ctrl+C"
echo ""

# Cabeçalho do log
echo "timestamp,cpu_percent,mem_usage,mem_percent" > "$LOG_FILE"

# Loop principal
while true; do
    timestamp=$(date '+%H:%M:%S')

    # Mostrar na tela
    echo "🕐 $timestamp"
    docker stats --no-stream --format "  📊 {{.Container}}: CPU {{.CPUPerc}} | RAM {{.MemUsage}} ({{.MemPerc}})" kodus-service-ast kodus-service-ast-worker

    # Salvar no log (apenas worker)
    worker_stats=$(docker stats --no-stream --format "{{.CPUPerc}},{{.MemUsage}},{{.MemPerc}}" kodus-service-ast-worker 2>/dev/null)
    if [ -n "$worker_stats" ]; then
        echo "$timestamp,$worker_stats" >> "$LOG_FILE"
    fi

    echo ""
    sleep 2
done
