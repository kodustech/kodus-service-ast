import { DiffAnalyzerService } from '@/core/infrastructure/adapters/services/diff/diff-analyzer.service';
import { Module } from '@nestjs/common';

@Module({
    imports: [],
    providers: [DiffAnalyzerService],
    exports: [DiffAnalyzerService],
    controllers: [],
})
export class DiffModule {}
