# RabbitMQ 4.1.4 – Contrato de Filas

## Exchanges & Filas

- **Exchange**: `ast.jobs.x`
  - Tipo: `topic`
  - Durable: `true`

- **Filas principais (quorum queues)**
  - `ast.initialize.repo.q`
    - Binding key: `ast.initialize.repo`
    - `x-queue-type`: `quorum`
    - `x-delivery-limit`: `5`
    - `x-dead-letter-exchange`: `ast.jobs.dlx`
  - `ast.initialize.impact.q`
    - Binding key: `ast.initialize.impact`
    - Mesma configuração da fila acima.

- **Dead-letter**
  - Exchange: `ast.jobs.dlx` (tipo `topic`)
  - Fila: `ast.jobs.dlq` (quorum)
    - Usada para mensagens que excederem `delivery-limit` ou forem `nack` com `requeue=false`.

- **Retry opcional**
  - Fila `ast.jobs.retry.q`
    - `x-dead-letter-exchange`: `ast.jobs.x`
    - `x-message-ttl`: `30000` (exemplo 30s)
  - Mensagens com erro temporário são encaminhadas para esta fila para retentativa com backoff.

## Payload da Mensagem

```json
{
  "taskId": "uuid-v4",
  "type": "INITIALIZE_REPOSITORY",    // enum
  "payload": {                         // request sanitizado
    "baseRepo": {...},
    "headRepo": {...},
    "filePaths": ["..."],
    "priority": 2
  },
  "metadata": {
    "traceId": "...",
    "tenantId": "...",
    "createdAt": "2024-03-12T10:00:00Z"
  },
  "retryCount": 0
}
```

- Campo `type` deve casar com enum usado no worker.
- `payload` guarda somente dados necessários para executar; remover tokens sensíveis (já resolvidos antes).
- `metadata.traceId` propaga contexto de trace/logs.

## Headers AMQP

- `x-task-id`: `taskId`
- `x-task-type`: `type`
- `x-retry-count`: incrementado a cada tentativa
- `x-trace-id`: para observabilidade
- `content-type`: `application/json`
- `delivery-mode`: `2` (persistente)

## Política de Retry

1. Worker processa e, em caso de sucesso, `ack`.
2. Em erro recuperável (ex.: falha temporária em Git), worker:
   - Atualiza tarefa (`status=FAILED`, `retry_count++`, `error`).
   - Re-publica na `retry.q` (ou `nack requeue=true`).
3. Rabbit reapresenta mensagem após TTL (caso `retry.q`).
4. Ao exceder `x-delivery-limit`, mensagem vai para `ast.jobs.dlq`.

## Conexões & Segurança

- VHost dedicado: `/ast`
- Usuários separados: `ast_api` (publish), `ast_worker` (consume), `ast_monitor` (read-only).
- TLS obrigatório (`amqps://`).
- Prefetch por consumer: iniciar com `1`, ajustar conforme recursos.

## Observabilidade

- Métricas chave: `messages_ready`, `messages_unacknowledged`, `deliver_get`, `redeliveries`, `ack_rate`, `nack_rate`, `queue.drift`.
- Alertas: fila acima de limiar, ausência de consumers, taxa de erro alta.
- Logs: habilitar `firehose`/fwd para stack de logs central.

## Provisionamento

- Declarar infraestrutura via Terraform/CloudAMQP API.
- Scripts de bootstrap (ansible ou ts-node) para criar exchanges/queues com bindings.
- Atualizações controladas (RabbitMQ 4.1.4, política de upgrade rolling).
