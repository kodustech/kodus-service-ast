import { Module } from '@nestjs/common';
import { CodeKnowledgeGraphService } from '@/core/infrastructure/adapters/services/ast/code-knowledge-graph.service';
import { CodeAnalyzerService } from '@/core/infrastructure/adapters/services/ast/code-analyzer.service';
import { RepositoryModule } from './repository.module';
import { BuildEnrichedGraphUseCase } from '@/core/application/use-cases/ast/build-enriched-graph.use-case';
import { ASTController } from '@/core/infrastructure/grpc/controllers/ast/ast.controller';

@Module({
    imports: [RepositoryModule],
    providers: [
        CodeKnowledgeGraphService,
        CodeAnalyzerService,
        BuildEnrichedGraphUseCase,
    ],
    exports: [CodeKnowledgeGraphService, CodeAnalyzerService],
    controllers: [ASTController],
})
export class AstModule {}
