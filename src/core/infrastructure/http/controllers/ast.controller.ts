import { TaskService } from '@/core/application/services/task/task.service.js';
import {
    GetContentFromDiffResponse,
    InitializeContentFromDiffResponse,
    ValidateCodeResponse,
    type InitializeContentFromDiffRequest,
    type ValidateCodeRequest,
} from '@/shared/types/ast.js';
import { TaskPriority } from '@/shared/types/task.js';
import { Body, Controller, Get, Param, Post } from '@nestjs/common';

@Controller('ast')
export class AstHttpController {
    constructor(private readonly taskService: TaskService) {}

    @Post('diff/content/initialize')
    async getContentFromDiff(
        @Body() request: InitializeContentFromDiffRequest,
    ): Promise<InitializeContentFromDiffResponse> {
        const taskId = await this.taskService.createAsyncTask({
            type: 'AST_INITIALIZE_DIFF_ANALYSIS',
            priority: TaskPriority.TASK_PRIORITY_MEDIUM,
            payload: request,
        });

        return { taskId };
    }

    @Post('diff/content/result/:id')
    async getContentFromDiffResult(
        @Param('id') id: string,
    ): Promise<GetContentFromDiffResponse> {
        return this.taskService.getTaskResult<GetContentFromDiffResponse>(id);
    }

    @Post('validate-code/initialize')
    async validateCode(
        @Body() request: ValidateCodeRequest,
    ): Promise<{ taskId: string }> {
        const taskId = await this.taskService.createAsyncTask({
            type: 'AST_VALIDATE_CODE',
            payload: request,
        });

        return { taskId };
    }

    @Get('validate-code/result/:id')
    async getValidateCodeResult(@Param('id') id: string): Promise<any> {
        return this.taskService.getTaskResult<ValidateCodeResponse>(id);
    }
}
