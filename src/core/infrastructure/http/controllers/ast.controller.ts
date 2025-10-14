import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { InitializeRepositoryUseCase } from '@/core/application/use-cases/ast/graphs/initialize-repository.use-case.js';
import { DeleteRepositoryUseCase } from '@/core/application/use-cases/ast/graphs/delete-repository.use-case.js';
import { GetContentFromDiffUseCase } from '@/core/application/use-cases/ast/graphs/get-content-diff.use-case.js';
import { InitializeImpactAnalysisUseCase } from '@/core/application/use-cases/ast/analysis/initialize-impact-analysis.use-case.js';
import { GetImpactAnalysisUseCase } from '@/core/application/use-cases/ast/analysis/get-impact-analysis.use-case.js';
import { TaskManagerService } from '@/core/infrastructure/adapters/services/task/task-manager.service.js';
import {
    DeleteRepositoryRequest,
    DeleteRepositoryResponse,
    GetContentFromDiffRequest,
    GetImpactAnalysisRequest,
    GetImpactAnalysisResponse,
    InitializeImpactAnalysisRequest,
    InitializeImpactAnalysisResponse,
    InitializeRepositoryRequest,
    InitializeRepositoryResponse,
} from '@/shared/types/ast.js';
@Controller('ast')
export class AstHttpController {
    constructor(
        private readonly taskManagerService: TaskManagerService,
        private readonly initializeRepositoryUseCase: InitializeRepositoryUseCase,
        private readonly deleteRepositoryUseCase: DeleteRepositoryUseCase,
        private readonly getContentFromDiffUseCase: GetContentFromDiffUseCase,
        private readonly initializeImpactAnalysisUseCase: InitializeImpactAnalysisUseCase,
        private readonly getImpactAnalysisUseCase: GetImpactAnalysisUseCase,
    ) {}

    @Post('repositories/initialize')
    @HttpCode(HttpStatus.ACCEPTED)
    async initializeRepository(
        @Body() request: InitializeRepositoryRequest,
    ): Promise<InitializeRepositoryResponse> {
        const taskId = await this.taskManagerService.createTask(
            request.priority,
        );

        setImmediate(() => {
            void this.initializeRepositoryUseCase.execute(request, taskId);
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
        const taskId = await this.taskManagerService.createTask(
            request.priority,
        );

        setImmediate(() => {
            void this.initializeImpactAnalysisUseCase.execute(request, taskId);
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
