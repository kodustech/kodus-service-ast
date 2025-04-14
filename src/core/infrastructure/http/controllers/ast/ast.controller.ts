import { BuildEnrichedGraphUseCase } from '@/core/application/use-cases/ast/build-enriched-graph.use-case';
import {
    ASTAnalyzerController,
    ASTAnalyzerControllerMethods,
    kodusRPCBuildEnrichedGraphRequest,
} from '@/proto/kodus/ast/analyzer';
import { kodusRPCChunkResponse } from '@/proto/kodus/common/chunk';
import { Controller } from '@nestjs/common';
import { from, Observable, switchMap } from 'rxjs';

@Controller('ast')
@ASTAnalyzerControllerMethods()
export class ASTController implements ASTAnalyzerController {
    constructor(
        private readonly buildEnrichedGraphUseCase: BuildEnrichedGraphUseCase,
    ) {}

    buildEnrichedGraph(
        request: kodusRPCBuildEnrichedGraphRequest,
    ): Observable<kodusRPCChunkResponse> {
        return from(
            this.buildEnrichedGraphUseCase.execute({
                baseRepo: request.baseRepo,
                headRepo: request.headRepo,
            }),
        ).pipe<kodusRPCChunkResponse>(
            switchMap((result) => {
                const jsonString = JSON.stringify(result);
                const chunks = [] as kodusRPCChunkResponse[];
                const chunkSize = 65536; // 64 KB

                for (let i = 0; i < jsonString.length; i += chunkSize) {
                    chunks.push({
                        chunk: jsonString.substring(i, i + chunkSize),
                    });
                }

                return from(chunks);
            }),
        );
    }
}
