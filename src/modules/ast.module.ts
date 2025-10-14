import { AstHttpController } from '@/core/infrastructure/http/controllers/ast.controller.js';
import { Module } from '@nestjs/common';
import { EnrichmentModule } from './enrichment.module.js';
import { RepositoryModule } from './repository.module.js';
import { DiffModule } from './diff.module.js';
import { ParsingModule } from './parsing.module.js';
import { TaskModule } from './task.module.js';
import { GraphAnalysisModule } from './graph-analysis.module.js';
import { useCases } from '@/core/application/use-cases/ast/index.js';

@Module({
    imports: [
        ParsingModule,
        EnrichmentModule,
        RepositoryModule,
        DiffModule,
        TaskModule,
        GraphAnalysisModule,
    ],
    providers: [...useCases],
    exports: [...useCases],
    controllers: [AstHttpController],
})
export class ASTModule {}
