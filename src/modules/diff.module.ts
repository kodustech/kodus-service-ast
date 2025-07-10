import { DiffAnalyzerService } from '@/core/infrastructure/adapters/services/diff/diff-analyzer.service';
import { Module } from '@nestjs/common';
import { RepositoryModule } from './repository.module';

@Module({
    imports: [RepositoryModule],
    providers: [DiffAnalyzerService],
    exports: [DiffAnalyzerService],
    controllers: [],
})
export class DiffModule {}
