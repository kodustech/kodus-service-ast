import { Injectable } from '@nestjs/common';
import { PinoLoggerService } from '../logger/pino.service';
import { ITaskManagerService } from '@/core/domain/task/contracts/task-manager.contract';
import { Task, TaskPriority, TaskStatus } from '@kodus/kodus-proto/task';
import { Cron, CronExpression } from '@nestjs/schedule';
import { SerializeDateToTimeStamp } from '@kodus/kodus-proto/serialization';
import { DeepPartial, matchesPartial } from '@/shared/utils/deep-partial';
import { TaskPersistenceService } from '@/core/infrastructure/persistence/task/task-persistence.service';
import {
    TaskRecord,
    UpdateTaskInput,
} from '@/core/infrastructure/persistence/task/task-persistence.types';

@Injectable()
export class TaskManagerService implements ITaskManagerService {
    private readonly defaultTaskType = 'AST_GENERIC';

    constructor(
        private readonly logger: PinoLoggerService,
        private readonly taskPersistence: TaskPersistenceService,
    ) {}

    // #region Task Management

    async createTask(priority?: number): Promise<string> {
        const normalizedPriority = this.normalizePriority(priority);

        const record = await this.taskPersistence.createTask({
            type: this.defaultTaskType,
            priority: normalizedPriority,
            metadata: {
                progress: 0,
                priority: normalizedPriority,
                error: null,
            },
            status: TaskStatus.TASK_STATUS_PENDING,
        });

        this.logger.log({
            message: 'Task created',
            context: TaskManagerService.name,
            metadata: {
                taskId: record.id,
                priority: normalizedPriority,
            },
            serviceName: TaskManagerService.name,
        });

        return record.id;
    }

    async updateTask(
        task: Task,
        updates: DeepPartial<Omit<Task, 'id' | 'createdAt' | 'updatedAt'>>,
    ): Promise<void> {
        return this.applyPartialUpdate(task.id, updates, {
            actor: 'SYSTEM',
            detail: { source: 'updateTask' },
        });
    }

    async getTask(taskId: string): Promise<Task | null> {
        const record = await this.taskPersistence.findTaskById(taskId);

        if (!record) {
            this.logger.warn({
                message: 'Task not found',
                context: TaskManagerService.name,
                metadata: { taskId },
                serviceName: TaskManagerService.name,
            });

            return null;
        }

        return this.mapRecordToTask(record);
    }

    async getAllTasks(): Promise<Task[]> {
        const records = await this.taskPersistence.listTasks();

        this.logger.log({
            message: 'Retrieved all tasks',
            context: TaskManagerService.name,
            metadata: { count: records.length },
            serviceName: TaskManagerService.name,
        });

        return records.map((record) => this.mapRecordToTask(record));
    }

    async queryTasksAll(query: DeepPartial<Task>): Promise<Task[]> {
        const tasks = await this.getAllTasks();
        const filtered = tasks.filter((task) => matchesPartial(task, query));

        if (filtered.length === 0) {
            this.logger.warn({
                message: 'No tasks found matching query',
                context: TaskManagerService.name,
                metadata: { query },
                serviceName: TaskManagerService.name,
            });
        }

        return filtered;
    }

    async queryTasks(query: DeepPartial<Task>): Promise<Task | null> {
        const tasks = await this.queryTasksAll(query);

        if (tasks.length === 0) return null;

        if (tasks.length > 1) {
            this.logger.warn({
                message: 'Multiple tasks found matching query, returning first',
                context: TaskManagerService.name,
                metadata: { query, count: tasks.length },
                serviceName: TaskManagerService.name,
            });
        }

        return tasks[0];
    }

    async deleteTask(taskId: string): Promise<void> {
        await this.taskPersistence.deleteTask(taskId);

        this.logger.log({
            message: 'Task deleted successfully',
            context: TaskManagerService.name,
            metadata: { taskId },
            serviceName: TaskManagerService.name,
        });
    }

    async clearAllTasks(): Promise<void> {
        await this.taskPersistence.clearTasks();

        this.logger.log({
            message: 'All tasks cleared',
            context: TaskManagerService.name,
            serviceName: TaskManagerService.name,
        });
    }

