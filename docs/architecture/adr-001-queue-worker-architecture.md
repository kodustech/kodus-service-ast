# ADR-001: Arquitetura com RabbitMQ e Workers para o AST Service

## Contexto

- O `kodus-service-ast` expõe operações pesadas (clone de repositório, construção de grafo e análise de impacto).
- A versão atual usa gRPC + polling com um `TaskManager` em memória, o que causa perda de estado e instabilidade (taskId não encontrado, queda em multi-pod).
- Volume esperado: várias requisições pesadas por minuto, multi-clientes, com workflows que levam minutos.
- Objetivo: substituir o polling volátil por uma arquitetura resiliente com fila RabbitMQ 4.1.4, persistência durável e workers dedicados.

## Decisão

1. **Split API x Worker**
   - `ast-api`: processo HTTP leve (Nest) somente para receber requisições, validar e persistir tasks.
   - `ast-worker`: processo dedicado a consumir jobs do RabbitMQ e executar use cases pesados.

2. **Fila RabbitMQ 4.1.4 (quorum queues)**
   - Exchange `ast.jobs.x` (topic).
   - Filas quorum: `ast.initialize.repo.q`, `ast.initialize.impact.q` com `x-delivery-limit` e DLX `ast.jobs.dlx` → `ast.jobs.dlq`.
   - Mensagem carrega `taskId`, tipo, payload sanitizado, `traceId`, `retryCount`.

3. **Persistência no Postgres**
   - Tabela `tasks` (status, state, progress, priority, metadata, erro, timestamps, version, input_hash).
   - `task_events` (timeline) e `task_results` (artefatos resumidos / ponteiros para storage externo).
   - Todas as atualizações de status passam por repositório transacional; estado não fica mais em memória.

4. **Infraestrutura alvo (sem K8s)**
   - `ast-api` em ECS Fargate (stateless, autoscaling por ALB).
   - `ast-worker` em ECS EC2 (instâncias otimizadas para CPU/IO, storage local).
   - RabbitMQ gerenciado (AWS MQ ou CloudAMQP) ou cluster EC2 dedicado.
   - Postgres gerenciado (RDS/Cloud SQL) com replicação.
- Artefatos gerados continuam sendo gravados pelo `RepositoryManager` no storage já utilizado hoje (arquivos no repositório do cliente ou diretório compartilhado). Podemos reavaliar mover para S3 no futuro.

## Consequências

- **Prós**
  - Trabalhos longos não derrubam API; filas absorvem picos e garantem retry controlado.
  - Status consistente (persistido) permite polling, SSE e histórico.
  - Escala independente: API sobe via Fargate, workers ajustam por depth da fila.

- **Contras/Riscos**
  - Necessário operar RabbitMQ e Postgres com HA (monitoramento/alertas). Casos de falha na fila requerem playbooks.
  - Migração do protocolo (gRPC → HTTP) exige atualizar `kodus-ai` e clientes.
  - Código atual precisa de refactor grande (remoção TaskManager em memória, criação de Worker app).

- **Ações**
  - Modelar schema Postgres e migrations.
  - Implementar TaskRepository + TaskService usando `pg` (queries SQL) + publisher RabbitMQ.
  - Criar Worker app com consumer Rabbit e integração aos use cases.
  - Remover controllers gRPC; expor rotas HTTP com responses `202 + taskId` e `GET /tasks/{id}`.
  - Configurar observabilidade (Prometheus, logs com `taskId`, alertas para filas e falhas).

## Segurança

- Dados sensíveis (tokens, conteúdo de código, diffs) não devem aparecer em logs; adicionar sanitização nos pontos de logging da API e dos workers.
- Forçar TLS em todas as conexões (ALB → API, API ↔ RabbitMQ/Postgres) e usar credenciais segregadas por serviço.
- Persistir apenas metadados necessários nos registros das tasks; payloads completos continuam sob controle do `RepositoryManager`.
- Implementar revisão periódica de permissões (IAM roles, usuários Rabbit/Postgres) e rotação de segredos.
- Adotar monitoramento para detectar acessos anômalos e configurar alertas para falhas de autenticação ou volume incomum de jobs por cliente.

## Status

Aprovado (01/ADR). Base para planejamento de refactor.
