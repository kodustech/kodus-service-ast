import { TaskStatus } from '@/core/domain/task/enums/task-status.enum';

export interface CreateTaskInput {
    type: string;
    state?: string;
    priority?: number;
    metadata?: Record<string, unknown>;
    inputHash?: string | null;
    actor?: string;
    detail?: Record<string, unknown>;
    status?: TaskStatus;
}

export interface UpdateTaskStatusInput {
    taskId: string;
    status: TaskStatus;
    state?: string;
    progress?: number;
    metadata?: Record<string, unknown>;
    error?: string | null;
    actor?: string;
    detail?: Record<string, unknown>;
}

export interface UpdateTaskInput {
    taskId: string;
    status?: TaskStatus;
    state?: string;
    progress?: number;
    metadata?: Record<string, unknown>;
    error?: string | null;
    priority?: number;
    actor?: string;
    detail?: Record<string, unknown>;
    incrementRetry?: boolean;
}

export interface StoreTaskResultInput {
    taskId: string;
    payload: Record<string, unknown>;
}

export interface AppendTaskEventInput {
    taskId: string;
    status: TaskStatus;
    state?: string | null;
    detail?: Record<string, unknown>;
    actor?: string;
}

export interface TaskRecord {
    id: string;
    type: string;
    status: TaskStatus;
    state: string;
    progress: number;
    priority: number;
    metadata: Record<string, unknown>;
    error: string | null;
    inputHash: string | null;
    retryCount: number;
    createdAt: Date;
    updatedAt: Date;
    version: number;
}

export interface TaskEventRecord {
    id: string;
    taskId: string;
    status: TaskStatus;
    state: string | null;
    detail: Record<string, unknown>;
    actor: string;
    createdAt: Date;
}

export interface ListTasksOptions {
    limit?: number;
}
