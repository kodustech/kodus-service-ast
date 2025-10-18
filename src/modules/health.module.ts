import { HealthService } from '@/core/domain/health/health.service.js';
import { HealthController } from '@/core/infrastructure/http/controllers/health/health.controller.js';
import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { QueueModuleWorker } from '../core/infrastructure/queue/queue.module.worker.js';
import { ParsingModule } from './parsing.module.js';

/**
 * Module that provides health check functionality
 */
@Module({
    imports: [
        TerminusModule,
        QueueModuleWorker, // For RabbitMQ health checks
        ParsingModule, // For CodeKnowledgeGraphService streaming metrics
    ],
    providers: [HealthService],
    exports: [HealthService],
    controllers: [HealthController],
})
export class HealthModule {}