    // #endregion Task Management Methods

    // #region Task Status

    async getTaskStatus(taskId: string): Promise<TaskStatus | null> {
        const task = await this.getTask(taskId);
        return task?.status ?? null;
    }

    async startTask(taskId: string, state?: string): Promise<void> {
        const updated = await this.tryUpdateTask(
            taskId,
            {
                taskId,
                status: TaskStatus.TASK_STATUS_IN_PROGRESS,
                progress: 0,
                state: state ?? 'In Progress',
                metadata: { progress: 0 },
                actor: 'WORKER',
                detail: { action: 'start' },
            },
            'startTask',
        );

        if (!updated) return;

        this.logger.log({
            message: 'Task started successfully',
            context: TaskManagerService.name,
            metadata: { taskId },
            serviceName: TaskManagerService.name,
        });
    }

    async pauseTask(
        taskId: string,
        progress?: number,
        state?: string,
    ): Promise<void> {
        const updated = await this.tryUpdateTask(
            taskId,
            {
                taskId,
                status: TaskStatus.TASK_STATUS_PENDING,
                progress,
                state: state ?? 'Paused',
                metadata: progress !== undefined ? { progress } : undefined,
                actor: 'WORKER',
                detail: { action: 'pause' },
            },
            'pauseTask',
        );

        if (!updated) return;

        this.logger.log({
            message: 'Task paused successfully',
            context: TaskManagerService.name,
            metadata: { taskId },
            serviceName: TaskManagerService.name,
        });
    }

    async resumeTask(taskId: string, state?: string): Promise<void> {
        const updated = await this.tryUpdateTask(
            taskId,
            {
                taskId,
                status: TaskStatus.TASK_STATUS_IN_PROGRESS,
                state: state ?? 'Resumed',
                actor: 'WORKER',
                detail: { action: 'resume' },
            },
            'resumeTask',
        );

        if (!updated) return;

        this.logger.log({
            message: 'Task resumed successfully',
            context: TaskManagerService.name,
            metadata: { taskId },
            serviceName: TaskManagerService.name,
        });
    }

    async completeTask(taskId: string, state?: string): Promise<void> {
        const updated = await this.tryUpdateTask(
            taskId,
            {
                taskId,
                status: TaskStatus.TASK_STATUS_COMPLETED,
                progress: 100,
                metadata: { progress: 100 },
                state: state ?? 'Completed',
                actor: 'WORKER',
                detail: { action: 'complete' },
            },
            'completeTask',
        );

        if (!updated) return;

        this.logger.log({
            message: 'Task completed successfully',
            context: TaskManagerService.name,
            metadata: { taskId },
            serviceName: TaskManagerService.name,
        });
    }

    async failTask(
        taskId: string,
        error: string,
        state?: string,
    ): Promise<void> {
        const updated = await this.tryUpdateTask(
            taskId,
            {
                taskId,
                status: TaskStatus.TASK_STATUS_FAILED,
                error,
                metadata: { error },
                state: state ?? 'Failed',
                actor: 'WORKER',
                detail: { action: 'fail' },
                incrementRetry: true,
            },
            'failTask',
        );

        if (!updated) return;

        this.logger.error({
            message: 'Task failed',
            context: TaskManagerService.name,
            metadata: { taskId, error },
            serviceName: TaskManagerService.name,
        });
    }

    async cancelTask(taskId: string, state?: string): Promise<void> {
        const updated = await this.tryUpdateTask(
            taskId,
            {
                taskId,
                status: TaskStatus.TASK_STATUS_CANCELLED,
                state: state ?? 'Cancelled',
                actor: 'WORKER',
                detail: { action: 'cancel' },
            },
            'cancelTask',
        );

        if (!updated) return;

        this.logger.log({
            message: 'Task cancelled successfully',
            context: TaskManagerService.name,
            metadata: { taskId },
            serviceName: TaskManagerService.name,
        });
    }

    // #endregion Task Status Methods

    //#region Task State

    async getTaskState(taskId: string): Promise<string> {
        const task = await this.getTask(taskId);
        return task?.state ?? 'Unknown';
    }

