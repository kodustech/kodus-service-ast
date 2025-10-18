#!/bin/bash

# 📊 SCRIPT: Monitor com logs para análise
# Salva métricas em arquivo para análise posterior

LOG_FILE="monitoring-$(date +%Y%m%d-%H%M%S).log"
DURATION=${1:-300}  # 5 minutos por padrão

echo "📊 MONITOR COM LOGS - Salvando métricas para análise"
echo "==================================================="
echo ""
echo "📁 Log: $LOG_FILE"
echo "⏱️  Duração: ${DURATION}s"
echo ""

# Cabeçalho do log
echo "timestamp,container,cpu_percent,mem_usage,mem_percent,net_io,block_io" > "$LOG_FILE"

# Função para logar métricas Docker
log_docker_stats() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')

    docker stats --no-stream --format "{{.Container}},{{.CPUPerc}},{{.MemUsage}},{{.MemPerc}},{{.NetIO}},{{.BlockIO}}" kodus-service-ast kodus-service-ast-worker 2>/dev/null | while IFS=',' read -r container cpu mem_usage mem_perc net_io block_io; do
        echo "$timestamp,$container,$cpu,$mem_usage,$mem_perc,$net_io,$block_io" >> "$LOG_FILE"
    done
}

# Função para mostrar progresso
show_progress() {
    local current=$1
    local total=$2
    local percent=$((current * 100 / total))

    printf "\r📊 Progresso: [%-50s] %d%% (%d/%ds)" $(printf "%*s" $((percent/2)) | tr ' ' '=') $percent $current $total
}

# Monitoramento principal
start_time=$(date +%s)
end_time=$((start_time + DURATION))
current_time=$start_time

echo "🚀 Iniciando monitoramento..."
echo "💡 Execute operações pesadas durante o monitoramento!"
echo ""

while [ $current_time -lt $end_time ]; do
    log_docker_stats

    elapsed=$((current_time - start_time))
    show_progress $elapsed $DURATION

    sleep 5
    current_time=$(date +%s)
done

echo ""
echo ""
echo "✅ Monitoramento concluído!"
echo ""
echo "📁 Log salvo em: $LOG_FILE"
echo ""

# Análise rápida
echo "📊 ANÁLISE RÁPIDA:"
echo "=================="

if [ -f "$LOG_FILE" ]; then
    # CPU máximo
    max_cpu=$(tail -n +2 "$LOG_FILE" | cut -d',' -f3 | sed 's/%//' | sort -nr | head -1)
    echo "🔥 CPU máximo: ${max_cpu}%"

    # RAM máxima
    max_mem=$(tail -n +2 "$LOG_FILE" | cut -d',' -f4 | sed 's/MiB.*//' | sort -nr | head -1)
    echo "💾 RAM máxima: ${max_mem}MiB"

    # Containers monitorados
    containers=$(tail -n +2 "$LOG_FILE" | cut -d',' -f2 | sort -u | wc -l)
    echo "🐳 Containers: $containers"

    # Linhas de log
    lines=$(wc -l < "$LOG_FILE")
    echo "📊 Medições: $((lines - 1))"
fi

echo ""
echo "💡 PRÓXIMOS PASSOS:"
echo "  1. Execute operações pesadas e rode novamente"
echo "  2. Compare os logs para identificar picos"
echo "  3. Use os picos para dimensionar workers"
echo "  4. Considere 1.5x de margem de segurança"
echo ""
echo "📈 Para análise detalhada:"
echo "  cat $LOG_FILE | grep 'kodus-service-ast-worker' | tail -10"
