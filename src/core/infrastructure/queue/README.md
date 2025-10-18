# RabbitMQ Queue Configuration

Este documento descreve a configuração centralizada das filas RabbitMQ para o serviço AST.

## Arquitetura

```
ast.jobs.x (exchange topic)
├── ast.initialize.repo.q → Worker (InitializeRepositoryUseCase)
├── ast.initialize.impact.q → Worker (InitializeImpactAnalysisUseCase)
└── ast.jobs.dlx (dead letter exchange)
    └── ast.jobs.dlq (dead letter queue)
```

## Configuração Centralizada

Todas as constantes de configuração estão definidas em [`queue.constants.ts`](./queue.constants.ts):

```typescript
export const QUEUE_CONFIG = {
    // Exchanges
    EXCHANGE: 'ast.jobs.x',
    DEAD_LETTER_EXCHANGE: 'ast.jobs.dlx',

    // Queues
    REPO_QUEUE: 'ast.initialize.repo.q',
    IMPACT_QUEUE: 'ast.initialize.impact.q',
    DEAD_LETTER_QUEUE: 'ast.jobs.dlq',
    ECHO_QUEUE: 'ast.test.echo.q',

    // Routing Keys
    REPO_ROUTING_KEY: 'ast.initialize.repo',
    IMPACT_ROUTING_KEY: 'ast.initialize.impact',
    ECHO_ROUTING_KEY: 'ast.test.echo',

    // Queue Settings
    DELIVERY_LIMIT: 5,
    QUEUE_TYPE: 'quorum',
} as const;

// Configuração runtime baseada em variáveis de ambiente
export function getQueueRuntimeConfig() {
    return {
        enableSingleActiveConsumer: getEnvVariable('RABBIT_SAC') === 'true',
        retryTtlMs: Number(getEnvVariable('RABBIT_RETRY_TTL_MS') ?? '30000'),
        prefetch: Number(getEnvVariable('RABBIT_PREFETCH') ?? '1'),
        publishTimeoutMs: Number(
            getEnvVariable('RABBIT_PUBLISH_TIMEOUT_MS') ?? '5000',
        ),
    };
}
```

## Argumentos das Filas

### Filas de Trabalho (repo/impact)

```typescript
{
    'x-queue-type': 'quorum',
    'x-dead-letter-exchange': 'ast.jobs.dlx',
    'x-delivery-limit': 5,
}
```

### Fila Dead Letter

```typescript
{
    'x-queue-type': 'quorum',
}
```

## Uso nos Decorators

```typescript
@RabbitSubscribe({
    exchange: QUEUE_CONFIG.EXCHANGE,
    routingKey: QUEUE_CONFIG.REPO_ROUTING_KEY,
    queue: QUEUE_CONFIG.REPO_QUEUE,
    queueOptions: buildConsumerQueueOptions({
        deadLetterExchange: QUEUE_CONFIG.DEAD_LETTER_EXCHANGE,
        deliveryLimit: QUEUE_CONFIG.DELIVERY_LIMIT,
    }),
})
```

## Funções Utilitárias

- `buildQueueArguments(options)` - Constrói argumentos de fila dinamicamente
- `buildConsumerQueueOptions(options)` - Configuração padrão para consumers

## Troubleshooting

### Erro 406 PRECONDITION_FAILED

1. Execute `./scripts/cleanup-rabbitmq.sh`
2. Reinicie API + Worker

### Filas Não Declaradas

Verifique se `@RabbitSubscribe` tem `queueOptions` com argumentos corretos.

### Configuração de Ambiente

```bash
# RabbitMQ
RABBIT_URL=amqp://localhost:5672
RABBIT_PREFETCH=1
RABBIT_RETRY_TTL_MS=30000

# Opcional - sobrescrever defaults
RABBIT_EXCHANGE=ast.jobs.x
RABBIT_DLX=ast.jobs.dlx
RABBIT_DLQ=ast.jobs.dlq
```

## Desenvolvimento

### Adicionando Nova Fila

1. Adicione constantes em `QUEUE_CONFIG`
2. Atualize `TASK_QUEUE_BINDINGS` em `task-queue.definition.ts`
3. Adicione `@RabbitSubscribe` no consumer
4. Atualize este README
