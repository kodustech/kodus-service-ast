# Persistência de Tasks

## Tabelas

```sql
CREATE TABLE tasks (
    id UUID PRIMARY KEY,
    type TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('PENDING','IN_PROGRESS','COMPLETED','FAILED','CANCELLED')),
    state TEXT NOT NULL,
    progress SMALLINT NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
    priority SMALLINT NOT NULL DEFAULT 1,
    metadata JSONB NOT NULL DEFAULT '{}',
    error TEXT,
    input_hash CHAR(64),
    retry_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    version INTEGER NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX uniq_task_type_input_hash
    ON tasks(type, input_hash)
    WHERE input_hash IS NOT NULL;

CREATE INDEX idx_tasks_status_updated_at
    ON tasks(status, updated_at DESC);

CREATE TABLE task_events (
    id UUID PRIMARY KEY,
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    state TEXT,
    detail JSONB,
    actor TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_task_events_task_created
    ON task_events(task_id, created_at DESC);

CREATE INDEX idx_task_events_status_created
    ON task_events(status, created_at DESC);

CREATE TABLE task_results (
    task_id UUID PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
    payload JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE schema_migrations (
    id VARCHAR(128) PRIMARY KEY,
    description TEXT NOT NULL,
    executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## Regras & Fluxo

1. **Criação de task**
   - API inicia transação.
   - Calcula `input_hash` (sha256 do payload relevante) para idempotência opcional.
   - Insere em `tasks` com status `PENDING`, `state='Queued'`, `progress=0`.
   - Insere `task_events` (`status='PENDING'`, `actor='API'`, detail com request resumo).
   - Commit e, somente depois, publica mensagem no RabbitMQ.

2. **Atualização (Worker)**
   - Worker carrega task atual (`SELECT ... FOR UPDATE`).
   - Atualiza `status`, `state`, `progress`, `metadata`, `error`, `retry_count` conforme passo.
   - Incrementa `version` para locking otimista.
   - Insere `task_events` com `actor='WORKER'`, `detail` descrevendo etapa.
   - Ao final, se gerar artefato, escreve em storage externo e salva JSON leve em `task_results`.

3. **Idempotência & Retries**
   - Antes de executar, worker verifica `status`. Se já for `COMPLETED`, ignora (job reentregue).
   - `retry_count` incrementado em cada tentativa. `status=FAILED` permanece com detalhe do erro.
   - Endpoint futuro `POST /tasks/{id}:retry` pode resetar `status` para `PENDING`, `retry_count=0` e republicar.

4. **Cancelamento**
   - API define `status='CANCELLED'`, `state='Cancelled by user'`.
   - Worker deve checar `status` antes de continuar cada step e interromper se encontrar `CANCELLED`.

5. **Limpeza**
   - Job agendado remove tasks concluídas há X dias ou arquiva JSON em cold storage.
   - `task_events` pode ser particionado ou limpo via janela móvel (ex.: manter 30 dias).

6. **Consultas**
   - `GET /tasks/{id}`: SELECT na tabela `tasks`.
   - `GET /tasks/{id}/events`: SELECT de até 100 eventos recentes ordenados por data.

## Migrações / Inicialização

- O serviço executa automaticamente um runner de migrations (`DatabaseMigrationRunner`) ao subir, criando schema, tabelas, índices e registrando as versões aplicadas na tabela `schema_migrations` (por padrão usamos o schema `kodus_workflow`).
- Para ambientes gerenciados, a mesma DDL acima pode ser aplicada manualmente (Terraform, Liquibase ou scripts SQL versionados).
- Quando houver evolução de schema (ex.: novas colunas), criar scripts incrementais que sigam o mesmo padrão idempotente e sejam executados no bootstrap.
- Variáveis `DB_*` controlam a conexão; quando ausentes, são usados os mesmos valores já adotados em outros serviços (`API_PG_DB_*`).

## Considerações

- `metadata` guarda informações de contexto (repo, tenant, etc.) e deve ser compacta.
- `payload` em `task_results` guarda apenas metadados (ex.: caminho no diretório gerado pelo `RepositoryManager`), nunca o arquivo inteiro.
- Garantir fuso horário consistente (`timestamptz`).
- Configurar `pg_stat_statements` e `autovacuum` para lidar com alto volume de updates.
