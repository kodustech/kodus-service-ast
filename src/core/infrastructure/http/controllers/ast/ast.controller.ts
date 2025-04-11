import { AnalyzeDependenciesUseCase } from '@/core/application/use-cases/ast/analyze-dependencies.use-cases';
import { Injectable } from '@nestjs/common';
import { GrpcMethod } from '@nestjs/microservices';
import { from, switchMap } from 'rxjs';

@Injectable()
export class ASTController {
    constructor(
        private readonly analyzeDependenciesUseCase: AnalyzeDependenciesUseCase,
    ) {}

    @GrpcMethod('ASTAnalyzer', 'BuildEnrichedGraph')
    buildEnrichedGraph(data: { headDir: string; baseDir: string }) {
        return from(
            this.analyzeDependenciesUseCase.execute(data.headDir, data.baseDir),
        ).pipe(
            switchMap((result) => {
                const jsonString = JSON.stringify(result);
                const chunks = [];
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
