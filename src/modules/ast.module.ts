import { AstHttpController } from '@/core/infrastructure/http/controllers/ast.controller.js';
import { Module, DynamicModule } from '@nestjs/common';
import { EnrichmentModule } from './enrichment.module.js';
import { RepositoryModule } from './repository.module.js';
import { DiffModule } from './diff.module.js';
import { ParsingModule } from './parsing.module.js';
import { TaskModule } from './task.module.js';
import { GraphAnalysisModule } from './graph-analysis.module.js';
import {
    apiCommands,
    queries,
} from '@/core/application/use-cases/ast/index.js';

@Module({})
export class ASTModule {
    /**
     * Dynamic module for API context - includes all commands and queries
     */
    static forApi(): DynamicModule {
        return {
            module: ASTModule,
            imports: [
                ParsingModule,
                EnrichmentModule,
                RepositoryModule,
                DiffModule,
                TaskModule,
                GraphAnalysisModule,
            ],
            providers: [
                ...apiCommands, // All command use cases
                ...queries, // All query use cases
            ],
            exports: [...apiCommands, ...queries],
            controllers: [AstHttpController],
        };
    }

    /**
     * Dynamic module for Worker context - only async commands
     */
    static forWorker(): DynamicModule {
        return {
            module: ASTModule,
            imports: [
                ParsingModule,
                EnrichmentModule,
                RepositoryModule,
                GraphAnalysisModule,
            ],
            providers: [],
            exports: [],
        };
    }
}
