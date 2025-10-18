import { GraphAnalyzerService } from '@/core/infrastructure/adapters/services/graph-analysis/graph-analyzer.service.js';
import { Module } from '@nestjs/common';
import { DiffModule } from './diff.module.js';
import { LogModule } from './log.module.js';

@Module({
    imports: [DiffModule, LogModule],
    providers: [GraphAnalyzerService],
    exports: [GraphAnalyzerService],
    controllers: [],
})
export class GraphAnalysisModule {}
