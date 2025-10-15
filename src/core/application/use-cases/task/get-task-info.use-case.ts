import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service.js';
import {
    type ITaskManagerService,
    TASK_MANAGER_TOKEN,
} from '@/core/domain/task/contracts/task-manager.contract.js';

import {
    GetTaskInfoRequest,
    GetTaskInfoResponse,
} from '@/shared/types/task.js';
import { Inject, Injectable } from '@nestjs/common';

@Injectable()
export class GetTaskInfoUseCase {
    constructor(
        @Inject(TASK_MANAGER_TOKEN)
        private readonly taskManagerService: ITaskManagerService,

        private readonly logger: PinoLoggerService,
    ) {}

    async execute(request: GetTaskInfoRequest): Promise<GetTaskInfoResponse> {
        const { taskId } = request;

        this.logger.debug({
            message: 'Getting task info',
            context: GetTaskInfoUseCase.name,
            metadata: { taskId },
        });
        if (!taskId || taskId.trim() === '') {
            this.logger.error({
                message: 'Task ID is required',
                context: GetTaskInfoUseCase.name,
                metadata: { request },
            });

            throw new Error('Task ID is required');
        }

        const task = await this.taskManagerService.getTask(taskId);
        if (!task) {
            this.logger.error({
                message: `Task with ID ${taskId} not found`,
                context: GetTaskInfoUseCase.name,
                metadata: { request },
            });

            throw new Error(`Task with ID ${taskId} not found`);
        }

        return {
            task,
        };
    }
}
