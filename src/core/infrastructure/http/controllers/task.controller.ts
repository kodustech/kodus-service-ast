import { Controller, Get, Inject, Param } from '@nestjs/common';
import {
    GetTaskInfoRequest,
    GetTaskInfoResponse,
} from '@/shared/types/task.js';
import { GetTaskInfoUseCase } from '@/core/application/use-cases/task/get-task-info.use-case.js';

@Controller('tasks')
export class TaskHttpController {
    constructor(
        @Inject(GetTaskInfoUseCase)
        private readonly getTaskInfoUseCase: GetTaskInfoUseCase,
    ) {}

    @Get(':taskId')
    async getTaskInfo(
        @Param('taskId') taskId: string,
    ): Promise<GetTaskInfoResponse> {
        const request: GetTaskInfoRequest = { taskId };
        return this.getTaskInfoUseCase.execute(request);
    }
}