    async updateTaskState(taskId: string, state: string): Promise<void> {
        const updated = await this.tryUpdateTask(
            taskId,
            {
                taskId,
                state,
                actor: 'WORKER',
                detail: { action: 'update-state' },
            },
            'updateTaskState',
        );

        if (!updated) return;

        this.logger.log({
            message: 'Task state updated',
            context: TaskManagerService.name,
            metadata: { taskId, state },
            serviceName: TaskManagerService.name,
        });
    }

    //#endregion Task State

    //#region Task Error

    async getTaskError(taskId: string): Promise<string | null> {
        const task = await this.getTask(taskId);
        return task?.metadata.error ?? null;
    }

    async updateTaskError(taskId: string, error: string): Promise<void> {
        const updated = await this.tryUpdateTask(
            taskId,
            {
                taskId,
                error,
                metadata: { error },
                actor: 'WORKER',
                detail: { action: 'update-error' },
            },
            'updateTaskError',
        );

        if (!updated) return;

        this.logger.log({
            message: 'Task error updated',
            context: TaskManagerService.name,
            metadata: { taskId, error },
            serviceName: TaskManagerService.name,
        });
    }

    //#endregion Task Error

    // #region Task Progress

    async getTaskProgress(taskId: string): Promise<number> {
        const task = await this.getTask(taskId);
        return task?.metadata.progress ?? 0;
    }

    async updateTaskProgress(taskId: string, progress: number): Promise<void> {
        if (progress < 0 || progress > 100) {
            this.logger.error({
                message: 'Invalid progress value',
                context: TaskManagerService.name,
                metadata: { taskId, progress },
                serviceName: TaskManagerService.name,
            });
            return;
        }

        const updated = await this.tryUpdateTask(
            taskId,
            {
                taskId,
                progress,
                metadata: { progress },
                actor: 'WORKER',
                detail: { action: 'update-progress' },
            },
            'updateTaskProgress',
        );

        if (!updated) return;

        this.logger.log({
            message: 'Task progress updated',
            context: TaskManagerService.name,
            metadata: { taskId, progress },
            serviceName: TaskManagerService.name,
        });
    }

    // #endregion Task Progress

    // #region Task Priority

    async getTaskPriority(taskId: string): Promise<number> {
        const task = await this.getTask(taskId);
        if (!task) {
            return TaskPriority.TASK_PRIORITY_UNSPECIFIED;
        }

        return this.normalizePriority(
            task.metadata.priority as number | undefined,
        );
    }

    async updateTaskPriority(
        taskId: string,
        priority: TaskPriority,
    ): Promise<void> {
        const updated = await this.tryUpdateTask(
            taskId,
            {
                taskId,
                priority,
                metadata: { priority },
                actor: 'WORKER',
                detail: { action: 'update-priority' },
            },
            'updateTaskPriority',
        );

        if (!updated) return;

        this.logger.log({
            message: 'Task priority updated',
            context: TaskManagerService.name,
            metadata: { taskId, priority },
            serviceName: TaskManagerService.name,
        });
    }

    // #endregion Task Priority

    // #region Cron

    @Cron(CronExpression.EVERY_8_HOURS, {
        name: 'periodicTaskCleanup',
        waitForCompletion: true,
    })
    async periodicTaskCleanup(): Promise<void> {
        this.logger.log({
            message: 'Starting periodic task cleanup',
            context: TaskManagerService.name,
            serviceName: TaskManagerService.name,
        });

        const now = new Date();
        const threshold = new Date(now.getTime() - 8 * 60 * 60 * 1000);

        const endStates = new Set<TaskStatus>([
            TaskStatus.TASK_STATUS_CANCELLED,
            TaskStatus.TASK_STATUS_COMPLETED,
            TaskStatus.TASK_STATUS_FAILED,
        ]);

        const staleTasks =
            await this.taskPersistence.findTasksUpdatedBefore(threshold);

        const toDelete: string[] = [];

        for (const task of staleTasks) {
            if (endStates.has(task.status)) {
                toDelete.push(task.id);
                continue;
            }

            await this.tryUpdateTask(
                task.id,
                {
                    taskId: task.id,
                    status: TaskStatus.TASK_STATUS_CANCELLED,
                    error: 'Task automatically marked as cancelled due to inactivity',
                    metadata: {
                        error: 'Task automatically marked as cancelled due to inactivity',
                    },
                    actor: 'SYSTEM',
                    detail: { action: 'cleanup-cancel' },
                },
                'periodicTaskCleanup:cancel',
            );
        }

        if (toDelete.length > 0) {
            await this.taskPersistence.deleteTasks(toDelete);
        }

        this.logger.log({
            message: 'Periodic task cleanup completed',
            context: TaskManagerService.name,
            metadata: {
                deletedCount: toDelete.length,
                cancelledCount: staleTasks.length - toDelete.length,
            },
            serviceName: TaskManagerService.name,
        });
    }

