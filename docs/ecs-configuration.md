# ECS Configuration - Kodus Service AST

## 🚀 **Configuração ECS Atual**

```hcl
worker_desired_count = 1
worker_cpu           = 1024  # 1 vCPU
worker_memory        = 2048  # 2 GB
```

## 📊 **Análise de Recursos**

### **Recursos Totais:**
- **Workers**: 2 instâncias
- **vCPUs**: 2 × 1 vCPU = **2 vCPUs total**
- **RAM**: 2 × 2GB = **4GB RAM total**
- **Isolamento**: Workers independentes (não compartilham memória)

### **Capacidade de Processamento:**
- **Throughput**: 2 workers × 2 mensagens = **4 mensagens simultâneas**
- **Memória por Worker**: 2GB (suficiente para AST parsing)
- **CPU por Worker**: 1 vCPU (adequado para parsing)

## ⚙️ **Configurações Otimizadas**

### **RabbitMQ Settings:**
```bash
# OTIMIZADO PARA ECS
RABBIT_PREFETCH=2                    # 2 mensagens por worker
RABBIT_RETRY_TTL_MS=60000          # 60s entre tentativas
RABBIT_PUBLISH_TIMEOUT_MS=5000     # 5s timeout
```

### **Queue Configuration:**
```typescript
// Configurações otimizadas
DELIVERY_LIMIT: 3,           // 3 tentativas (reduzido de 5)
TTL: 60000,                  // 60s (aumentado de 30s)
PREFETCH: 2,                  // 2 mensagens por worker
```

## 📈 **Performance Esperada**

### **Throughput:**
- **Mensagens Simultâneas**: 4 (2 workers × 2 prefetch)
- **Processamento**: AST parsing paralelo
- **Latência**: Reduzida com paralelismo

### **Recursos:**
- **CPU Usage**: ~80% (2 vCPUs bem utilizados)
- **Memory Usage**: ~6-8GB total (3-4GB por worker)
- **I/O**: Otimizado com prefetch=2

## 🔧 **Configuração ECS Recomendada**

### **Task Definition:**
```json
{
  "cpu": "1024",
  "memory": "2048",
  "environment": [
    {
      "name": "RABBIT_PREFETCH",
      "value": "2"
    },
    {
      "name": "RABBIT_RETRY_TTL_MS", 
      "value": "60000"
    }
  ]
}
```

### **Service Configuration:**
```json
{
  "desiredCount": 2,
  "deploymentConfiguration": {
    "maximumPercent": 200,
    "minimumHealthyPercent": 50
  }
}
```

## 📊 **Monitoramento ECS**

### **Métricas Importantes:**
- **CPU Utilization**: Target 70-80%
- **Memory Utilization**: Target 60-70%
- **Queue Length**: < 10 mensagens
- **Processing Time**: < 30s por tarefa

### **Alertas Recomendados:**
- CPU > 90% por 5 minutos
- Memory > 85% por 5 minutos
- Queue length > 20 mensagens
- Worker count < 2

## 🚨 **Troubleshooting ECS**

### **Problemas Comuns:**

1. **OOM (Out of Memory)**:
   - Aumentar `worker_memory` para 3072 (3GB)
   - Reduzir `RABBIT_PREFETCH` para 1

2. **CPU Throttling**:
   - Aumentar `worker_cpu` para 2048 (2 vCPUs)
   - Otimizar código de parsing

3. **Queue Backlog**:
   - Aumentar `worker_desired_count` para 3-4
   - Verificar se RabbitMQ está saudável

## 📋 **Checklist de Deploy**

- [ ] Configurar `RABBIT_PREFETCH=2`
- [ ] Configurar `RABBIT_RETRY_TTL_MS=60000`
- [ ] Verificar health checks
- [ ] Configurar auto-scaling (se necessário)
- [ ] Monitorar métricas por 24h
- [ ] Ajustar recursos baseado em uso

## 🎯 **Próximos Passos**

1. **Deploy** com configurações otimizadas
2. **Monitor** métricas por 1 semana
3. **Ajustar** recursos baseado em uso real
4. **Considerar** auto-scaling se necessário
