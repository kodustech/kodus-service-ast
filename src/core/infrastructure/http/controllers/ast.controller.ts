import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { DeleteRepositoryUseCase } from '@/core/application/use-cases/ast/commands/delete-repository.use-case.js';
import { GetContentFromDiffUseCase } from '@/core/application/use-cases/ast/queries/get-content-diff.use-case.js';
import { GetImpactAnalysisUseCase } from '@/core/application/use-cases/ast/queries/get-impact-analysis.use-case.js';
import { TaskService } from '@/core/application/services/task/task.service.js';
import {
    type DeleteRepositoryRequest,
    type DeleteRepositoryResponse,
    type GetContentFromDiffRequest,
    type GetImpactAnalysisRequest,
    type GetImpactAnalysisResponse,
    type InitializeImpactAnalysisRequest,
    type InitializeImpactAnalysisResponse,
    type InitializeRepositoryRequest,
    type InitializeRepositoryResponse,
} from '@/shared/types/ast.js';

@Controller('ast')
export class AstHttpController {
    constructor(
        private readonly taskService: TaskService,
        private readonly deleteRepositoryUseCase: DeleteRepositoryUseCase,
        private readonly getContentFromDiffUseCase: GetContentFromDiffUseCase,
        private readonly getImpactAnalysisUseCase: GetImpactAnalysisUseCase,
    ) {}

    @Post('repositories/initialize')
    @HttpCode(HttpStatus.ACCEPTED)
    async initializeRepository(
        @Body() request: InitializeRepositoryRequest,
    ): Promise<InitializeRepositoryResponse> {
        const taskId = await this.taskService.createAsyncTask({
            type: 'AST_INITIALIZE_REPOSITORY',
            priority: request.priority,
            payload: request,
        });

        return { taskId };
    }

    @Post('repositories/delete')
    async deleteRepository(
        @Body() request: DeleteRepositoryRequest,
    ): Promise<DeleteRepositoryResponse> {
        return this.deleteRepositoryUseCase.execute(request);
    }

    @Post('diff/content')
    async getContentFromDiff(
        @Body() request: GetContentFromDiffRequest,
    ): Promise<{ content: string }> {
        const content = await this.getContentFromDiffUseCase.execute(request);
        return { content };
    }

    @Post('impact-analysis/initialize')
    @HttpCode(HttpStatus.ACCEPTED)
    async initializeImpactAnalysis(
        @Body() request: InitializeImpactAnalysisRequest,
    ): Promise<InitializeImpactAnalysisResponse> {
        const taskId = await this.taskService.createAsyncTask({
            type: 'AST_INITIALIZE_IMPACT_ANALYSIS',
            priority: request.priority,
            payload: request,
        });

        return { taskId };
    }

    @Post('impact-analysis/retrieve')
    async getImpactAnalysis(
        @Body() request: GetImpactAnalysisRequest,
    ): Promise<GetImpactAnalysisResponse> {
        return this.getImpactAnalysisUseCase.execute(request);
    }
}
