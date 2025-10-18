import { type MemoryMetrics } from './memory-metrics.interface.js';

/**
 * Interface representing the complete system status
 */
export interface SystemStatus {
    /**
     * Current health status of the service
     */
    status: string;

    /**
     * Current timestamp of the health check
     */
    timestamp: string;

    /**
     * Service version
     */
    version: string;

    /**
     * Service uptime in a human-readable format
     */
    uptime: string;

    /**
     * Memory metrics of the service
     */
    memory: MemoryMetrics;
}
