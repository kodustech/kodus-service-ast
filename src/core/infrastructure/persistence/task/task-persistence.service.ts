import { Inject, Injectable } from '@nestjs/common';
import { Pool, PoolClient } from 'pg';
import { v4 as uuid } from 'uuid';
import {
    AppendTaskEventInput,
    CreateTaskInput,
    ListTasksOptions,
    StoreTaskResultInput,
    TaskEventRecord,
    TaskRecord,
    UpdateTaskInput,
    UpdateTaskStatusInput,
} from './task-persistence.types.js';
import { TaskStatus } from '@/shared/types/task.js';
import {
    DATABASE_POOL,
    DATABASE_SCHEMA,
} from '@/core/infrastructure/database/database.constants.js';
import { qualifiedName } from '@/core/infrastructure/database/database.utils.js';

const STATUS_TO_DB: Record<TaskStatus, string> = {
    [TaskStatus.TASK_STATUS_UNSPECIFIED]: 'PENDING',
    [TaskStatus.TASK_STATUS_PENDING]: 'PENDING',
    [TaskStatus.TASK_STATUS_IN_PROGRESS]: 'IN_PROGRESS',
    [TaskStatus.TASK_STATUS_COMPLETED]: 'COMPLETED',
    [TaskStatus.TASK_STATUS_FAILED]: 'FAILED',
    [TaskStatus.TASK_STATUS_CANCELLED]: 'CANCELLED',
};

const DB_TO_STATUS: Record<string, TaskStatus> = {
    UNSPECIFIED: TaskStatus.TASK_STATUS_UNSPECIFIED,
    PENDING: TaskStatus.TASK_STATUS_PENDING,
    IN_PROGRESS: TaskStatus.TASK_STATUS_IN_PROGRESS,
    COMPLETED: TaskStatus.TASK_STATUS_COMPLETED,
    FAILED: TaskStatus.TASK_STATUS_FAILED,
    CANCELLED: TaskStatus.TASK_STATUS_CANCELLED,
};

function statusToDb(status: TaskStatus | undefined): string {
    if (status === undefined) {
        return STATUS_TO_DB[TaskStatus.TASK_STATUS_UNSPECIFIED];
    }
    return (
        STATUS_TO_DB[status] ?? STATUS_TO_DB[TaskStatus.TASK_STATUS_UNSPECIFIED]
    );
}

function statusFromDb(value: string | null | undefined): TaskStatus {
    if (!value) {
        return TaskStatus.TASK_STATUS_UNSPECIFIED;
    }
    return DB_TO_STATUS[value] ?? TaskStatus.TASK_STATUS_UNSPECIFIED;
}

function clampProgress(progress?: number): number | undefined {
    if (progress === undefined || progress === null) {
        return undefined;
    }
    if (Number.isNaN(progress)) {
        return undefined;
    }
    return Math.min(100, Math.max(0, progress));
}

@Injectable()
export class TaskPersistenceService {
    private readonly tasksTable: string;
    private readonly taskEventsTable: string;
    private readonly taskResultsTable: string;

    constructor(
        @Inject(DATABASE_POOL) private readonly pool: Pool,
        @Inject(DATABASE_SCHEMA) private readonly schema: string,
    ) {
        this.tasksTable = qualifiedName(schema, 'tasks');
        this.taskEventsTable = qualifiedName(schema, 'task_events');
        this.taskResultsTable = qualifiedName(schema, 'task_results');
    }

    async createTask(input: CreateTaskInput): Promise<TaskRecord> {
        const taskId = uuid();
        const {
            type,
            state = 'Queued',
            priority = 1,
            metadata = {},
            inputHash = null,
            actor = 'API',
            detail = {},
            status = TaskStatus.TASK_STATUS_PENDING,
        } = input;

        return this.withTransaction(async (client) => {
            const insertTask = `
                INSERT INTO ${this.tasksTable} (id, type, status, state, priority, metadata, input_hash)
                VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
                RETURNING *
            `;

            const taskRows = await client.query(insertTask, [
                taskId,
                type,
                statusToDb(status),
                state,
                priority,
                JSON.stringify(metadata ?? {}),
                inputHash,
            ]);

            const insertEvent = `
                INSERT INTO ${this.taskEventsTable} (id, task_id, status, state, detail, actor)
                VALUES ($1, $2, $3, $4, $5::jsonb, $6)
            `;

            await client.query(insertEvent, [
                uuid(),
                taskId,
                statusToDb(status),
                state,
                JSON.stringify(detail ?? {}),
                actor,
            ]);

            return this.mapTaskRow(taskRows.rows[0]);
        });
    }

