import { Controller, Get } from '@nestjs/common';
import { HealthService } from '../../../../domain/health/health.service';

/**
 * Controller responsible for health check via HTTP
 * Provides lightweight and detailed endpoints for monitoring
 */
@Controller('health')
export class HealthController {
    constructor(private readonly healthService: HealthService) {}

    /**
     * Basic health check endpoint for load balancers
     * Designed to be lightweight with minimal overhead
     * This endpoint is suitable for frequent polling by ELB
     */
    @Get()
    checkLiveness(): { status: string } {
        return this.healthService.checkLiveness();
    }

    /**
     * Detailed health check with system metrics
     * For diagnostics and less frequent monitoring
     * Provides memory usage and other system information
     */
    @Get('detail')
    checkReadiness() {
        return this.healthService.checkReadiness();
    }
}