    // #endregion Cron

    private async tryUpdateTask(
        taskId: string,
        input: UpdateTaskInput,
        action: string,
    ): Promise<boolean> {
        try {
            await this.taskPersistence.updateTask(input);
            return true;
        } catch (error) {
            if (error instanceof Error && error.message.includes('not found')) {
                this.logger.warn({
                    message: `Task not found for ${action}`,
                    context: TaskManagerService.name,
                    metadata: { taskId },
                    serviceName: TaskManagerService.name,
                });
                return false;
            }
            throw error;
        }
    }

    private async applyPartialUpdate(
        taskId: string,
        updates: DeepPartial<Omit<Task, 'id' | 'createdAt' | 'updatedAt'>>,
        context: { actor: string; detail?: Record<string, unknown> },
    ): Promise<void> {
        const metadataUpdates = updates.metadata ?? {};
        const metadataPayload: Record<string, unknown> = {};

        if (metadataUpdates.progress !== undefined) {
            metadataPayload.progress = metadataUpdates.progress;
        }

        if ('error' in metadataUpdates) {
            metadataPayload.error = metadataUpdates.error ?? null;
        }

        if (metadataUpdates.priority !== undefined) {
            metadataPayload.priority = metadataUpdates.priority;
        }

        const hasAction =
            context.detail &&
            Object.prototype.hasOwnProperty.call(context.detail, 'action');
        const actionLabel = hasAction
            ? String((context.detail as { action?: unknown }).action)
            : 'updateTask';

        await this.tryUpdateTask(
            taskId,
            {
                taskId,
                status: updates.status,
                state: updates.state,
                progress: metadataUpdates.progress,
                error:
                    'error' in metadataUpdates
                        ? (metadataUpdates.error ?? null)
                        : undefined,
                priority: metadataUpdates.priority,
                metadata:
                    Object.keys(metadataPayload).length > 0
                        ? metadataPayload
                        : undefined,
                actor: context.actor,
                detail: context.detail,
            },
            actionLabel,
        );
    }

    private mapRecordToTask(record: TaskRecord): Task {
        const metadata: Task['metadata'] = {};

        const progress =
            record.progress ??
            (record.metadata?.progress as number | undefined) ??
            undefined;

        if (progress !== undefined && progress !== null) {
            metadata.progress = progress;
        }

        const priority = this.normalizePriority(
            record.priority ??
                (record.metadata?.priority as number | undefined),
        );
        metadata.priority = priority;

        const errorValue =
            record.error ??
            (record.metadata?.error as string | null | undefined);
        if (errorValue !== undefined && errorValue !== null) {
            metadata.error = errorValue;
        }

        return {
            id: record.id,
            status: record.status,
            state: record.state ?? 'Unknown',
            createdAt: SerializeDateToTimeStamp(record.createdAt),
            updatedAt: SerializeDateToTimeStamp(record.updatedAt),
            metadata,
        };
    }

    private normalizePriority(priority?: number): TaskPriority {
        switch (priority) {
            case TaskPriority.TASK_PRIORITY_LOW:
                return TaskPriority.TASK_PRIORITY_LOW;
            case TaskPriority.TASK_PRIORITY_HIGH:
                return TaskPriority.TASK_PRIORITY_HIGH;
            case TaskPriority.TASK_PRIORITY_MEDIUM:
                return TaskPriority.TASK_PRIORITY_MEDIUM;
            default:
                return TaskPriority.TASK_PRIORITY_MEDIUM;
        }
    }
}
