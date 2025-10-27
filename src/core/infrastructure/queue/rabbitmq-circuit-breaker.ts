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

export enum ErrorType {
    SYSTEM_ERROR = 'SYSTEM_ERROR', // Should open circuit breaker
    BUSINESS_ERROR = 'BUSINESS_ERROR', // Should NOT open circuit breaker
    UNKNOWN_ERROR = 'UNKNOWN_ERROR', // Default to opening circuit breaker
}

export interface CircuitBreakerError extends Error {
    errorType?: ErrorType;
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
        // Check if this is a business error (should not count) or system error (should count)
        const errorType = this.getErrorType(error);

        if (errorType === ErrorType.BUSINESS_ERROR) {
            this.logger.debug(
                `Business error ignored by circuit breaker: ${error.message}`,
                { error: error.message, errorType },
            );
            return; // Don't count business errors
        }

        this.failureCount++;
        this.lastFailureTime = Date.now();

        if (this.state === CircuitState.HALF_OPEN) {
            this.open();
        } else if (this.failureCount >= this.config.failureThreshold) {
            this.open();
        }

        this.logger.warn(
            `System error counted by circuit breaker (${this.failureCount}/${this.config.failureThreshold})`,
            {
                error: error.message,
                errorType,
                state: this.state,
            },
        );
    }

    /**
     * Determine error type based on error properties
     */
    private getErrorType(error: any): ErrorType {
        // If error has explicit type, use it
        if (error?.errorType) {
            return error.errorType;
        }

        // Check error name/type for system errors
        const errorName = error?.name?.toLowerCase() || '';
        const errorMessage = error?.message?.toLowerCase() || '';

        // System errors that should open circuit breaker
        const systemErrorPatterns = [
            'connection',
            'timeout',
            'network',
            'socket',
            'dns',
            'rabbitmq',
            's3',
            'database',
            'memory',
            'out of memory',
            'econnrefused',
            'enotfound',
            'etimedout',
            'econnreset',
        ];

        // Business errors that should NOT open circuit breaker
        const businessErrorPatterns = [
            'repository',
            'clone',
            'file not found',
            'access denied',
            'authentication',
            'permission',
            'not found',
            'unsupported',
            'language not supported',
            'no source files',
        ];

        if (
            systemErrorPatterns.some(
                (pattern) =>
                    errorName.includes(pattern) ||
                    errorMessage.includes(pattern),
            )
        ) {
            return ErrorType.SYSTEM_ERROR;
        }

        if (
            businessErrorPatterns.some((pattern) =>
                errorMessage.includes(pattern),
            )
        ) {
            return ErrorType.BUSINESS_ERROR;
        }

        // Default to system error for unknown errors (safer)
        return ErrorType.SYSTEM_ERROR;
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

// Default configuration - More tolerant for production
export const DEFAULT_CIRCUIT_CONFIG: CircuitBreakerConfig = {
    failureThreshold: 10, // 10 failures (more tolerant - needs more failures to open)
    recoveryTimeout: 15000, // 15 seconds (reduced from 30s)
    monitoringPeriod: 300000, // 5 minutes (reduced from 10min)
    successThreshold: 1, // 1 success to close (reduced from 2)
};

// Stricter configuration for development/testing
export const STRICT_CIRCUIT_CONFIG: CircuitBreakerConfig = {
    failureThreshold: 5, // 5 failures
    recoveryTimeout: 60000, // 1 minute
    monitoringPeriod: 300000, // 5 minutes
    successThreshold: 3, // 3 successes to close
};
