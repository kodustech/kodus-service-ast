import { Module } from '@nestjs/common';
import { CodeKnowledgeGraphService } from '@/core/infrastructure/adapters/services/ast/code-knowledge-graph.service';
import { CodeAnalyzerService } from '@/core/infrastructure/adapters/services/ast/code-analyzer.service';
import { RepositoryModule } from './repository.module';
import { ASTController } from '@/core/infrastructure/grpc/controllers/ast/ast.controller';
import { UseCases } from '@/core/application/use-cases/ast';
import { SerializerService } from '@/core/infrastructure/adapters/services/ast/serializer.service';

@Module({
    imports: [RepositoryModule],
    providers: [
        CodeKnowledgeGraphService,
        CodeAnalyzerService,
        SerializerService,
        ...UseCases,
    ],
    exports: [
        CodeKnowledgeGraphService,
        CodeAnalyzerService,
        SerializerService,
    ],
    controllers: [ASTController],
})
export class AstModule {}
