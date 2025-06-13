import { Controller } from '@nestjs/common';
import {
    ASTAnalyzerServiceController,
    ASTAnalyzerServiceControllerMethods,
    DeleteRepositoryRequest,
    DeleteRepositoryResponse,
    GetDiffRequest,
    GetDiffResponse,
    GetGraphsRequest,
    GetGraphsResponse,
    InitializeRepositoryRequest,
    InitializeRepositoryResponse,
} from '@kodus/kodus-proto/v2';
import { Observable } from 'rxjs';
import { InitializeRepositoryUseCase } from '@/core/application/use-cases/ast/initialize-repository.use-case';
import { DeleteRepositoryUseCase } from '@/core/application/use-cases/ast/delete-repository.use-case';
import { GetGraphsUseCase } from '@/core/application/use-cases/ast/get-graphs.use-case';

@Controller('ast')
@ASTAnalyzerServiceControllerMethods()
export class ASTController implements ASTAnalyzerServiceController {
    constructor(
        private readonly initializeRepositoryUseCase: InitializeRepositoryUseCase,
        private readonly deleteRepositoryUseCase: DeleteRepositoryUseCase,
        private readonly getGraphsUseCase: GetGraphsUseCase,
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
        return this.getGraphsUseCase.execute(request);
    }

    getDiff(request: GetDiffRequest): Observable<GetDiffResponse> {
        console.warn(
            request,
            'getDiff method is not implemented yet. This will be implemented in the future.',
        );
        throw new Error('Method not implemented.');
    }
}
