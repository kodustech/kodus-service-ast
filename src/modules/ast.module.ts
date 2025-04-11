import { Module } from '@nestjs/common';
import { ResolverFactory } from '@/core/infrastructure/adapters/services/ast/resolvers/ResolverFactory';
import { ImportPathResolverService } from '@/core/infrastructure/adapters/services/ast/import-path-resolver.service';
import { TreeSitterService } from '@/core/infrastructure/adapters/services/ast/tree-sitter.service';
import { CodeKnowledgeGraphService } from '@/core/infrastructure/adapters/services/ast/code-knowledge-graph.service';
import { CodeQualityAnalyzerService } from '@/core/infrastructure/adapters/services/ast/code-quality-analyzer.service';
import { ASTController } from '@/core/infrastructure/http/controllers/ast/ast.controller';
import { AnalyzeDependenciesUseCase } from '@/core/application/use-cases/ast/analyze-dependencies.use-cases';
import { CodeAnalyzerService } from '@/core/infrastructure/adapters/services/ast/code-analyzer.service';

const services = [
    TreeSitterService,
    CodeKnowledgeGraphService,
    CodeQualityAnalyzerService,
    ImportPathResolverService,
    ResolverFactory,
    CodeAnalyzerService,
];

const providers = [
    ...services,
    {
        provide: 'IImportPathResolver',
        useClass: ImportPathResolverService,
    },
    AnalyzeDependenciesUseCase,
];

const moduleExports = [...services, 'IImportPathResolver'];

@Module({
    imports: [],
    providers,
    exports: moduleExports,
    controllers: [ASTController],
})
export class AstModule {}
