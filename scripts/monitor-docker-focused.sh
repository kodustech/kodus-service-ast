#!/bin/bash

# 🐳 MONITOR DOCKER FOCADO - Apenas Docker Stats
# Perfeito para monitorar workers em produção

echo "🐳 MONITOR DOCKER - Recursos dos Workers"
echo "========================================"
echo ""
echo "💡 COMO USAR:"
echo "  1. Deixe este script rodando"
echo "  2. Execute operações pesadas (processar repositórios)"
echo "  3. Observe os picos de CPU e RAM"
echo "  4. Use os dados para dimensionar workers"
echo ""
echo "⏹️  Para parar: Ctrl+C"
echo ""

# Função para mostrar timestamp
show_timestamp() {
    echo "🕐 $(date '+%H:%M:%S') - $(date '+%d/%m/%Y')"
}

# Função para mostrar métricas Docker
show_docker_stats() {
    echo "🐳 DOCKER CONTAINERS:"
    docker stats --no-stream --format "  📊 {{.Container}}: CPU {{.CPUPerc}} | RAM {{.MemUsage}} ({{.MemPerc}})" kodus-service-ast kodus-service-ast-worker 2>/dev/null || echo "  ❌ Containers não encontrados"
}

# Função para mostrar recomendações baseadas nos dados Docker
show_recommendations() {
    # Obter dados do worker
    local worker_stats=$(docker stats --no-stream --format "{{.CPUPerc}},{{.MemUsage}},{{.MemPerc}}" kodus-service-ast-worker 2>/dev/null)
    
    if [ -n "$worker_stats" ]; then
        IFS=',' read -r cpu_percent mem_usage mem_percent <<< "$worker_stats"
        
        # Remover % e MiB para cálculos
        cpu_clean=$(echo "$cpu_percent" | sed 's/%//')
        mem_clean=$(echo "$mem_usage" | sed 's/MiB.*//')
        mem_percent_clean=$(echo "$mem_percent" | sed 's/%//')
        
        echo "💡 RECOMENDAÇÕES BASEADAS NO DOCKER:"
        
        # Status CPU
        if (( $(echo "$cpu_clean > 80" | bc -l) )); then
            echo "  🔴 CPU: CRÍTICO (${cpu_percent}) - Precisa de mais workers!"
        elif (( $(echo "$cpu_clean > 60" | bc -l) )); then
            echo "  🟡 CPU: ALTO (${cpu_percent}) - Considere mais workers"
        else
            echo "  🟢 CPU: OK (${cpu_percent}) - Workers suficientes"
        fi
        
        # Status RAM
        if (( $(echo "$mem_percent_clean > 80" | bc -l) )); then
            echo "  🔴 RAM: CRÍTICO (${mem_percent}) - Precisa de mais memória!"
        elif (( $(echo "$mem_percent_clean > 60" | bc -l) )); then
            echo "  🟡 RAM: ALTO (${mem_percent}) - Monitore de perto"
        else
            echo "  🟢 RAM: OK (${mem_percent}) - Memória adequada"
        fi
        
        # Recomendação de workers
        if (( $(echo "$cpu_clean > 80" | bc -l) )); then
            echo "  👥 WORKERS: Aumentar para 2-3 workers"
        elif (( $(echo "$cpu_clean > 60" | bc -l) )); then
            echo "  👥 WORKERS: Considerar 2 workers"
        else
            echo "  👥 WORKERS: 1 worker suficiente"
        fi
        
        # Memória por worker
        echo "  💾 RAM/Worker: ${mem_usage} (com margem: $(echo "scale=0; $mem_clean * 1.5" | bc)MiB)"
    else
        echo "  ❌ Não foi possível obter dados do worker"
    fi
}

# Função para mostrar histórico de picos
show_peaks() {
    echo "📈 HISTÓRICO DE PICOS:"
    echo "  🔥 CPU máximo hoje: $(docker stats --no-stream --format "{{.CPUPerc}}" kodus-service-ast-worker 2>/dev/null || echo "N/A")"
    echo "  💾 RAM máxima hoje: $(docker stats --no-stream --format "{{.MemUsage}}" kodus-service-ast-worker 2>/dev/null || echo "N/A")"
}

# Loop principal
while true; do
    clear
    echo "🐳 MONITOR DOCKER - Recursos dos Workers"
    echo "========================================"
    echo ""
    
    show_timestamp
    echo ""
    
    show_docker_stats
    echo ""
    
    show_recommendations
    echo ""
    
    show_peaks
    echo ""
    
    echo "⏳ Próxima atualização em 5s... (Ctrl+C para parar)"
    
    sleep 5
done
