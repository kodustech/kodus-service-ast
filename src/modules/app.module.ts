import { Module } from '@nestjs/common';
import { LogModule } from './log.module.js';
import { RepositoryModule } from './repository.module.js';
import { HealthModule } from './health.module.js';
import { ASTModule } from './ast.module.js';
import { DiffModule } from './diff.module.js';
import { EnrichmentModule } from './enrichment.module.js';
import { ParsingModule } from './parsing.module.js';
import { LLMModule } from '@kodus/kodus-common/llm';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service.js';
import { GraphAnalysisModule } from './graph-analysis.module.js';
import { TaskModule } from './task.module.js';
import { DatabaseModule } from '@/core/infrastructure/database/database.module.js';

@Module({
    imports: [
        DatabaseModule,
        LogModule,
        ASTModule,
        RepositoryModule,
        HealthModule,
        DiffModule,
        EnrichmentModule,
        ParsingModule,
        GraphAnalysisModule,
        LLMModule.forRoot({
            logger: PinoLoggerService,
            global: true,
        }),
        TaskModule,
    ],
    providers: [],
    exports: [],
    controllers: [],
})
export class AppModule {}
