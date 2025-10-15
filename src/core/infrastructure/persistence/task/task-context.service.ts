import { Injectable } from '@nestjs/common';
import { TaskContext } from '@/core/domain/task/contracts/task-manager.contract.js';
import { TaskPersistenceService } from './task-persistence.service.js';
import { TaskStatus } from '@/shared/types/task.js';

@Injectable()
export class TaskContextService {
    constructor(private readonly taskPersistence: TaskPersistenceService) {}

    createContext(taskId: string): TaskContext {
        return new TaskContextImpl(taskId, this.taskPersistence);
    }
}

class TaskContextImpl implements TaskContext {
    constructor(
        public readonly taskId: string,
        private readonly taskPersistence: TaskPersistenceService,
    ) {}

    async start(state: string): Promise<void> {
        await this.taskPersistence.updateTask({
            taskId: this.taskId,
            status: TaskStatus.TASK_STATUS_IN_PROGRESS,
            progress: 0,
            state,
            actor: 'WORKER',
            detail: { action: 'start' },
        });
    }

    async update(
        state: string,
        progress?: number,
        metadata?: Record<string, unknown>,
    ): Promise<void> {
        const updateData: any = {
            taskId: this.taskId,
            state,
            actor: 'WORKER',
            detail: { action: 'update' },
        };

        if (progress !== undefined) {
            updateData.progress = progress;
        }

        if (metadata) {
            updateData.metadata = metadata;
        }

        await this.taskPersistence.updateTask(updateData);
    }

    async complete(state: string, result?: unknown): Promise<void> {
        const updateData: any = {
            taskId: this.taskId,
            status: TaskStatus.TASK_STATUS_COMPLETED,
            progress: 100,
            state,
            actor: 'WORKER',
            detail: { action: 'complete' },
        };

        if (result) {
            updateData.metadata = { result };
        }

        await this.taskPersistence.updateTask(updateData);

        // Store result if provided
        if (result) {
            await this.taskPersistence.storeResult({
                taskId: this.taskId,
                payload: { result },
            });
        }
    }

    async fail(error: string, state?: string): Promise<void> {
        await this.taskPersistence.updateTask({
            taskId: this.taskId,
            status: TaskStatus.TASK_STATUS_FAILED,
            error,
            state: state ?? 'Failed',
            actor: 'WORKER',
            detail: { action: 'fail' },
            incrementRetry: true,
        });
    }
}
