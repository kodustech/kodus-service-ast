import { Injectable } from '@nestjs/common';
import { MemoryMetrics } from './interfaces/memory-metrics.interface';
import { SystemStatus } from './interfaces/system-status.interface';

/**
 * Service responsible for providing health status information
 */
@Injectable()
export class HealthService {
    private metricsCache: MemoryMetrics | null = null;
    private lastMetricsTime = 0;
    private readonly CACHE_TTL = 60000; // 1 minute in ms

    /**
     * Checks if the service is running properly
     * Optimized for high frequency calls from load balancers
     * @returns Boolean indicating if the service is healthy
     */
    isHealthy(): boolean {
        return true;
    }

    /**
     * Performs a lightweight health check
     * @returns Simple status object
     */
    checkLiveness(): { status: string } {
        return { status: 'ok' };
    }

    /**
     * Performs a comprehensive health check with system metrics
     * @returns Detailed system status
     */
    checkReadiness(): SystemStatus {
        return {
            status: 'ok',
            timestamp: new Date().toISOString(),
            version: process.env.RELEASE_VERSION || 'development',
            uptime: this.formatUptime(process.uptime()),
            memory: this.getMemoryMetrics(),
        };
    }

    /**
     * Formats uptime into a human-readable string
     * @param uptime - Uptime in seconds
     * @returns Formatted uptime string
     */
    private formatUptime(uptime: number): string {
        const hours = Math.floor(uptime / 3600);
        const minutes = Math.floor((uptime % 3600) / 60);
        const seconds = Math.floor(uptime % 60);
        return `${hours}h ${minutes}m ${seconds}s`;
    }

    /**
     * Gets memory metrics with caching to reduce system load
     * @returns Memory metrics
     */
    private getMemoryMetrics(): MemoryMetrics {
        const now = Date.now();

        // Use cache if available and not expired
        if (this.metricsCache && now - this.lastMetricsTime < this.CACHE_TTL) {
            return this.metricsCache;
        }

        // Calculate new metrics
        const memoryUsage = process.memoryUsage();
        this.metricsCache = {
            usage: {
                rss: Math.round(memoryUsage.rss / 1024 / 1024),
                heapTotal: Math.round(memoryUsage.heapTotal / 1024 / 1024),
                heapUsed: Math.round(memoryUsage.heapUsed / 1024 / 1024),
            },
        };

        this.lastMetricsTime = now;
        return this.metricsCache;
    }
}
