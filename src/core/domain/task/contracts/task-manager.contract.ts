import { DeepPartial } from '@/shared/utils/deep-partial';
import { Task, TaskPriority, TaskStatus } from '@kodus/kodus-proto/task';

export interface ITaskManagerService {
    // Task Management
    createTask(priority?: number): string;
    updateTask(
        task: Task,
        updates: DeepPartial<Omit<Task, 'id' | 'createdAt' | 'updatedAt'>>,
    ): void;
    getTask(taskId: string): Task | null;
    getAllTasks(): Task[];
    queryTasksAll(query: Partial<Task>): Task[];
    queryTasks(query: Partial<Task>): Task | null;
    deleteTask(taskId: string): void;
    clearAllTasks(): void;

    // Task Status
    getTaskStatus(taskId: string): TaskStatus;
    startTask(taskId: string, state?: string): void;
    pauseTask(taskId: string, progress?: number, state?: string): void;
    resumeTask(taskId: string, state?: string): void;
    completeTask(taskId: string, state?: string): void;
    failTask(taskId: string, error: string, state?: string): void;
    cancelTask(taskId: string, state?: string): void;

    // Task State
    getTaskState(taskId: string): string;
    updateTaskState(taskId: string, state: string): void;

    // Task Metadata
    getTaskError(taskId: string): string | null;
    updateTaskError(taskId: string, error: string): void;

    getTaskProgress(taskId: string): number;
    updateTaskProgress(taskId: string, progress: number): void;

    getTaskPriority(taskId: string): number;
    updateTaskPriority(taskId: string, priority: TaskPriority): void;

    // Cron
    periodicTaskCleanup(): void;
}
