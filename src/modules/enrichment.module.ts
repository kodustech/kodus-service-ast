import { GraphEnrichmentService } from '@/core/infrastructure/adapters/services/enrichment/graph-enrichment.service.js';
import { Module } from '@nestjs/common';
import { LogModule } from './log.module.js';

@Module({
    imports: [LogModule],
    providers: [GraphEnrichmentService],
    exports: [GraphEnrichmentService],
    controllers: [],
})
export class EnrichmentModule {}
