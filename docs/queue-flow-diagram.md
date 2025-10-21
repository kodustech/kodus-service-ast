# Diagrama de Fluxo das Filas RabbitMQ

## 🏗️ Arquitetura das Filas

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              RABBITMQ TOPOLOGY                                │
└─────────────────────────────────────────────────────────────────────────────────┘

┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   EXCHANGES     │    │     QUEUES      │    │   ROUTING       │
├─────────────────┤    ├─────────────────┤    ├─────────────────┤
│ ast.jobs.x      │    │ ast.initialize  │    │ ast.initialize  │
│ (Principal)     │◄───┤ .repo.q         │◄───┤ .repo           │
│                 │    │                 │    │                 │
│ ast.jobs.dlx    │    │ ast.initialize  │    │ ast.initialize  │
│ (Dead Letter)   │◄───┤ .impact.q       │◄───┤ .impact         │
│                 │    │                 │    │                 │
│ ast.jobs.delayed│    │ ast.jobs.dlq    │    │ # (catch-all)   │
│ (Delayed)       │    │ (Dead Letter)   │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

## 🔄 Fluxo de Mensagens

### 1. **DISPATCH (Publicação)**
```
Publisher → ast.jobs.x → Routing Key → Queue
```

### 2. **PROCESSAMENTO NORMAL**
```
Queue → Consumer → Processamento → ACK
```

### 3. **FALHAS E RETRY**
```
Queue → Consumer → FALHA → NACK → Retry (até 5x)
```

### 4. **DEAD LETTER FLOW**
```
Após 5 tentativas → x-dead-letter-exchange → ast.jobs.dlx → ast.jobs.dlq
```

## ⏰ TTL (Time To Live)

### **Configuração Atual:**
- **Retry TTL**: 60 segundos (RABBIT_RETRY_TTL_MS)
- **Delivery Limit**: 3 tentativas (x-delivery-limit)
- **Message TTL**: Configurável por fila

### **Quando TTL é Aplicado:**

```
┌─────────────────────────────────────────────────────────────────┐
│                        TTL TIMELINE                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Mensagem Publicada                                            │
│  ↓                                                             │
│  Consumer Processa (SUCESSO) → ACK → FIM                       │
│  ↓                                                             │
│  Consumer Falha → NACK → Retry (1/3)                           │
│  ↓                                                             │
│  Aguarda TTL (60s) → Retry (2/3)                               │
│  ↓                                                             │
│  Aguarda TTL (60s) → Retry (3/3)                               │
│  ↓                                                             │
│  Após 3 tentativas → DEAD LETTER QUEUE                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 🚨 Dead Letter Queue (DLQ)

### **Quando uma mensagem vai para DLQ:**

1. **Delivery Limit Excedido**: Após 3 tentativas de processamento
2. **TTL Expirado**: Mensagem ficou muito tempo na fila
3. **Rejeição Manual**: Consumer rejeita explicitamente
4. **Fila Cheia**: Quando a fila atinge limite de capacidade

### **Fluxo para DLQ:**
```
┌─────────────────────────────────────────────────────────────────┐
│                    DEAD LETTER FLOW                           │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  Queue Principal                                               │
│  ↓ (falha após 5 tentativas)                                   │
│  x-dead-letter-exchange: ast.jobs.dlx                          │
│  ↓                                                             │
│  ast.jobs.dlx (Dead Letter Exchange)                           │
│  ↓ (routing key: #)                                            │
│  ast.jobs.dlq (Dead Letter Queue)                              │
│  ↓                                                             │
│  [MENSAGEM MORTA - REQUER INTERVENÇÃO MANUAL]                  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## 🔧 Configurações Técnicas

### **Queue Arguments:**
```json
{
  "x-queue-type": "quorum",
  "x-dead-letter-exchange": "ast.jobs.dlx",
  "x-delivery-limit": 5,
  "x-message-ttl": 30000
}
```

### **Message Properties:**
```json
{
  "persistent": true,
  "contentType": "application/json",
  "messageId": "task-123",
  "correlationId": "task-123",
  "headers": {
    "x-task-type": "AST_INITIALIZE_REPOSITORY",
    "x-retry-count": 0
  }
}
```

## 📊 Monitoramento

### **Métricas Importantes:**
- **Queue Length**: Número de mensagens pendentes
- **Consumer Count**: Número de consumers ativos
- **Message Rate**: Mensagens por segundo
- **DLQ Length**: Mensagens mortas

### **Alertas Recomendados:**
- DLQ com mensagens > 0
- Queue length > threshold
- Consumer count = 0
- Message rate muito baixo

## 🛠️ Troubleshooting

### **Mensagens na DLQ:**
1. Verificar logs do consumer
2. Analisar payload da mensagem
3. Verificar dependências externas
4. Reprocessar manualmente se necessário

### **Performance Issues:**
1. Ajustar prefetch count
2. Aumentar número de consumers
3. Otimizar processamento
4. Verificar recursos do servidor
