import { Module } from '@nestjs/common';
import { ResolverFactory } from '@/core/infrastructure/adapters/services/ast/resolvers/ResolverFactory';
import {
    IMPORT_PATH_RESOLVER_TOKEN,
    ImportPathResolverService,
} from '@/core/infrastructure/adapters/services/ast/import-path-resolver.service';
import { TreeSitterService } from '@/core/infrastructure/adapters/services/ast/tree-sitter.service';
import { CodeKnowledgeGraphService } from '@/core/infrastructure/adapters/services/ast/code-knowledge-graph.service';
import { CodeQualityAnalyzerService } from '@/core/infrastructure/adapters/services/ast/code-quality-analyzer.service';
import { ASTController } from '@/core/infrastructure/http/controllers/ast/ast.controller';
import { CodeAnalyzerService } from '@/core/infrastructure/adapters/services/ast/code-analyzer.service';
import { RepositoryModule } from './repository.module';
import { BuildEnrichedGraphUseCase } from '@/core/application/use-cases/ast/build-enriched-graph.use-case';

@Module({
    imports: [RepositoryModule],
    providers: [
        TreeSitterService,
        CodeKnowledgeGraphService,
        CodeQualityAnalyzerService,
        ImportPathResolverService,
        ResolverFactory,
        CodeAnalyzerService,

        {
            provide: IMPORT_PATH_RESOLVER_TOKEN,
            useClass: ImportPathResolverService,
        },

        BuildEnrichedGraphUseCase,
    ],
    exports: [
        TreeSitterService,
        CodeKnowledgeGraphService,
        CodeQualityAnalyzerService,
        ImportPathResolverService,
        ResolverFactory,
        CodeAnalyzerService,

        IMPORT_PATH_RESOLVER_TOKEN,
    ],
    controllers: [ASTController],
})
export class AstModule {}
