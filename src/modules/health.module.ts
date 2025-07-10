import { HealthService } from '@/core/domain/health/health.service';
import { HealthController } from '@/core/infrastructure/http/controllers/health/health.controller';
import { Module } from '@nestjs/common';

/**
 * Module that provides health check functionality
 */
@Module({
    imports: [],
    providers: [HealthService],
    exports: [HealthService],
    controllers: [HealthController],
})
export class HealthModule {}
