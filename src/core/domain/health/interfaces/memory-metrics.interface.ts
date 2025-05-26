/**
 * Interface representing memory metrics of the system
 */
export interface MemoryMetrics {
    /**
     * Memory usage metrics in MB
     */
    usage: {
        /**
         * Resident Set Size (RSS) in MB
         */
        rss: number;

        /**
         * Total allocated heap in MB
         */
        heapTotal: number;

        /**
         * Used heap space in MB
         */
        heapUsed: number;
    };
}
