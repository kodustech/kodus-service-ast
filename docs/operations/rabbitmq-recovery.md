# 🔧 Guia de Recuperação: Conflitos RabbitMQ

Este documento descreve procedimentos para diagnosticar e resolver conflitos de configuração em filas RabbitMQ, especificamente o erro **406 PRECONDITION_FAILED**.

## 📋 Sumário

- [Sintomas](#sintomas)
- [Diagnóstico](#diagnóstico)
- [Soluções](#soluções)
- [Prevenção](#prevenção)
- [Referências](#referências)

## 🚨 Sintomas

### Erro 406 PRECONDITION_FAILED

```
Error: Operation failed: queue.declare: (406) PRECONDITION_FAILED
- inequivalent arg 'x-dead-letter-exchange' for queue 'ast.initialize.repo.q'
  in vhost '/': received the value 'ast.jobs.dlx' but current is none
```

### Comportamentos Observáveis

- **Worker falha ao iniciar** com erros de RabbitMQ
- **Logs mostram conflitos** entre configurações esperadas vs atuais
- **Mensagens param de ser processadas**
- **Health checks falham** para RabbitMQ

### Cenários Comuns

1. **Deploy sem limpeza**: Mudança na configuração sem remover filas antigas
2. **Configuração inconsistente**: API e Worker com argumentos diferentes
3. **Variáveis de ambiente**: Mudanças em `RABBIT_SAC`, `RABBIT_RETRY_TTL_MS`
4. **Atualização de código**: Mudanças em `buildTaskQueueOptions`

## 🔍 Diagnóstico

### 1. Verificar Logs

```bash
# Logs do Worker
docker logs kodus-service-ast-worker

# Procurar por erros 406
grep "406\|PRECONDITION_FAILED\|inequivalent arg" logs/worker.log
```

### 2. Inspecionar Filas Existentes

```bash
# Listar filas via management API
curl -u guest:guest http://localhost:15672/api/queues/%2F | jq '.[] | {name: .name, arguments: .arguments}'

# Ou via rabbitmqctl
docker exec rabbitmq-local rabbitmqctl list_queues name arguments
```

### 3. Comparar Configurações

```bash
# Configuração atual esperada
node -e "
const { getQueueRuntimeConfig, buildTaskQueueOptions, QUEUE_CONFIG } = require('./dist/core/infrastructure/queue/queue.constants.js');
const config = getQueueRuntimeConfig();
const options = buildTaskQueueOptions(config);
console.log('Expected options:', JSON.stringify(options, null, 2));
"
```

### 4. Health Check Detalhado

```bash
# Verificar status das filas
curl http://localhost:5001/health/rabbitmq/detail
```

## 🛠️ Soluções

### 🚨 **Solução Rápida: Limpeza Total**

```bash
# 1. Parar aplicações
docker stop kodus-service-ast-app kodus-service-ast-worker

# 2. Limpar filas conflitantes
./scripts/cleanup-rabbitmq.sh

# 3. Reiniciar aplicações
./scripts/deploy.sh
```

### 🔧 **Solução Específica por Fila**

```bash
# Remover fila específica
docker exec rabbitmq-local rabbitmqctl delete_queue ast.initialize.repo.q

# Verificar se foi removida
docker exec rabbitmq-local rabbitmqctl list_queues | grep ast.initialize.repo.q
```

### ⚙️ **Solução de Configuração**

Se o problema for causado por mudança de configuração:

1. **Identificar mudança**:

    ```bash
    git log --oneline -10 --grep="queue\|rabbit"
    ```

2. **Reverter configuração** ou **limpar filas**:

    ```bash
    # Se reverter configuração
    git checkout <commit-anterior>
    ./scripts/deploy.sh

    # OU limpar e deploy com nova configuração
    ./scripts/cleanup-rabbitmq.sh
    ./scripts/deploy.sh
    ```

### 🐰 **Solução via Management API**

Para cenários avançados:

```bash
# Backup de mensagens (se houver)
curl -u guest:guest http://localhost:15672/api/queues/%2F/ast.initialize.repo.q/get \
  -H "content-type: application/json" \
  -d '{"count": 100, "ackmode": "ack_requeue_true", "encoding": "auto"}'

# Recriar fila com nova configuração
# (deixe o NestJS fazer isso no próximo startup)
```

## 🛡️ Prevenção

### 📋 Checklist Pré-Deploy

**Sempre execute antes de deploy:**

```bash
# 1. Verificações pré-deploy
./scripts/pre-deploy-check.sh

# 2. Limpeza se necessário
./scripts/cleanup-rabbitmq.sh

# 3. Deploy
./scripts/deploy.sh
```

### 🔧 Configurações Seguras

#### Environment Variables

```bash
# Use valores consistentes
RABBIT_SAC=false
RABBIT_RETRY_TTL_MS=30000
RABBIT_PREFETCH=1
```

#### Feature Flags

```typescript
// Use flags para mudanças graduais
const ENABLE_NEW_QUEUE_CONFIG = process.env.ENABLE_NEW_QUEUE_CONFIG === 'true';

const queueOptions = ENABLE_NEW_QUEUE_CONFIG
    ? newQueueOptions()
    : legacyQueueOptions();
```

### 📊 Monitoramento

#### Métricas Essenciais

- `rabbitmq_queue_declarations_total` - Contador de declarações
- `rabbitmq_queue_conflicts_total` - Conflitos detectados
- `rabbitmq_connection_failures` - Falhas de conexão

#### Alertas

- ✅ **Crítico**: Erro 406 PRECONDITION_FAILED
- ⚠️ **Warning**: Taxa alta de falhas de processamento
- ℹ️ **Info**: Mudanças nas configurações de filas

### 🧪 Testes Automatizados

```typescript
describe('RabbitMQ Configuration', () => {
    it('should declare queues without conflicts', async () => {
        // Teste de integração API + Worker + RabbitMQ
    });

    it('should handle configuration changes gracefully', async () => {
        // Teste de mudança de configuração
    });
});
```

## 📞 Contato e Suporte

### P0 - Produção Quebrada

1. **Slack**: `#alerts-rabbitmq`
2. **PagerDuty**: Escalar imediatamente
3. **Runbook**: Este documento

### P1 - Degradação de Serviço

1. **Monitoramento**: Verificar dashboards
2. **Logs**: Coletar logs detalhados
3. **Rollback**: Se necessário

### P2 - Problema Intermitente

1. **Monitoramento**: Alertas automáticos
2. **Investigação**: Análise de padrões

## 📚 Referências

- [RabbitMQ Queue Declaration](https://www.rabbitmq.com/queues.html#declaring)
- [NestJS RabbitMQ Documentation](https://docs.nestjs.com/microservices/basics#rabbitmq)
- [Queue Arguments](https://www.rabbitmq.com/docs/queue-arguments)

---

**Última atualização**: $(date)
**Versão**: 1.0
**Responsável**: SRE Team
