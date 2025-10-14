import { Module } from '@nestjs/common';
import { CodeKnowledgeGraphService } from '@/core/infrastructure/adapters/services/parsing/code-knowledge-graph.service.js';

@Module({
    imports: [],
    providers: [CodeKnowledgeGraphService],
    exports: [CodeKnowledgeGraphService],
    controllers: [],
})
export class ParsingModule {}
