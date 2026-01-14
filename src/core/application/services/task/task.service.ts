import {
    type ITaskManagerService,
    TASK_MANAGER_TOKEN,
} from '@/core/domain/task/contracts/task-manager.contract.js';
import { TaskPersistenceService } from '@/core/infrastructure/persistence/task/task-persistence.service.js';
import { TaskPriority } from '@/shared/types/task.js';
import { Inject, Injectable } from '@nestjs/common';

export interface DispatchTaskPayload<TPayload = unknown> {
    taskId: string;
    type: string;
    payload: TPayload;
    priority?: TaskPriority | number;
    metadata?: Record<string, unknown>;
}

export const TASK_JOB_DISPATCHER = Symbol('TaskJobDispatcher');

export interface ITaskJobDispatcher {
    dispatch<TPayload>(payload: DispatchTaskPayload<TPayload>): void;
}

interface CreateAsyncTaskInput<TPayload> {
    type: string;
    priority?: TaskPriority | number;
    payload: TPayload;
    metadata?: Record<string, unknown>;
}

@Injectable()
export class TaskService {
    constructor(
        @Inject(TASK_MANAGER_TOKEN)
        private readonly taskManagerService: ITaskManagerService,
        @Inject(TASK_JOB_DISPATCHER)
        private readonly taskJobDispatcher: ITaskJobDispatcher,
        private readonly taskPersistence: TaskPersistenceService,
    ) {}

    async createAsyncTask<TPayload>(
        input: CreateAsyncTaskInput<TPayload>,
    ): Promise<string> {
        const taskId = await this.taskManagerService.createTask(input.priority);

        this.taskJobDispatcher.dispatch({
            taskId,
            type: input.type,
            payload: input.payload,
            priority: input.priority,
            metadata: input.metadata,
        });

        return taskId;
    }

    async getTaskResult<TPayload>(taskId: string): Promise<TPayload> {
        const result = await this.taskPersistence.getTaskResult(taskId);

        if (!result) {
            throw new Error(`Task result not found for task ${taskId}`);
        }

        return result.payload as unknown as TPayload;
    }
}
