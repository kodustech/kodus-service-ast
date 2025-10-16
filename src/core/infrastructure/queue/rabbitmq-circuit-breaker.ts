import { Injectable, Logger } from '@nestjs/common';

export enum CircuitState {
    CLOSED = 'CLOSED', // Normal operation
    OPEN = 'OPEN', // Circuit is open, failing fast
    HALF_OPEN = 'HALF_OPEN', // Testing if service recovered
}

export interface CircuitBreakerConfig {
    failureThreshold: number; // Number of failures before opening
    recoveryTimeout: number; // Time to wait before trying again (ms)
    monitoringPeriod: number; // Time window for failure counting (ms)
    successThreshold: number; // Successes needed to close circuit in HALF_OPEN
}

@Injectable()
export class RabbitMQCircuitBreaker {
    private readonly logger = new Logger(RabbitMQCircuitBreaker.name);

    private state: CircuitState = CircuitState.CLOSED;
    private failureCount = 0;
    private lastFailureTime = 0;
    private successCount = 0;

    constructor(private config: CircuitBreakerConfig) {}

    /**
     * Execute operation with circuit breaker protection
     */
    async execute<T>(operation: () => Promise<T>): Promise<T> {
        if (this.state === CircuitState.OPEN) {
            if (this.shouldAttemptReset()) {
                this.state = CircuitState.HALF_OPEN;
                this.logger.log('Circuit breaker transitioning to HALF_OPEN');
            } else {
                throw new Error(
                    'Circuit breaker is OPEN - RabbitMQ temporarily unavailable',
                );
            }
        }

        try {
            const result = await operation();
            this.onSuccess();
            return result;
        } catch (error) {
            this.onFailure(error);
            throw error;
        }
    }

    /**
     * Record a successful operation
     */
    private onSuccess(): void {
        this.failureCount = 0;

        if (this.state === CircuitState.HALF_OPEN) {
            this.successCount++;
            if (this.successCount >= this.config.successThreshold) {
                this.close();
            }
        }
    }

    /**
     * Record a failed operation
     */
    private onFailure(error: any): void {
        this.failureCount++;
        this.lastFailureTime = Date.now();

        if (this.state === CircuitState.HALF_OPEN) {
            this.open();
        } else if (this.failureCount >= this.config.failureThreshold) {
            this.open();
        }

        this.logger.warn(
            `RabbitMQ operation failed (${this.failureCount}/${this.config.failureThreshold})`,
            {
                error: error.message,
                state: this.state,
            },
        );
    }

    /**
     * Open the circuit breaker
     */
    private open(): void {
        this.state = CircuitState.OPEN;
        this.successCount = 0;
        this.logger.error(
            `Circuit breaker OPENED - RabbitMQ failures exceeded threshold (${this.failureCount})`,
        );
    }

    /**
     * Close the circuit breaker
     */
    private close(): void {
        this.state = CircuitState.CLOSED;
        this.failureCount = 0;
        this.successCount = 0;
        this.logger.log('Circuit breaker CLOSED - RabbitMQ recovered');
    }

    /**
     * Check if we should attempt to reset the circuit
     */
    private shouldAttemptReset(): boolean {
        return Date.now() - this.lastFailureTime >= this.config.recoveryTimeout;
    }

    /**
     * Get current circuit breaker status
     */
    getStatus() {
        return {
            state: this.state,
            failureCount: this.failureCount,
            successCount: this.successCount,
            lastFailureTime: this.lastFailureTime,
            timeUntilReset:
                this.state === CircuitState.OPEN
                    ? Math.max(
                          0,
                          this.config.recoveryTimeout -
                              (Date.now() - this.lastFailureTime),
                      )
                    : 0,
        };
    }

    /**
     * Force reset the circuit breaker (for testing/admin purposes)
     */
    forceReset(): void {
        this.close();
        this.logger.log('Circuit breaker manually reset');
    }

    /**
     * Check if circuit is allowing requests
     */
    isAvailable(): boolean {
        return (
            this.state === CircuitState.CLOSED ||
            (this.state === CircuitState.HALF_OPEN && this.shouldAttemptReset())
        );
    }
}

// Default configuration
export const DEFAULT_CIRCUIT_CONFIG: CircuitBreakerConfig = {
    failureThreshold: 5, // 5 failures
    recoveryTimeout: 60000, // 1 minute
    monitoringPeriod: 300000, // 5 minutes
    successThreshold: 3, // 3 successes to close
};
