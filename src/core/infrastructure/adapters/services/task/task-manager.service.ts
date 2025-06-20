import { Injectable } from '@nestjs/common';
import { PinoLoggerService } from '../logger/pino.service';
import { ITaskManagerService } from '@/core/domain/task/contracts/task-manager.contract';
import { Task, TaskPriority, TaskStatus } from '@kodus/kodus-proto/v3';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ASTSerializer } from '@kodus/kodus-proto/serialization/ast';
import {
    deepMerge,
    DeepPartial,
    matchesPartial,
} from '@/shared/utils/deep-partial';

@Injectable()
export class TaskManagerService implements ITaskManagerService {
    private readonly tasks: Map<string, Task> = new Map();

    constructor(private readonly logger: PinoLoggerService) {}

    // #region Task Management

    createTask(priority: TaskPriority): string {
        if (
            priority === TaskPriority.TASK_PRIORITY_UNSPECIFIED ||
            TaskPriority.UNRECOGNIZED
        )
            priority = TaskPriority.TASK_PRIORITY_MEDIUM;

        const taskId = crypto.randomUUID();
        const timestamp = ASTSerializer.dateToTimestamp(new Date());

        const newTask: Task = {
            id: taskId,
            status: TaskStatus.TASK_STATUS_PENDING,
            state: 'Created',
            createdAt: timestamp,
            updatedAt: timestamp,
            metadata: {
                progress: 0,
                priority,
                error: null,
            },
        };

        this.tasks.set(taskId, newTask);

        this.logger.log({
            message: 'Task created',
            context: TaskManagerService.name,
            metadata: {
                taskId,
            },
            serviceName: TaskManagerService.name,
        });

        return taskId;
    }

    updateTask(
        task: Task,
        updates: DeepPartial<Omit<Task, 'id' | 'createdAt' | 'updatedAt'>>,
    ): void {
        const updatedAt = ASTSerializer.dateToTimestamp(new Date());

        const updatedTask: Task = {
            id: task.id,
            createdAt: task.createdAt,
            ...deepMerge(task, updates),
            updatedAt,
        };

        this.tasks.set(task.id, updatedTask);

        this.logger.log({
            message: 'Task updated',
            context: TaskManagerService.name,
            metadata: {
                taskId: task.id,
                updates,
            },
            serviceName: TaskManagerService.name,
        });
    }

    getTask(taskId: string): Task | null {
        const task = this.tasks.get(taskId);

        if (!task) {
            this.logger.warn({
                message: 'Task not found',
                context: TaskManagerService.name,
                metadata: {
                    taskId,
                },
                serviceName: TaskManagerService.name,
            });

            return null;
        }

        return task;
    }

    getAllTasks(): Task[] {
        const allTasks = Array.from(this.tasks.values());

        this.logger.log({
            message: 'Retrieved all tasks',
            context: TaskManagerService.name,
            metadata: {
                count: allTasks.length,
            },
            serviceName: TaskManagerService.name,
        });

        return allTasks;
    }

    queryTasksAll(query: DeepPartial<Task>): Task[] {
        const tasks = Array.from(this.tasks.values()).filter((task) =>
            matchesPartial(task, query),
        );

        if (tasks.length === 0) {
            this.logger.warn({
                message: 'No tasks found matching query',
                context: TaskManagerService.name,
                metadata: { query },
                serviceName: TaskManagerService.name,
            });
        }

        return tasks;
    }

    queryTasks(query: DeepPartial<Task>): Task | null {
        const tasks = this.queryTasksAll(query);

        if (tasks.length === 0) {
            this.logger.warn({
                message: 'No tasks found matching query',
                context: TaskManagerService.name,
                metadata: {
                    query,
                },
                serviceName: TaskManagerService.name,
            });

            return null;
        }

        if (tasks.length > 1) {
            this.logger.warn({
                message: 'Multiple tasks found matching query, returning first',
                context: TaskManagerService.name,
                metadata: {
                    query,
                    count: tasks.length,
                },
                serviceName: TaskManagerService.name,
            });
        }

        return tasks[0];
    }

    deleteTask(taskId: string): void {
        const task = this.getTask(taskId);

        if (!task) {
            this.logger.warn({
                message: 'Task not found for deletion',
                context: TaskManagerService.name,
                metadata: {
                    taskId,
                },
                serviceName: TaskManagerService.name,
            });

            return;
        }

        this.tasks.delete(taskId);

        this.logger.log({
            message: 'Task deleted successfully',
            context: TaskManagerService.name,
            metadata: {
                taskId,
            },
            serviceName: TaskManagerService.name,
        });
    }

    clearAllTasks(): void {
        this.tasks.clear();

        this.logger.log({
            message: 'All tasks cleared',
            context: TaskManagerService.name,
            serviceName: TaskManagerService.name,
        });
    }

    // #endregion Task Management Methods

    // #region Task Status

    getTaskStatus(taskId: string): TaskStatus | null {
        const task = this.getTask(taskId);

        if (!task) {
            this.logger.warn({
                message: 'Task not found for status check',
                context: TaskManagerService.name,
                metadata: {
                    taskId,
                },
                serviceName: TaskManagerService.name,
            });

            return null;
        }

        return task.status;
    }

