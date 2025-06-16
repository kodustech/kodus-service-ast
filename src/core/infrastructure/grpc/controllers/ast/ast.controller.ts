import { Controller } from '@nestjs/common';
import {
    ASTAnalyzerServiceController,
    ASTAnalyzerServiceControllerMethods,
    DeleteRepositoryRequest,
    DeleteRepositoryResponse,
    GetContentFromDiffRequest,
    GetContentFromDiffResponse,
    GetGraphsRequest,
    GetGraphsResponse,
    InitializeRepositoryRequest,
    InitializeRepositoryResponse,
} from '@kodus/kodus-proto/v2';
import { Observable } from 'rxjs';
import { InitializeRepositoryUseCase } from '@/core/application/use-cases/ast/initialize-repository.use-case';
import { DeleteRepositoryUseCase } from '@/core/application/use-cases/ast/delete-repository.use-case';
import { GetGraphsUseCase } from '@/core/application/use-cases/ast/get-graphs.use-case';
import { streamedResponse } from '@/shared/utils/grpc/streams';
import { GetContentFromDiffUseCase } from '@/core/application/use-cases/ast/get-content-diff.use-case';

@Controller('ast')
@ASTAnalyzerServiceControllerMethods()
export class ASTController implements ASTAnalyzerServiceController {
    constructor(
        private readonly initializeRepositoryUseCase: InitializeRepositoryUseCase,
        private readonly deleteRepositoryUseCase: DeleteRepositoryUseCase,
        private readonly getGraphsUseCase: GetGraphsUseCase,
        private readonly getContentFromDiffUseCase: GetContentFromDiffUseCase,
    ) {}

    initializeRepository(
        request: InitializeRepositoryRequest,
    ): Promise<InitializeRepositoryResponse> {
        return this.initializeRepositoryUseCase.execute(request);
    }

    deleteRepository(
        request: DeleteRepositoryRequest,
    ): Promise<DeleteRepositoryResponse> {
        return this.deleteRepositoryUseCase.execute(request);
    }

    getGraphs(request: GetGraphsRequest): Observable<GetGraphsResponse> {
        return streamedResponse(request, (req) =>
            this.getGraphsUseCase.execute(req, true),
        );
    }

    getContentFromDiff(
        request: GetContentFromDiffRequest,
    ): Observable<GetContentFromDiffResponse> {
        return streamedResponse(request, (req) =>
            this.getContentFromDiffUseCase.execute(req),
        );
    }
}
