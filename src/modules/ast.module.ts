import { ASTController } from '@/core/infrastructure/grpc/controllers/ast/ast.controller';
import { Module } from '@nestjs/common';
import { EnrichmentModule } from './enrichment.module';
import { RepositoryModule } from './repository.module';
import { DiffModule } from './diff.module';
import { ParsingModule } from './parsing.module';
import { TaskModule } from './task.module';
import { UseCases } from '@/core/application/use-cases/ast';
import { GraphAnalysisModule } from './graph-analysis.module';

@Module({
    imports: [
        ParsingModule,
        EnrichmentModule,
        RepositoryModule,
        EnrichmentModule,
        DiffModule,
        TaskModule,
        GraphAnalysisModule,
    ],
    providers: [...UseCases],
    exports: [...UseCases],
    controllers: [ASTController],
})
export class ASTModule {}
