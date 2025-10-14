# Plano de Refactor AST Service

## Contexto
- Remoção total do legado gRPC/proto.
- Exposição HTTP (`/api/ast/*`, `GET /api/tasks/:id`) com responses `202 {taskId}`.
- Persistência durável de tasks (`TaskPersistenceService` + Postgres) já integrada aos use cases.
- Próximas etapas: finalizar o worker dedicado e observabilidade.

## Histórico do que já foi feito
- Criado pacote local de tipos (`src/shared/types/ast.ts`, `task.ts`, `serialization.ts`) e serializer utilitário (`src/shared/utils/ast-serialization.ts`).
- Ajuste dos use cases/serviços para consumir os novos tipos locais.
- Rotas HTTP (`AstHttpController`, `TaskHttpController`) migradas para usar TaskService e TaskPersistence em vez de gRPC.
- `TaskPersistenceModule` operacional com repositórios e migrations conforme docs.
- TaskService agora publica tarefas no RabbitMQ via `QueueModule` + `RabbitTaskDispatcher`.
- Worker (`src/worker/main.ts`) inicializado com `RabbitTaskConsumer` consumindo RabbitMQ e roteando para os use cases.
- Build (`yarn build`) validando o estado atual.

## Próximas atividades principais
1. **Worker dedicado (`ast-worker`)**
   - Evoluir `TaskContext` persistente para permitir atualizações parciais pelos use cases.
   - Implementar política de retry/backoff (fila `retry.q`, `RetryableError`).
   - Adicionar sinais de saúde (verificação de conexão, readiness) e encerramento suave.

2. **Observabilidade & Segurança**
   - Logs Pino com `taskId`, eventos de fila.
   - Métricas (Prometheus) para jobs/queues.
   - Garantir sanitização de dados sensíveis.

3. **Documentação & Automação**
   - Atualizar README/ADRs com o novo fluxo (HTTP + Rabbit + Worker).
   - Adicionar scripts de provisionamento/infra (exchange/filas) e testes integrados.

## Ações imediatas (em andamento)
- Criar `TaskContext` dedicado para o worker (with locking/versionamento) integrado ao `TaskPersistenceService`.
- Mapear e implementar política de retries (fila `retry.q`, limiares, headers `x-retry-count`).
- Adicionar scripts/infra para provisionar exchanges/filas em ambientes gerenciados.
