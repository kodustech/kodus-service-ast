import { type PoolClient } from 'pg';
import { qualifiedName } from './database.utils.js';

export interface DatabaseMigration {
    id: string;
    description: string;
    up: (client: PoolClient, schema: string) => Promise<void>;
}

async function runStatement(client: PoolClient, sql: string): Promise<void> {
    if (sql.trim() === '') {
        return;
    }
    await client.query(sql);
}

export const DATABASE_MIGRATIONS: DatabaseMigration[] = [
    {
        id: '001_initial_schema',
        description:
            'Create tasks, task_events, task_results tables and indexes',
        up: async (client, schema) => {
            const tasksTable = qualifiedName(schema, 'tasks');
            const taskEventsTable = qualifiedName(schema, 'task_events');
            const taskResultsTable = qualifiedName(schema, 'task_results');

            await runStatement(
                client,
                `CREATE TABLE IF NOT EXISTS ${tasksTable} (
                    id UUID PRIMARY KEY,
                    type VARCHAR(128) NOT NULL,
                    status VARCHAR(32) NOT NULL,
                    state VARCHAR(256) NOT NULL DEFAULT 'Created',
                    progress SMALLINT NOT NULL DEFAULT 0,
                    priority SMALLINT NOT NULL DEFAULT 1,
                    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
                    error TEXT,
                    input_hash CHAR(64),
                    retry_count INTEGER NOT NULL DEFAULT 0,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    version INTEGER NOT NULL DEFAULT 0,
                    CHECK (status IN ('PENDING','IN_PROGRESS','COMPLETED','FAILED','CANCELLED')),
                    CHECK (progress BETWEEN 0 AND 100)
                )`,
            );

            await runStatement(
                client,
                `CREATE TABLE IF NOT EXISTS ${taskEventsTable} (
                    id UUID PRIMARY KEY,
                    task_id UUID NOT NULL,
                    status VARCHAR(32) NOT NULL,
                    state VARCHAR(256),
                    detail JSONB NOT NULL DEFAULT '{}'::jsonb,
                    actor VARCHAR(128) NOT NULL DEFAULT 'WORKER',
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    CONSTRAINT fk_task_events_task
                        FOREIGN KEY (task_id)
                        REFERENCES ${tasksTable} (id)
                        ON DELETE CASCADE
                )`,
            );

            await runStatement(
                client,
                `CREATE TABLE IF NOT EXISTS ${taskResultsTable} (
                    task_id UUID PRIMARY KEY,
                    payload JSONB NOT NULL DEFAULT '{}'::jsonb,
                    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                    CONSTRAINT fk_task_results_task
                        FOREIGN KEY (task_id)
                        REFERENCES ${tasksTable} (id)
                        ON DELETE CASCADE
                )`,
            );

            await runStatement(
                client,
                `CREATE UNIQUE INDEX IF NOT EXISTS idx_tasks_type_input_hash
                    ON ${tasksTable} (type, input_hash)
                    WHERE input_hash IS NOT NULL`,
            );

            await runStatement(
                client,
                `CREATE INDEX IF NOT EXISTS idx_tasks_status_updated_at
                    ON ${tasksTable} (status, updated_at DESC)`,
            );

            await runStatement(
                client,
                `CREATE INDEX IF NOT EXISTS idx_task_events_task_created
                    ON ${taskEventsTable} (task_id, created_at DESC)`,
            );

            await runStatement(
                client,
                `CREATE INDEX IF NOT EXISTS idx_task_events_status_created
                    ON ${taskEventsTable} (status, created_at DESC)`,
            );
        },
    },
];

export const MIGRATIONS_TABLE = (schema: string): string =>
    `${qualifiedName(schema, 'schema_migrations')}`;

export const CREATE_MIGRATIONS_TABLE = (schema: string): string => {
    const table = qualifiedName(schema, 'schema_migrations');
    return `
        CREATE TABLE IF NOT EXISTS ${table} (
            id VARCHAR(128) PRIMARY KEY,
            description TEXT NOT NULL,
            executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `;
};
