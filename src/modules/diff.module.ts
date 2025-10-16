import { DiffAnalyzerService } from '@/core/infrastructure/adapters/services/diff/diff-analyzer.service.js';
import { Module } from '@nestjs/common';
import { RepositoryModule } from './repository.module.js';
import { LogModule } from './log.module.js';

@Module({
    imports: [RepositoryModule, LogModule],
    providers: [DiffAnalyzerService],
    exports: [DiffAnalyzerService],
    controllers: [],
})
export class DiffModule {}