    startTask(taskId: string, state?: string): void {
        const task = this.getTask(taskId);

        if (!task) {
            this.logger.warn({
                message: 'Task not found for start',
                context: TaskManagerService.name,
                metadata: {
                    taskId,
                },
                serviceName: TaskManagerService.name,
            });

            return;
        }

        this.updateTask(task, {
            status: TaskStatus.TASK_STATUS_IN_PROGRESS,
            metadata: {
                progress: 0, // Reset progress to 0 when starting
            },
            state: state || task.state || 'In Progress',
        });

        this.logger.log({
            message: 'Task started successfully',
            context: TaskManagerService.name,
            metadata: {
                taskId,
            },
            serviceName: TaskManagerService.name,
        });
    }

    pauseTask(taskId: string, progress?: number, state?: string): void {
        const task = this.getTask(taskId);

        if (!task) {
            this.logger.warn({
                message: 'Task not found for pause',
                context: TaskManagerService.name,
                metadata: {
                    taskId,
                },
                serviceName: TaskManagerService.name,
            });

            return;
        }

        if (progress !== undefined && (progress < 0 || progress > 100)) {
            this.logger.error({
                message: 'Invalid progress value for pause',
                context: TaskManagerService.name,
                metadata: {
                    taskId,
                    progress,
                },
                serviceName: TaskManagerService.name,
            });
            return;
        }

        const updatedProgress =
            progress !== undefined ? progress : task.metadata.progress || 0;

        this.updateTask(task, {
            status: TaskStatus.TASK_STATUS_PENDING,
            metadata: {
                progress: updatedProgress,
            },
            state: state || task.state || 'Paused',
        });

        this.logger.log({
            message: 'Task paused successfully',
            context: TaskManagerService.name,
            metadata: {
                taskId,
            },
            serviceName: TaskManagerService.name,
        });
    }

    resumeTask(taskId: string, state?: string): void {
        const task = this.getTask(taskId);

        if (!task) {
            this.logger.warn({
                message: 'Task not found for resume',
                context: TaskManagerService.name,
                metadata: {
                    taskId,
                },
                serviceName: TaskManagerService.name,
            });

            return;
        }

        this.updateTask(task, {
            status: TaskStatus.TASK_STATUS_IN_PROGRESS,
            state: state || task.state || 'Resumed',
        });

        this.logger.log({
            message: 'Task resumed successfully',
            context: TaskManagerService.name,
            metadata: {
                taskId,
            },
            serviceName: TaskManagerService.name,
        });
    }

    completeTask(taskId: string, state?: string): void {
        const task = this.getTask(taskId);

        if (!task) {
            this.logger.warn({
                message: 'Task not found for completion',
                context: TaskManagerService.name,
                metadata: {
                    taskId,
                },
                serviceName: TaskManagerService.name,
            });

            return;
        }

        this.updateTask(task, {
            status: TaskStatus.TASK_STATUS_COMPLETED,
            metadata: {
                progress: 100, // Set progress to 100% on completion
            },
            state: state || task.state || 'Completed',
        });

        this.logger.log({
            message: 'Task completed successfully',
            context: TaskManagerService.name,
            metadata: {
                taskId,
            },
            serviceName: TaskManagerService.name,
        });
    }

    failTask(taskId: string, error: string, state?: string): void {
        const task = this.getTask(taskId);

        if (!task) {
            this.logger.warn({
                message: 'Task not found for failure',
                context: TaskManagerService.name,
                metadata: {
                    taskId,
                },
                serviceName: TaskManagerService.name,
            });

            return;
        }

        this.updateTask(task, {
            status: TaskStatus.TASK_STATUS_FAILED,
            metadata: {
                error,
            },
            state: state || task.state || 'Failed',
        });

        this.logger.error({
            message: 'Task failed',
            context: TaskManagerService.name,
            metadata: {
                taskId,
                error,
            },
            serviceName: TaskManagerService.name,
        });
    }

    cancelTask(taskId: string, state?: string): void {
        const task = this.getTask(taskId);

        if (!task) {
            this.logger.warn({
                message: 'Task not found for cancellation',
                context: TaskManagerService.name,
                metadata: {
                    taskId,
                },
                serviceName: TaskManagerService.name,
            });

            return;
        }

        this.updateTask(task, {
            status: TaskStatus.TASK_STATUS_CANCELLED,
            state: state || task.state || 'Cancelled',
        });

        this.logger.log({
            message: 'Task cancelled successfully',
            context: TaskManagerService.name,
            metadata: {
                taskId,
            },
            serviceName: TaskManagerService.name,
        });
    }

    // #endregion Task Status Methods

    //#region Task State

    getTaskState(taskId: string): string {
        const task = this.getTask(taskId);

        if (!task) {
            this.logger.warn({
                message: 'Task not found for state check',
                context: TaskManagerService.name,
                metadata: {
                    taskId,
                },
                serviceName: TaskManagerService.name,
            });

            return 'Unknown';
        }

        return task.state || 'Unknown';
    }

