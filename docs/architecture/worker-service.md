# Serviço de Workers AST

## Objetivo

Consumir jobs do RabbitMQ, executar os use cases pesados (initialize repository, initialize impact analysis), atualizar status da task no Postgres e armazenar artefatos usando o fluxo atual do `RepositoryManager`, com observabilidade e retries controlados.

## Estrutura do Projeto

```
apps/
  api/        (Nest HTTP)
  worker/     (novo bootstrap Nest ou Node standalone)
libs/
  task-persistence/  (TaskRepository, DTOs)
  queue/             (Rabbit publishers/consumers)
```

### Entrypoint (`apps/worker/src/main.ts`)

- Lê env vars (`RABBIT_URL`, `RABBIT_VHOST`, `RABBIT_PREFETCH`, `POSTGRES_URL`, ...).
- Inicializa logger (`Pino`).
- Abre conexão Postgres com pool dedicado (`pg`).
- Cria conexão Rabbit (amqplib) com canal confirm para DLX, canal consumer para jobs.
- Configura `prefetch` (default 1) e subscribe nas filas necessárias.
- Registra signal handlers (`SIGINT`, `SIGTERM`) para `graceful shutdown` (stop consuming, ack/nack pendentes, fechar conexões).

### Consumer Flow

1. Recebe mensagem → desserializa payload.
2. Log inicial (`taskId`, `type`, `deliveryCount`).
3. `TaskExecutionService.start(job)`:
   - Recupera task (`SELECT ... FOR UPDATE`), verifica se já está `COMPLETED/CANCELLED`.
   - Atualiza status `IN_PROGRESS`, `state` inicial e `progress=0`.
4. Executa use case (ex.: `InitializeRepositoryUseCase`):
   - Passa `TaskContext` com métodos `updateState`, `updateProgress`, `complete`, `fail`.
   - Cada etapa importante chama `TaskRepository.update(...)` + `task_events`.
5. Em sucesso:
   - `TaskExecutionService.complete(taskId, state)` → `status=COMPLETED`, `progress=100`, grava `task_results` com os metadados (ex.: path) retornados pelo `RepositoryManager`.
   - Publica mensagem opcional em canal de eventos (SSE/Webhook).
   - `channel.ack`.
6. Em erro:
   - `TaskExecutionService.fail(taskId, error, state)`.
   - Decide: se `retry_count < maxTentativas` → republish na fila de retry; senão `channel.nack(requeue=false)` e deixa Rabbit enviar para DLQ.

### Use Cases

- Adaptar use cases existentes para receber `TaskContext` em vez de acessar `TaskManager` em memória.
- `TaskContext` expõe métodos idempotentes (usam `TaskRepository`):
  ```ts
  interface TaskContext {
      start(state: string): Promise<void>;
      update(state: string, progress?: number, metadata?: Record<string, any>): Promise<void>;
      complete(state: string, result?: any): Promise<void>;
      fail(error: string, state?: string): Promise<void>;
  }
  ```
- Use case chama `context.update(...)` após cada etapa relevante.

### Tratamento de Erros

- Categorizar erros: recuperável (rede, storage temporário) vs terminal (input inválido).
- Para recuperáveis: lançar `RetryableError` → worker repassa para fila de retry.
- Para terminais: `fail` e `ack` (não reprocessa).
- Implementar timeout global por job (`Promise.race` com `JOB_TIMEOUT_MS`).
- Registrar logs com stack trace, `taskId`, `step`.

### Observabilidade

- Métricas Prometheus:
  - `ast_worker_jobs_total{status=success|failed,type=...}`
  - `ast_worker_job_duration_seconds` (histogram)
  - `ast_worker_current_tasks` (gauge)
- Logs Pino (JSON) com `taskId`, `type`, `step`, `durationMs`, sempre sanitizando conteúdo sensível (nunca logar tokens, paths privados ou conteúdo de código).
- Tracing (OpenTelemetry SDK): span por job, subspans por step.

### Configuração de Runtime

- Variáveis chave:
  - `WORKER_ID` (para logs).
  - `RABBIT_PREFETCH` (1-5).
  - `MAX_RETRIES` (ex.: 3).
  - `JOB_TIMEOUT_MS` (ex.: 15 min).
  - `TEMP_DIR` (path com storage rápido).
- Limpeza: cronjob/daemon que apaga diretórios temporários após uso.

### Deployment

- Empacotar como imagem Docker `kodus-ast-worker`.
- ECS EC2 Service (ou docker-compose em VM) com Auto Scaling baseado em métrica de fila.
- Health-check custom: script que verifica conexão Rabbit/Postgres.
- Rolling update: 0 downtime (stop consuming, aguardar ack, subir nova versão).

### To-do no Código

- Criar módulo `TaskPersistenceModule` com repositório (Nest provider).
- Criar `QueueModule` com publisher/consumer abstraídos.
- Remover dependência de `TaskManagerService` em memória.
- Ajustar use cases para chamar `TaskContext` (garantir que updates de progress não travem).
- Escrever testes integrados (usar Rabbit/Postgres em docker-compose) para validar fim-a-fim.
