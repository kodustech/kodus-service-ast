import { Module } from '@nestjs/common';
import { LogModule } from './log.module';
import { RepositoryModule } from './repository.module';
import { HealthModule } from './health.module';
import { ASTModule } from './ast.module';
import { DiffModule } from './diff.module';
import { EnrichmentModule } from './enrichment.module';
import { ParsingModule } from './parsing.module';

@Module({
    imports: [
        LogModule,
        ASTModule,
        RepositoryModule,
        HealthModule,
        DiffModule,
        EnrichmentModule,
        ParsingModule,
    ],
    providers: [],
    exports: [],
})
export class AppModule {}