    updateTaskState(taskId: string, state: string): void {
        const task = this.getTask(taskId);

        if (!task) {
            this.logger.warn({
                message: 'Task not found for state update',
                context: TaskManagerService.name,
                metadata: {
                    taskId,
                },
                serviceName: TaskManagerService.name,
            });

            return;
        }

        this.updateTask(task, {
            state,
        });

        this.logger.log({
            message: 'Task state updated',
            context: TaskManagerService.name,
            metadata: {
                taskId,
                state,
            },
            serviceName: TaskManagerService.name,
        });
    }

    //#endregion Task State

    //#region Task Error

    getTaskError(taskId: string): string | null {
        const task = this.getTask(taskId);

        if (!task) {
            this.logger.warn({
                message: 'Task not found for error check',
                context: TaskManagerService.name,
                metadata: {
                    taskId,
                },
                serviceName: TaskManagerService.name,
            });

            return null;
        }

        return task.metadata.error || null;
    }

    updateTaskError(taskId: string, error: string): void {
        const task = this.getTask(taskId);

        if (!task) {
            this.logger.warn({
                message: 'Task not found for error update',
                context: TaskManagerService.name,
                metadata: {
                    taskId,
                },
                serviceName: TaskManagerService.name,
            });

            return;
        }

        this.updateTask(task, {
            metadata: {
                error,
            },
        });

        this.logger.log({
            message: 'Task error updated',
            context: TaskManagerService.name,
            metadata: {
                taskId,
                error,
            },
            serviceName: TaskManagerService.name,
        });
    }

    //#endregion Task Error

    // #region Task Progress

    getTaskProgress(taskId: string): number {
        const task = this.getTask(taskId);

        if (!task) {
            this.logger.warn({
                message: 'Task not found for progress check',
                context: TaskManagerService.name,
                metadata: {
                    taskId,
                },
                serviceName: TaskManagerService.name,
            });

            return 0;
        }

        return task.metadata.progress || 0;
    }

    updateTaskProgress(taskId: string, progress: number): void {
        const task = this.getTask(taskId);

        if (!task) {
            this.logger.warn({
                message: 'Task not found for progress update',
                context: TaskManagerService.name,
                metadata: {
                    taskId,
                },
                serviceName: TaskManagerService.name,
            });

            return;
        }

        if (progress < 0 || progress > 100) {
            this.logger.error({
                message: 'Invalid progress value',
                context: TaskManagerService.name,
                metadata: {
                    taskId,
                    progress,
                },
                serviceName: TaskManagerService.name,
            });
            return;
        }

        this.updateTask(task, {
            metadata: {
                progress,
            },
        });

        this.logger.log({
            message: 'Task progress updated',
            context: TaskManagerService.name,
            metadata: {
                taskId,
                progress,
            },
            serviceName: TaskManagerService.name,
        });
    }

    // #endregion Task Progress

    // #region Task Priority

    getTaskPriority(taskId: string): number {
        const task = this.getTask(taskId);

        if (!task) {
            this.logger.warn({
                message: 'Task not found for priority check',
                context: TaskManagerService.name,
                metadata: {
                    taskId,
                },
                serviceName: TaskManagerService.name,
            });

            return TaskPriority.TASK_PRIORITY_UNSPECIFIED; // Default priority
        }

        return task.metadata.priority || TaskPriority.TASK_PRIORITY_MEDIUM;
    }

    updateTaskPriority(taskId: string, priority: TaskPriority): void {
        const task = this.getTask(taskId);

        if (!task) {
            this.logger.warn({
                message: 'Task not found for priority update',
                context: TaskManagerService.name,
                metadata: {
                    taskId,
                },
                serviceName: TaskManagerService.name,
            });

            return;
        }

        this.updateTask(task, {
            metadata: {
                priority,
            },
        });

        this.logger.log({
            message: 'Task priority updated',
            context: TaskManagerService.name,
            metadata: {
                taskId,
                priority,
            },
            serviceName: TaskManagerService.name,
        });
    }

    // #endregion Task Priority

    // #region Cron

    @Cron(CronExpression.EVERY_8_HOURS, {
        name: 'periodicTaskCleanup',
        waitForCompletion: true,
    })
    periodicTaskCleanup(): void {
        this.logger.log({
            message: 'Starting periodic task cleanup',
            context: TaskManagerService.name,
            serviceName: TaskManagerService.name,
        });

        const now = new Date();
        const threshold = ASTSerializer.dateToTimestamp(
            new Date(now.getTime() - 8 * 60 * 60 * 1000),
        ); // 8 hours ago

        let deletedCount = 0;
        const deletedIds: string[] = [];

        for (const [taskId, task] of this.tasks.entries()) {
            if (task.updatedAt < threshold) {
                this.tasks.delete(taskId);

                deletedCount++;
                deletedIds.push(taskId);
            }
        }

        this.logger.log({
            message: 'Periodic task cleanup completed',
            context: TaskManagerService.name,
            metadata: {
                deletedCount,
                deletedIds,
            },
            serviceName: TaskManagerService.name,
        });
    }

    // #endregion Cron
}
