import { Controller } from '@nestjs/common';
import {
    ASTAnalyzerServiceController,
    ASTAnalyzerServiceControllerMethods,
    DeleteRepositoryRequest,
    DeleteRepositoryResponse,
    GetContentFromDiffRequest,
    GetContentFromDiffResponse,
    GetImpactAnalysisRequest,
    GetImpactAnalysisResponse,
    InitializeImpactAnalysisRequest,
    InitializeImpactAnalysisResponse,
    InitializeRepositoryRequest,
    InitializeRepositoryResponse,
} from '@kodus/kodus-proto/ast';
import { Observable } from 'rxjs';
import { InitializeRepositoryUseCase } from '@/core/application/use-cases/ast/graphs/initialize-repository.use-case';
import { DeleteRepositoryUseCase } from '@/core/application/use-cases/ast/graphs/delete-repository.use-case';
import { streamedResponse } from '@/shared/utils/grpc/streams';
import { GetContentFromDiffUseCase } from '@/core/application/use-cases/ast/graphs/get-content-diff.use-case';
import { TaskManagerService } from '@/core/infrastructure/adapters/services/task/task-manager.service';
import { GetImpactAnalysisUseCase } from '@/core/application/use-cases/ast/analysis/get-impact-analysis.use-case';
import { InitializeImpactAnalysisUseCase } from '@/core/application/use-cases/ast/analysis/initialize-impact-analysis.use-case';

@Controller('ast')
@ASTAnalyzerServiceControllerMethods()
export class ASTController implements ASTAnalyzerServiceController {
    constructor(
        private readonly taskManagerService: TaskManagerService,

        private readonly initializeRepositoryUseCase: InitializeRepositoryUseCase,
        private readonly deleteRepositoryUseCase: DeleteRepositoryUseCase,
        private readonly getContentFromDiffUseCase: GetContentFromDiffUseCase,
        private readonly initializeImpactAnalysisUseCase: InitializeImpactAnalysisUseCase,
        private readonly getImpactAnalysisUseCase: GetImpactAnalysisUseCase,
    ) {}

    initializeRepository(
        request: InitializeRepositoryRequest,
    ): InitializeRepositoryResponse {
        const taskId = this.taskManagerService.createTask(request.priority);

        setImmediate(() => {
            void this.initializeRepositoryUseCase.execute(request, taskId);
        });

        return { taskId };
    }

    deleteRepository(
        request: DeleteRepositoryRequest,
    ): Promise<DeleteRepositoryResponse> {
        return this.deleteRepositoryUseCase.execute(request);
    }

    getContentFromDiff(
        request: GetContentFromDiffRequest,
    ): Observable<GetContentFromDiffResponse> {
        return streamedResponse(request, (req) =>
            this.getContentFromDiffUseCase.execute(req),
        );
    }

    initializeImpactAnalysis(
        request: InitializeImpactAnalysisRequest,
    ): InitializeImpactAnalysisResponse {
        const taskId = this.taskManagerService.createTask(request.priority);

        setImmediate(() => {
            void this.initializeImpactAnalysisUseCase.execute(request, taskId);
        });

        return { taskId };
    }

    getImpactAnalysis(
        request: GetImpactAnalysisRequest,
    ): Observable<GetImpactAnalysisResponse> {
        return this.getImpactAnalysisUseCase.observe(request);
    }
}
