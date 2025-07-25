import { GraphAnalyzerService } from '@/core/infrastructure/adapters/services/graph-analysis/graph-analyzer.service';
import { Module } from '@nestjs/common';
import { DiffModule } from './diff.module';

@Module({
    imports: [DiffModule],
    providers: [GraphAnalyzerService],
    exports: [GraphAnalyzerService],
    controllers: [],
})
export class GraphAnalysisModule {}
