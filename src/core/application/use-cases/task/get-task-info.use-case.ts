import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import { TaskManagerService } from '@/core/infrastructure/adapters/services/task/task-manager.service';
import {
    GrpcInvalidArgumentException,
    GrpcNotFoundException,
} from '@/shared/utils/grpc/exceptions';
import { GetTaskInfoRequest, GetTaskInfoResponse } from '@/shared/types/task';
import { Injectable } from '@nestjs/common';

@Injectable()
export class GetTaskInfoUseCase {
    constructor(
        private readonly taskManagerService: TaskManagerService,

        private readonly logger: PinoLoggerService,
    ) {}

    async execute(request: GetTaskInfoRequest): Promise<GetTaskInfoResponse> {
        const { taskId } = request;

        if (!taskId || taskId.trim() === '') {
            this.logger.error({
                message: 'Task ID is required',
                context: GetTaskInfoUseCase.name,
                metadata: { request },
            });

            throw new GrpcInvalidArgumentException('Task ID is required');
        }

        const task = await this.taskManagerService.getTask(taskId);
        if (!task) {
            this.logger.error({
                message: `Task with ID ${taskId} not found`,
                context: GetTaskInfoUseCase.name,
                metadata: { request },
            });

            throw new GrpcNotFoundException(`Task with ID ${taskId} not found`);
        }

        return {
            task,
        };
    }
}
