import { UseCases } from '@/core/application/use-cases/ast';
import { ASTController } from '@/core/infrastructure/grpc/controllers/ast/ast.controller';
import { Module } from '@nestjs/common';
import { EnrichmentModule } from './enrichment.module';
import { RepositoryModule } from './repository.module';
import { DiffModule } from './diff.module';
import { ParsingModule } from './parsing.module';

@Module({
    imports: [
        ParsingModule,
        EnrichmentModule,
        RepositoryModule,
        EnrichmentModule,
        DiffModule,
    ],
    providers: [...UseCases],
    exports: [],
    controllers: [ASTController],
})
export class ASTModule {}
