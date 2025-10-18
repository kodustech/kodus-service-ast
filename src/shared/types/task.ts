import type { Timestamp } from './serialization.js';

export enum TaskStatus {
    TASK_STATUS_UNSPECIFIED = 0,
    TASK_STATUS_PENDING = 1,
    TASK_STATUS_IN_PROGRESS = 2,
    TASK_STATUS_COMPLETED = 3,
    TASK_STATUS_FAILED = 4,
    TASK_STATUS_CANCELLED = 5,
}

export enum TaskPriority {
    TASK_PRIORITY_UNSPECIFIED = 0,
    TASK_PRIORITY_LOW = 1,
    TASK_PRIORITY_MEDIUM = 2,
    TASK_PRIORITY_HIGH = 3,
}

export interface TaskMetadata {
    progress?: number;
    priority?: TaskPriority;
    error?: string | null;
    [key: string]: unknown;
}

export interface Task {
    id: string;
    status: TaskStatus;
    state: string;
    createdAt: Timestamp;
    updatedAt: Timestamp;
    metadata: TaskMetadata;
}

export interface GetTaskInfoRequest {
    taskId: string;
}

export interface GetTaskInfoResponse {
    task: Task;
}
