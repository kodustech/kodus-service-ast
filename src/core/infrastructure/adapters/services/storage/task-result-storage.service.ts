import { Injectable, Inject } from '@nestjs/common';
import { PinoLoggerService } from '../logger/pino.service.js';
import { TaskPersistenceService } from '@/core/infrastructure/persistence/task/task-persistence.service.js';

export interface GraphStorageMetadata {
    storageType: 's3' | 'local';
    repository: string;
    commit: string;
    size: number;
    s3Key?: string;
    localPath?: string;
    s3Url?: string;
}

@Injectable()
export class TaskResultStorageService {
    constructor(
        @Inject(TaskPersistenceService)
        private readonly taskPersistence: TaskPersistenceService,
        @Inject(PinoLoggerService)
        private readonly logger: PinoLoggerService,
    ) {}

    async saveGraphsMetadata(
        taskId: string,
        graphsMetadata: GraphStorageMetadata,
    ): Promise<void> {
        try {
            await this.taskPersistence.storeTaskResult({
                taskId,
                payload: graphsMetadata as unknown as Record<string, unknown>,
            });

            this.logger.log({
                message: 'Graphs metadata saved to task_results',
                context: TaskResultStorageService.name,
                metadata: {
                    taskId,
                    storageType: graphsMetadata.storageType,
                    repository: graphsMetadata.repository,
                    commit: graphsMetadata.commit,
                    s3Key: graphsMetadata.s3Key,
                },
            });
        } catch (error) {
            this.logger.error({
                message: 'Failed to save graphs metadata to task_results',
                context: TaskResultStorageService.name,
                error,
                metadata: {
                    taskId,
                    graphsMetadata,
                },
            });
            throw error;
        }
    }

    async getGraphsMetadata(
        taskId: string,
    ): Promise<GraphStorageMetadata | null> {
        try {
            const result = await this.taskPersistence.getTaskResult(taskId);
            return (result?.payload as unknown as GraphStorageMetadata) || null;
        } catch (error) {
            this.logger.error({
                message: 'Failed to get graphs metadata from task_results',
                context: TaskResultStorageService.name,
                error,
                metadata: { taskId },
            });
            return null;
        }
    }
}
