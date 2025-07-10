import { Module } from '@nestjs/common';
import { LogModule } from './log.module';
import { RepositoryModule } from './repository.module';
import { HealthModule } from './health.module';
import { ASTModule } from './ast.module';
import { DiffModule } from './diff.module';
import { EnrichmentModule } from './enrichment.module';
import { ParsingModule } from './parsing.module';
import { LLMModule } from '@kodus/kodus-common/llm';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import { GraphAnalysisModule } from './graph-analysis.module';
import { TaskModule } from './task.module';

@Module({
    imports: [
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
