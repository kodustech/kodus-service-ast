import {
    BuildEnrichedGraphUseCase,
    CodeAnalysisAST,
} from '@/core/application/use-cases/ast/build-enriched-graph.use-case';
import { errorToGrpc } from '@/shared/utils/errors';
import { Controller } from '@nestjs/common';
import {
    BuildEnrichedGraphRequest,
    ASTAnalyzerServiceController,
    ASTAnalyzerServiceControllerMethods,
    BuildEnrichedGraphResponse,
} from 'kodus-proto';
import { from, Observable, switchMap } from 'rxjs';

function* createChunkStream(
    result: CodeAnalysisAST,
    chunkSize = 1024 * 1024,
): Generator<BuildEnrichedGraphResponse> {
    const jsonString = JSON.stringify(result);
    const totalLength = jsonString.length;

    for (let i = 0; i < totalLength; i += chunkSize) {
        yield {
            data: jsonString.slice(i, i + chunkSize),
            errors: [],
            success: true,
        };
    }
}
@Controller('ast')
@ASTAnalyzerServiceControllerMethods()
export class ASTController implements ASTAnalyzerServiceController {
    constructor(
        private readonly buildEnrichedGraphUseCase: BuildEnrichedGraphUseCase,
    ) {}

    buildEnrichedGraph(
        request: BuildEnrichedGraphRequest,
    ): Observable<BuildEnrichedGraphResponse> {
        return from(
            this.buildEnrichedGraphUseCase
                .execute({
                    baseRepo: request.baseRepo,
                    headRepo: request.headRepo,
                })
                .then((result) => createChunkStream(result))
                .catch((error) => {
                    return [
                        {
                            data: '',
                            errors: [errorToGrpc(error)],
                            success: false,
                        },
                    ];
                }),
        ).pipe(switchMap((generator) => from(generator)));
    }
}
