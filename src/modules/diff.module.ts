import { DiffAnalyzerService } from '@/core/infrastructure/adapters/services/diff/diff-analyzer.service.js';
import { Module } from '@nestjs/common';
import { LogModule } from './log.module.js';

@Module({
    imports: [LogModule],
    providers: [DiffAnalyzerService],
    exports: [DiffAnalyzerService],
    controllers: [],
})
export class DiffModule {}
