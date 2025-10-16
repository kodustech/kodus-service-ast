import { Module } from '@nestjs/common';
import { CodeKnowledgeGraphService } from '@/core/infrastructure/adapters/services/parsing/code-knowledge-graph.service.js';
import { LogModule } from './log.module.js';

@Module({
    imports: [LogModule],
    providers: [CodeKnowledgeGraphService],
    exports: [CodeKnowledgeGraphService],
    controllers: [],
})
export class ParsingModule {}
