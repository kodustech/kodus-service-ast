import { type DeepPartial } from '@/shared/utils/deep-partial.js';
import {
    type Task,
    type TaskPriority,
    type TaskStatus,
} from '@/shared/types/task.js';

export const TASK_MANAGER_TOKEN = Symbol('TaskManager');

export interface ITaskManagerService {
    // Task Management
    createTask(priority?: number): Promise<string>;
    updateTask(
        task: Task,
        updates: DeepPartial<Omit<Task, 'id' | 'createdAt' | 'updatedAt'>>,
    ): Promise<void>;
    getTask(taskId: string): Promise<Task | null>;
    getAllTasks(): Promise<Task[]>;
    queryTasksAll(query: Partial<Task>): Promise<Task[]>;
    queryTasks(query: Partial<Task>): Promise<Task | null>;
    deleteTask(taskId: string): Promise<void>;
    clearAllTasks(): Promise<void>;

    // Task Status
    getTaskStatus(taskId: string): Promise<TaskStatus | null>;
    startTask(taskId: string, state?: string): Promise<void>;
    pauseTask(taskId: string, progress?: number, state?: string): Promise<void>;
    resumeTask(taskId: string, state?: string): Promise<void>;
    completeTask(taskId: string, state?: string): Promise<void>;
    failTask(taskId: string, error: string, state?: string): Promise<void>;
    cancelTask(taskId: string, state?: string): Promise<void>;

    // Task State
    getTaskState(taskId: string): Promise<string>;
    updateTaskState(taskId: string, state: string): Promise<void>;

    // Task Metadata
    getTaskError(taskId: string): Promise<string | null>;
    updateTaskError(taskId: string, error: string): Promise<void>;

    getTaskProgress(taskId: string): Promise<number>;
    updateTaskProgress(taskId: string, progress: number): Promise<void>;

    getTaskPriority(taskId: string): Promise<TaskPriority>;
    updateTaskPriority(taskId: string, priority: TaskPriority): Promise<void>;

    // Cron
    periodicTaskCleanup(): Promise<void>;
}

// TaskContext para worker - interface mais simples e focada
export interface TaskContext {
    taskId: string;
    start(state: string): Promise<void>;
    update(
        state: string,
        progress?: number,
        metadata?: Record<string, unknown>,
    ): Promise<void>;
    complete(state: string, result?: unknown): Promise<void>;
    fail(error: string, state?: string): Promise<void>;
}
