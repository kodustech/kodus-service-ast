import { GraphEnrichmentService } from '@/core/infrastructure/adapters/services/enrichment/graph-enrichment.service';
import { Module } from '@nestjs/common';

@Module({
    imports: [],
    providers: [GraphEnrichmentService],
    exports: [GraphEnrichmentService],
    controllers: [],
})
export class EnrichmentModule {}
