import { Module } from '@nestjs/common';
import { CodeKnowledgeGraphService } from '@/core/infrastructure/adapters/services/ast/code-knowledge-graph.service';
import { CodeAnalyzerService } from '@/core/infrastructure/adapters/services/ast/code-analyzer.service';
import { RepositoryModule } from './repository.module';
import { ASTController } from '@/core/infrastructure/grpc/controllers/ast/ast.controller';
import { UseCases } from '@/core/application/use-cases/ast';
import { DifferService } from '@/core/infrastructure/adapters/services/ast/differ.service';

@Module({
    imports: [RepositoryModule],
    providers: [
        CodeKnowledgeGraphService,
        CodeAnalyzerService,
        DifferService,
        ...UseCases,
    ],
    exports: [CodeKnowledgeGraphService, CodeAnalyzerService],
    controllers: [ASTController],
})
export class AstModule {}