    async updateTaskStatus(input: UpdateTaskStatusInput): Promise<void> {
        await this.updateTask({ ...input });
    }

    async updateTask(input: UpdateTaskInput): Promise<void> {
        const {
            taskId,
            status,
            state,
            progress,
            metadata,
            error,
            priority,
            actor = 'WORKER',
            detail = {},
            incrementRetry = false,
        } = input;

        await this.withTransaction(async (client) => {
            const selectForUpdate = `
                SELECT * FROM ${this.tasksTable}
                WHERE id = $1
            `;

            const existing = await client.query(selectForUpdate, [taskId]);
            if (existing.rowCount === 0) {
                throw new Error(`Task with id ${taskId} not found`);
            }

            const current = existing.rows[0];

            const mergedMetadata = metadata
                ? { ...(current.metadata ?? {}), ...metadata }
                : (current.metadata ?? {});

            const nextStatusDb = statusToDb(
                status ?? statusFromDb(current.status),
            );
            const nextState = state ?? current.state;
            const nextProgress =
                clampProgress(progress) ?? current.progress ?? 0;
            const nextError =
                error !== undefined ? error : (current.error ?? null);
            const nextPriority = priority ?? current.priority ?? 1;

            const update = `
                UPDATE ${this.tasksTable}
                SET
                    status = $1,
                    state = $2,
                    progress = $3,
                    metadata = $4::jsonb,
                    error = $5,
                    priority = $6,
                    retry_count = CASE WHEN $7 THEN retry_count + 1 ELSE retry_count END,
                    updated_at = NOW(),
                    version = version + 1
                WHERE id = $8
            `;

            await client.query(update, [
                nextStatusDb,
                nextState,
                nextProgress,
                JSON.stringify(mergedMetadata ?? {}),
                nextError,
                nextPriority,
                incrementRetry,
                taskId,
            ]);

            const insertEvent = `
                INSERT INTO ${this.taskEventsTable} (id, task_id, status, state, detail, actor)
                VALUES ($1, $2, $3, $4, $5::jsonb, $6)
            `;

            await client.query(insertEvent, [
                uuid(),
                taskId,
                nextStatusDb,
                nextState,
                JSON.stringify(detail ?? {}),
                actor,
            ]);
        });
    }

    async appendEvent({
        taskId,
        status,
        state,
        detail = {},
        actor = 'WORKER',
    }: AppendTaskEventInput): Promise<void> {
        await this.withTransaction(async (client) => {
            const insertEvent = `
                INSERT INTO ${this.taskEventsTable} (id, task_id, status, state, detail, actor)
                VALUES ($1, $2, $3, $4, $5::jsonb, $6)
            `;

            await client.query(insertEvent, [
                uuid(),
                taskId,
                statusToDb(status),
                state ?? null,
                JSON.stringify(detail ?? {}),
                actor,
            ]);
        });
    }

    async storeResult({
        taskId,
        payload,
    }: StoreTaskResultInput): Promise<void> {
        const upsert = `
            INSERT INTO ${this.taskResultsTable} (task_id, payload)
            VALUES ($1, $2::jsonb)
            ON CONFLICT (task_id)
            DO UPDATE SET payload = EXCLUDED.payload, created_at = NOW()
        `;

        await this.pool.query(upsert, [taskId, JSON.stringify(payload ?? {})]);
    }

