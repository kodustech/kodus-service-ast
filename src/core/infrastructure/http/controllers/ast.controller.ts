import { TaskService } from '@/core/application/services/task/task.service.js';
import {
    GetContentFromDiffResponse,
    InitializeContentFromDiffResponse,
    ValidateCodeResponse,
    type GetContentFromDiffRequest,
    type InitializeContentFromDiffRequest,
    type ValidateCodeRequest,
} from '@/shared/types/ast.js';
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
            priority: request.priority,
            payload: request,
        });

        return { taskId };
    }

    @Post('diff/content/retrieve')
    async getContentFromDiffResult(
        @Body() request: GetContentFromDiffRequest,
    ): Promise<GetContentFromDiffResponse> {
        return this.taskService.getTaskResult<GetContentFromDiffResponse>(
            request.taskId,
        );
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
