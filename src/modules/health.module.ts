import { HealthService } from '@/core/domain/health/health.service';
import { HealthController } from '@/core/infrastructure/http/controllers/health/health.controller';
import { Module } from '@nestjs/common';

/**
 * Module that provides health check functionality
 */
@Module({
    controllers: [HealthController],
    providers: [HealthService],
    exports: [HealthService],
})
export class HealthModule {}