    async storeTaskResult(
        input: StoreTaskResultInput,
    ): Promise<{ payload: Record<string, unknown> }> {
        const { taskId, payload } = input;

        const upsert = `
            INSERT INTO ${this.taskResultsTable} (task_id, payload)
            VALUES ($1, $2)
            ON CONFLICT (task_id)
            DO UPDATE SET
                payload = $2,
                created_at = NOW()
            RETURNING payload
        `;

        const result = await this.pool.query(upsert, [
            taskId,
            JSON.stringify(payload),
        ]);

        return { payload: result.rows[0].payload };
    }

    async getTaskResult(
        taskId: string,
    ): Promise<{ payload: Record<string, unknown> } | null> {
        const result = await this.pool.query(
            `SELECT payload FROM ${this.taskResultsTable} WHERE task_id = $1`,
            [taskId],
        );

        if (result.rows.length === 0) {
            return null;
        }

        return { payload: result.rows[0].payload };
    }

    async deleteTask(taskId: string): Promise<void> {
        await this.pool.query(`DELETE FROM ${this.tasksTable} WHERE id = $1`, [
            taskId,
        ]);
    }

    async deleteTasks(taskIds: string[]): Promise<void> {
        if (taskIds.length === 0) {
            return;
        }
        const placeholders = taskIds.map((_, idx) => `$${idx + 1}`).join(',');
        await this.pool.query(
            `DELETE FROM ${this.tasksTable} WHERE id IN (${placeholders})`,
            taskIds,
        );
    }

    async clearTasks(): Promise<void> {
        await this.pool.query(`TRUNCATE TABLE ${this.tasksTable} CASCADE`);
    }

    async findTaskById(taskId: string): Promise<TaskRecord | null> {
        const query = `SELECT * FROM ${this.tasksTable} WHERE id = $1`;
        const result = await this.pool.query(query, [taskId]);
        if (result.rowCount === 0) {
            return null;
        }
        return this.mapTaskRow(result.rows[0]);
    }

    async listTasks(options: ListTasksOptions = {}): Promise<TaskRecord[]> {
        const { limit } = options;
        const query = limit
            ? `SELECT * FROM ${this.tasksTable} ORDER BY created_at DESC LIMIT $1`
            : `SELECT * FROM ${this.tasksTable} ORDER BY created_at DESC`;
        const result = await this.pool.query(query, limit ? [limit] : []);
        return result.rows.map((row) => this.mapTaskRow(row));
    }

    async findTasksUpdatedBefore(threshold: Date): Promise<TaskRecord[]> {
        const query = `
            SELECT *
            FROM ${this.tasksTable}
            WHERE updated_at < $1
        `;
        const result = await this.pool.query(query, [threshold]);
        return result.rows.map((row) => this.mapTaskRow(row));
    }

    async getTaskEvents(
        taskId: string,
        limit = 20,
    ): Promise<TaskEventRecord[]> {
        const query = `
            SELECT *
            FROM ${this.taskEventsTable}
            WHERE task_id = $1
            ORDER BY created_at DESC
            LIMIT $2
        `;
        const result = await this.pool.query(query, [taskId, limit]);
        return result.rows.map((row) => this.mapTaskEventRow(row));
    }

    private async withTransaction<T>(
        fn: (client: PoolClient) => Promise<T>,
    ): Promise<T> {
        const client = await this.pool.connect();
        try {
            await client.query('BEGIN');
            const result = await fn(client);
            await client.query('COMMIT');
            return result;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    private mapTaskRow(row: any): TaskRecord {
        return {
            id: row.id,
            type: row.type,
            status: statusFromDb(row.status),
            state: row.state,
            progress: row.progress ?? 0,
            priority: row.priority ?? 1,
            metadata: row.metadata ?? {},
            error: row.error ?? null,
            inputHash: row.input_hash ?? null,
            retryCount: row.retry_count ?? 0,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
            version: row.version ?? 0,
        };
    }

    private mapTaskEventRow(row: any): TaskEventRecord {
        return {
            id: row.id,
            taskId: row.task_id,
            status: statusFromDb(row.status),
            state: row.state ?? null,
            detail: row.detail ?? {},
            actor: row.actor,
            createdAt: row.created_at,
        };
    }
}
