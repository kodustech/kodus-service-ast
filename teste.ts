// worker/main.ts

import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { WorkerModule } from '../modules/worker.module.js';
import { type INestApplicationContext } from '@nestjs/common';

async function bootstrap(): Promise<void> {
    let app: INestApplicationContext;
    try {
        console.log('[WORKER] Starting bootstrap function...');
        console.log('[WORKER] Calling NestFactory.createApplicationContext...');
        app = await NestFactory.createApplicationContext(WorkerModule, {
            logger: ['log', 'error', 'warn', 'debug', 'verbose'],
        });
        console.log('[WORKER] Application context created');

        console.log('[WORKER] Calling app.init()...');
        await app.init();
        console.log('[WORKER] app.init() resolved');

        console.log('[WORKER] Waiting 2 seconds for RabbitMQ setup...');
        await new Promise((resolve) => setTimeout(resolve, 2000));
        console.log('[WORKER] Wait completed');

        console.log('[WORKER] Worker is ready');
    } catch (error) {
        console.error('[WORKER] Error during bootstrap:', error);
        throw error;
    }

    const shutdown = async (signal: NodeJS.Signals) => {
        try {
            await app.close();
            console.log('[WORKER] Worker shutdown complete', signal);
        } catch (error) {
            console.error('[WORKER] Error during worker shutdown:', error);
        } finally {
            process.exit(0);
        }
    };

    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
        process.once(signal, () => {
            void shutdown(signal);
        });
    }

    // Avise PM2 que o processo está pronto (wait_ready)
    if (typeof process.send === 'function') {
        process.send('ready');
    }
}

bootstrap().catch((error) => {
    console.error('Fatal error during worker bootstrap:', error);
    process.exit(1);
});

// Tratamento de erros não capturados
process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
});

// queue-config.module.ts
import { Global, Module } from '@nestjs/common';
import { RABBITMQ_CONFIG } from './rabbit.constants.js';
import { loadRabbitMqConfig } from './rabbit.config.js';
import { getEnvVariable } from '@/shared/utils/env.js';

const DEFAULT_SERVICE_NAME = 'kodus-service-ast';

@Global()
@Module({
    providers: [
        {
            provide: RABBITMQ_CONFIG,
            useFactory: () => {
                const serviceName =
                    getEnvVariable('SERVICE_NAME') ??
                    getEnvVariable('CONTAINER_NAME') ??
                    DEFAULT_SERVICE_NAME;
                return loadRabbitMqConfig(serviceName);
            },
        },
    ],
    exports: [RABBITMQ_CONFIG],
})
export class QueueConfigModule {}

// queue-validator.service.ts
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { QUEUE_CONFIG } from './queue.constants.js';

@Injectable()
export class QueueValidatorService implements OnModuleInit {
    private readonly logger = new Logger(QueueValidatorService.name);

    constructor(private readonly connection: AmqpConnection) {}

    async onModuleInit() {
        try {
            await this.validateQueueConfigurations();
        } catch (error) {
            this.logger.error('Failed to validate queue configurations', error);
        }
    }

    /**
     * Validate that critical queues are accessible
     */
    private async validateQueueConfigurations(): Promise<void> {
        const criticalQueues = [
            QUEUE_CONFIG.REPO_QUEUE,
            QUEUE_CONFIG.IMPACT_QUEUE,
            QUEUE_CONFIG.DEAD_LETTER_QUEUE,
        ];

        for (const queueName of criticalQueues) {
            try {
                // Check if managedChannel is available
                if (!this.connection.managedChannel) {
                    this.logger.log(
                        `Managed channel not yet available for queue ${queueName} - skipping validation`,
                    );
                    continue;
                }

                // Check if queue exists without declaring it
                await this.connection.managedChannel.checkQueue(queueName);
                this.logger.log(`✅ Queue ${queueName} is accessible`);
            } catch (error: any) {
                // If queue doesn't exist, that's expected for new deployments
                if (
                    error.code === 404 ||
                    error.message?.includes('NOT_FOUND')
                ) {
                    this.logger.log(
                        `Queue ${queueName} does not exist - will be created by consumers`,
                    );
                } else {
                    this.logger.warn(
                        `Could not validate queue ${queueName}:`,
                        error.message,
                    );
                }
            }
        }
    }

    /**
     * Get basic queue information for health checks
     */
    async getQueueInfo(queueName: string): Promise<any> {
        try {
            if (!this.connection.managedChannel) {
                this.logger.warn(
                    `Managed channel not available for queue ${queueName}`,
                );
                return null;
            }

            return await this.connection.managedChannel.checkQueue(queueName);
        } catch (error) {
            this.logger.warn(
                `Could not get info for queue ${queueName}:`,
                error,
            );
            return null;
        }
    }

    /**
     * Validate configuration health (for health checks)
     */
    async validateConfigurationHealth(): Promise<{
        healthy: boolean;
        issues: string[];
        details: any;
    }> {
        const issues: string[] = [];
        const details: any = {};

        try {
            // Check critical queues exist and are accessible
            const repoQueue = await this.getQueueInfo(QUEUE_CONFIG.REPO_QUEUE);
            const impactQueue = await this.getQueueInfo(
                QUEUE_CONFIG.IMPACT_QUEUE,
            );
            const dlq = await this.getQueueInfo(QUEUE_CONFIG.DEAD_LETTER_QUEUE);

            details.queues = {
                repo: !!repoQueue,
                impact: !!impactQueue,
                dlq: !!dlq,
            };

            // Check if any critical queues are missing
            if (!repoQueue) {
                issues.push('Repository queue not accessible');
            }
            if (!impactQueue) {
                issues.push('Impact analysis queue not accessible');
            }
            if (!dlq) {
                issues.push('Dead letter queue not accessible');
            }
        } catch (error: any) {
            issues.push(`RabbitMQ health check failed: ${error.message}`);
        }

        return {
            healthy: issues.length === 0,
            issues,
            details,
        };
    }
}

// queue.constants.ts
import { getEnvVariable } from '@/shared/utils/env.js';

// Queue configuration versioning
export const QUEUE_CONFIG_VERSION = 'v2.0.0';

// Queue configuration constants and types
export const QUEUE_CONFIG = {
    // Delivery limits
    DELIVERY_LIMIT: 5,

    // Queue types
    QUEUE_TYPE: 'quorum',

    // Exchanges
    EXCHANGE: 'ast.jobs.x',
    DEAD_LETTER_EXCHANGE: 'ast.jobs.dlx',
    DELAYED_EXCHANGE: 'ast.jobs.delayed.x',

    // Queues
    REPO_QUEUE: 'ast.initialize.repo.q',
    IMPACT_QUEUE: 'ast.initialize.impact.q',
    DEAD_LETTER_QUEUE: 'ast.jobs.dlq',
    ECHO_QUEUE: 'ast.test.echo.q',

    // Routing keys
    REPO_ROUTING_KEY: 'ast.initialize.repo',
    IMPACT_ROUTING_KEY: 'ast.initialize.impact',
    ECHO_ROUTING_KEY: 'ast.test.echo',
} as const;

// Runtime configuration with feature flags
export function getQueueRuntimeConfig() {
    const enableExperimentalFeatures =
        (getEnvVariable('RABBIT_EXPERIMENTAL') ?? 'false') === 'true';

    return {
        version: QUEUE_CONFIG_VERSION,
        enableSingleActiveConsumer:
            (getEnvVariable('RABBIT_SAC') ?? 'false') === 'true',
        retryTtlMs: Number(getEnvVariable('RABBIT_RETRY_TTL_MS') ?? '30000'),
        prefetch: Number(getEnvVariable('RABBIT_PREFETCH') ?? '1'),
        publishTimeoutMs: Number(
            getEnvVariable('RABBIT_PUBLISH_TIMEOUT_MS') ?? '5000',
        ),
        // Feature flags for gradual rollout
        enableExperimentalFeatures,
        enableEnhancedRetry:
            enableExperimentalFeatures &&
            (getEnvVariable('RABBIT_ENHANCED_RETRY') ?? 'false') === 'true',
        enableQueueMonitoring:
            (getEnvVariable('RABBIT_QUEUE_MONITORING') ?? 'true') === 'true',
    };
}

// Queue arguments builder
export function buildQueueArguments(
    options: {
        deadLetterExchange?: string;
        deliveryLimit?: number;
        singleActiveConsumer?: boolean;
        messageTtl?: number;
    } = {},
) {
    const args: Record<string, any> = {
        'x-queue-type': QUEUE_CONFIG.QUEUE_TYPE,
    };

    if (options.deadLetterExchange) {
        args['x-dead-letter-exchange'] = options.deadLetterExchange;
    }

    if (options.deliveryLimit) {
        args['x-delivery-limit'] = options.deliveryLimit;
    }

    if (options.singleActiveConsumer) {
        args['x-single-active-consumer'] = true;
    }

    if (options.messageTtl) {
        args['x-message-ttl'] = options.messageTtl;
    }

    return args;
}

// Consumer queue options builder
export function buildConsumerQueueOptions(
    options: {
        deadLetterExchange?: string;
        deliveryLimit?: number;
        singleActiveConsumer?: boolean;
    } = {},
) {
    return {
        channel: 'consumer' as const,
        durable: true,
        arguments: buildQueueArguments(options),
    };
}

// Build task queue options with runtime config
export function buildTaskQueueOptions(config: {
    enableSingleActiveConsumer: boolean;
}) {
    return buildConsumerQueueOptions({
        deadLetterExchange: QUEUE_CONFIG.DEAD_LETTER_EXCHANGE,
        deliveryLimit: QUEUE_CONFIG.DELIVERY_LIMIT,
        singleActiveConsumer: config.enableSingleActiveConsumer,
    });
}

// queue.module.api.ts
import { Module } from '@nestjs/common';
import { RabbitMQModule } from '@golevelup/nestjs-rabbitmq';
import { QueueConfigModule } from './queue-config.module.js';
import { RABBITMQ_CONFIG } from './rabbit.constants.js';
import { QUEUE_CONFIG } from './queue.constants.js';
import type { RabbitMqConfig } from './rabbit.config.js';
import { RabbitTaskDispatcher } from './rabbit-task-dispatcher.service.js';
import { TASK_JOB_DISPATCHER } from '@/core/application/services/task/task.service.js';

@Module({
    imports: [
        QueueConfigModule,
        RabbitMQModule.forRootAsync({
            imports: [QueueConfigModule],
            inject: [RABBITMQ_CONFIG],
            useFactory: (cfg: RabbitMqConfig) => ({
                name: cfg.connectionName,
                uri: cfg.url,
                prefetchCount: cfg.prefetch ?? 1,
                channels: {
                    producer: {
                        prefetchCount: cfg.prefetch ?? 1,
                        default: true,
                    },
                },
                connectionInitOptions: {
                    wait: true,
                    timeout: 10_000,
                    reject: true,
                },
                connectionManagerOptions: {
                    heartbeatIntervalInSeconds: 30,
                    reconnectTimeInSeconds: 5,
                    connectionOptions: {
                        clientProperties: {
                            connection_name: cfg.connectionName,
                        },
                    },
                },
                exchanges: [
                    {
                        name: QUEUE_CONFIG.EXCHANGE,
                        type: 'topic',
                        options: { durable: true },
                    },
                    {
                        name: QUEUE_CONFIG.DEAD_LETTER_EXCHANGE,
                        type: 'topic',
                        options: { durable: true },
                    },
                    {
                        name: QUEUE_CONFIG.DELAYED_EXCHANGE,
                        type: 'x-delayed-message',
                        options: {
                            durable: true,
                            arguments: {
                                'x-delayed-type': 'topic',
                            },
                        },
                    },
                ],
                registerHandlers: false, // API só publica
                enableDirectReplyTo: false, // Não usamos RPC/solicitação-resposta
            }),
        }),
    ],
    providers: [
        // publisher usando AmqpConnection.publish(...)
        RabbitTaskDispatcher,
        { provide: TASK_JOB_DISPATCHER, useExisting: RabbitTaskDispatcher },
    ],
    exports: [RabbitMQModule, RabbitTaskDispatcher, TASK_JOB_DISPATCHER],
})
export class QueueModuleApi {}

// queue.module.worker.ts

import { Module } from '@nestjs/common';
import {
    RabbitMQModule,
    MessageHandlerErrorBehavior,
} from '@golevelup/nestjs-rabbitmq';
import { QueueConfigModule } from './queue-config.module.js';
import { RABBITMQ_CONFIG } from './rabbit.constants.js';
import { type RabbitMqConfig } from './rabbit.config.js';
import { QUEUE_CONFIG, getQueueRuntimeConfig } from './queue.constants.js';
import { QueueValidatorService } from './queue-validator.service.js';
import { RabbitMQHealthIndicator } from './rabbitmq.health.js';
import { RabbitMQMonitorService } from './rabbitmq-monitor.service.js';

const runtimeConfig = getQueueRuntimeConfig();

@Module({
    imports: [
        QueueConfigModule, // <-- disponibiliza o token no módulo
        RabbitMQModule.forRootAsync({
            imports: [QueueConfigModule], // <-- disponibiliza o token no contexto do módulo dinâmico
            inject: [RABBITMQ_CONFIG],
            useFactory: (cfg: RabbitMqConfig) => ({
                name: cfg.connectionName,
                uri: cfg.url,
                prefetchCount: runtimeConfig.prefetch,
                channels: {
                    consumer: {
                        prefetchCount: runtimeConfig.prefetch,
                        default: true,
                    },
                },
                connectionInitOptions: {
                    wait: true,
                    timeout: 10_000,
                    reject: true,
                },
                connectionManagerOptions: {
                    heartbeatIntervalInSeconds: 30,
                    reconnectTimeInSeconds: 5,
                    connectionOptions: {
                        clientProperties: {
                            connection_name: cfg.connectionName,
                        },
                    },
                },
                exchanges: [
                    {
                        name: QUEUE_CONFIG.EXCHANGE,
                        type: 'topic',
                        options: { durable: true },
                    },
                    {
                        name: QUEUE_CONFIG.DEAD_LETTER_EXCHANGE,
                        type: 'topic',
                        options: { durable: true },
                    },
                    {
                        name: QUEUE_CONFIG.DELAYED_EXCHANGE,
                        type: 'x-delayed-message',
                        options: {
                            durable: true,
                            arguments: {
                                'x-delayed-type': 'topic',
                            },
                        },
                    },
                ],
                queues: [
                    {
                        name: QUEUE_CONFIG.DEAD_LETTER_QUEUE,
                        createQueueIfNotExists: true,
                        options: {
                            durable: true,
                            arguments: {
                                'x-queue-type': QUEUE_CONFIG.QUEUE_TYPE,
                            },
                        },
                        exchange: QUEUE_CONFIG.DEAD_LETTER_EXCHANGE,
                        routingKey: '#',
                    },
                ],
                registerHandlers: true,
                defaultSubscribeErrorBehavior: MessageHandlerErrorBehavior.NACK,
                enableDirectReplyTo: false, // Não usamos RPC/solicitação-resposta
            }),
        }),
    ],
    providers: [
        QueueValidatorService,
        RabbitMQHealthIndicator,
        RabbitMQMonitorService,
    ],
    exports: [
        RabbitMQModule,
        QueueValidatorService,
        RabbitMQHealthIndicator,
        RabbitMQMonitorService,
    ],
})
export class QueueModuleWorker {}

// rabbit-task-dispatcher.service.ts
import { Inject, Injectable } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { handleError } from '@/shared/utils/errors.js';
import {
    ITaskJobDispatcher,
    DispatchTaskPayload,
} from '@/core/application/services/task/task.service.js';
import { RABBITMQ_CONFIG } from './rabbit.constants.js';
import { QUEUE_CONFIG } from './queue.constants.js';
import { type RabbitMqConfig } from './rabbit.config.js';

// aproveita seu resolveRoutingKey já existente
import { resolveRoutingKey } from './task-queue.definition.js';

@Injectable()
export class RabbitTaskDispatcher implements ITaskJobDispatcher {
    constructor(
        private readonly amqp: AmqpConnection,
        @Inject(RABBITMQ_CONFIG) private readonly cfg: RabbitMqConfig,
    ) {}

    async dispatch<T>(payload: DispatchTaskPayload<T>): Promise<void> {
        const { routingKey } = resolveRoutingKey(payload.type);
        const message = {
            taskId: payload.taskId,
            type: payload.type,
            payload: payload.payload,
            metadata: payload.metadata,
            priority: payload.priority,
            retryCount: 0,
            createdAt: new Date().toISOString(),
        };

        try {
            await this.amqp.publish(
                QUEUE_CONFIG.EXCHANGE,
                routingKey,
                message,
                {
                    persistent: true,
                    contentType: 'application/json',
                    contentEncoding: 'utf-8',
                    messageId: payload.taskId,
                    timestamp: Date.now(),
                    correlationId: payload.taskId,
                    appId: this.cfg.connectionName,
                    headers: {
                        'x-task-type': payload.type,
                        'x-retry-count': 0,
                        ...payload.metadata,
                    },
                },
            );
        } catch (e) {
            throw handleError(e);
        }
    }
}

// rabbit.config.ts
import { getEnvVariable, getEnvVariableAsNumber } from '@/shared/utils/env.js';

export interface RabbitMqConfig {
    enabled: boolean;
    url: string;
    retryQueue?: string;
    retryTtlMs?: number;
    prefetch: number;
    publishTimeoutMs: number;
    connectionName: string;
}

export function loadRabbitMqConfig(serviceName: string): RabbitMqConfig {
    const url = getEnvVariable('RABBIT_URL');

    if (!url) {
        return {
            enabled: false,
            url: '',
            retryQueue: getEnvVariable('RABBIT_RETRY_QUEUE'),
            retryTtlMs: getEnvVariableAsNumber('RABBIT_RETRY_TTL_MS', 30000),
            prefetch: getEnvVariableAsNumber('RABBIT_PREFETCH', 1) ?? 1,
            publishTimeoutMs:
                getEnvVariableAsNumber('RABBIT_PUBLISH_TIMEOUT_MS', 5000) ??
                5000,
            connectionName: serviceName,
        };
    }

    return {
        enabled: true,
        url,
        retryQueue: getEnvVariable('RABBIT_RETRY_QUEUE'),
        retryTtlMs: getEnvVariableAsNumber('RABBIT_RETRY_TTL_MS', 30000),
        prefetch: getEnvVariableAsNumber('RABBIT_PREFETCH', 1) ?? 1,
        publishTimeoutMs:
            getEnvVariableAsNumber('RABBIT_PUBLISH_TIMEOUT_MS', 5000) ?? 5000,
        connectionName: serviceName,
    };
}

// rabbit.constants.ts
export const RABBITMQ_CONFIG = Symbol('RABBITMQ_CONFIG');

// rabbitmq-circuit-breaker.ts
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

// rabbitmq-monitor.service.ts
import {
    Injectable,
    Logger,
    OnModuleInit,
    OnModuleDestroy,
} from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { QUEUE_CONFIG } from './queue.constants.js';

interface QueueMetrics {
    name: string;
    messageCount: number;
    consumerCount: number;
    timestamp: Date;
}

interface AlertCondition {
    type: 'error' | 'warning' | 'info';
    message: string;
    threshold: number;
    current: number;
    queue?: string;
}

@Injectable()
export class RabbitMQMonitorService implements OnModuleInit, OnModuleDestroy {
    private readonly logger = new Logger(RabbitMQMonitorService.name);
    private monitoringInterval: NodeJS.Timeout | null = null;
    private lastMetrics: Map<string, QueueMetrics> = new Map();

    constructor(private readonly connection: AmqpConnection) {}

    async onModuleInit() {
        try {
            this.startMonitoring();
            this.logger.log('RabbitMQ monitoring started');
        } catch (error) {
            this.logger.error('Failed to start RabbitMQ monitoring', error);
        }
    }

    async onModuleDestroy() {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
        }
    }

    private startMonitoring() {
        // Monitor every 30 seconds
        this.monitoringInterval = setInterval(async () => {
            await this.checkQueueHealth();
        }, 30000);
    }

    private async checkQueueHealth(): Promise<void> {
        const criticalQueues = [
            QUEUE_CONFIG.REPO_QUEUE,
            QUEUE_CONFIG.IMPACT_QUEUE,
            QUEUE_CONFIG.DEAD_LETTER_QUEUE,
        ];

        const alerts: AlertCondition[] = [];

        for (const queueName of criticalQueues) {
            try {
                // Check if managedChannel is available
                if (!this.connection.managedChannel) {
                    alerts.push({
                        type: 'warning',
                        message: `Managed channel not yet available for queue ${queueName}`,
                        threshold: 0,
                        current: -1,
                        queue: queueName,
                    });
                    continue;
                }

                // Use managedChannel to access the underlying channel
                // This checks if queue exists without trying to create it
                const queueInfo =
                    await this.connection.managedChannel.checkQueue(queueName);
                const currentMetrics: QueueMetrics = {
                    name: queueName,
                    messageCount: queueInfo.messageCount,
                    consumerCount: queueInfo.consumerCount,
                    timestamp: new Date(),
                };

                // Store metrics for trending
                this.lastMetrics.set(queueName, currentMetrics);

                // Check for alert conditions
                alerts.push(...this.evaluateAlerts(currentMetrics));
            } catch (error: any) {
                // Queue doesn't exist or connection issue
                alerts.push({
                    type: 'error',
                    message: `Queue ${queueName} is not accessible: ${error.message}`,
                    threshold: 0,
                    current: -1,
                    queue: queueName,
                });
            }
        }

        // Process alerts
        this.processAlerts(alerts);
    }

    private evaluateAlerts(metrics: QueueMetrics): AlertCondition[] {
        const alerts: AlertCondition[] = [];

        // Alert: No consumers for critical queues
        if (
            metrics.consumerCount === 0 &&
            metrics.name !== QUEUE_CONFIG.DEAD_LETTER_QUEUE
        ) {
            alerts.push({
                type: 'warning',
                message: `Queue ${metrics.name} has no active consumers`,
                threshold: 1,
                current: metrics.consumerCount,
                queue: metrics.name,
            });
        }

        // Alert: High message backlog
        if (metrics.messageCount > 100) {
            alerts.push({
                type: 'warning',
                message: `Queue ${metrics.name} has high message backlog: ${metrics.messageCount} messages`,
                threshold: 100,
                current: metrics.messageCount,
                queue: metrics.name,
            });
        }

        // Alert: Critical DLQ growth
        if (
            metrics.name === QUEUE_CONFIG.DEAD_LETTER_QUEUE &&
            metrics.messageCount > 10
        ) {
            alerts.push({
                type: 'error',
                message: `Dead letter queue growing: ${metrics.messageCount} failed messages`,
                threshold: 10,
                current: metrics.messageCount,
                queue: metrics.name,
            });
        }

        return alerts;
    }

    private processAlerts(alerts: AlertCondition[]): void {
        for (const alert of alerts) {
            const logData = {
                type: alert.type,
                queue: alert.queue,
                threshold: alert.threshold,
                current: alert.current,
                timestamp: new Date().toISOString(),
            };

            switch (alert.type) {
                case 'error':
                    this.logger.error(alert.message, logData);
                    this.emitCriticalAlert(alert);
                    break;
                case 'warning':
                    this.logger.warn(alert.message, logData);
                    break;
                case 'info':
                    this.logger.log(alert.message, logData);
                    break;
            }
        }
    }

    private emitCriticalAlert(alert: AlertCondition): void {
        // Here you would integrate with your alerting system
        // Examples: PagerDuty, DataDog, Slack, etc.

        // For now, just log structured data that can be picked up by log aggregation
        console.error(
            JSON.stringify({
                alert: 'RABBITMQ_CRITICAL',
                severity: 'CRITICAL',
                message: alert.message,
                queue: alert.queue,
                threshold: alert.threshold,
                current: alert.current,
                timestamp: new Date().toISOString(),
                service: 'kodus-service-ast',
            }),
        );
    }

    /**
     * Detect RabbitMQ connection issues and queue declaration conflicts
     */
    async detectRabbitMQErrors(error: any): Promise<void> {
        if (!error || typeof error !== 'object') {
            return;
        }

        const errorMessage = error.message || '';
        const errorCode = error.code || '';

        // Detect 406 PRECONDITION_FAILED (queue conflicts)
        if (
            errorCode === 406 ||
            errorMessage.includes('406') ||
            errorMessage.includes('PRECONDITION_FAILED')
        ) {
            this.emitCriticalAlert({
                type: 'error',
                message: `RabbitMQ queue conflict detected: ${errorMessage}`,
                threshold: 0,
                current: 1,
            });
        }

        // Detect connection issues
        if (
            errorMessage.includes('ECONNREFUSED') ||
            errorMessage.includes('connection')
        ) {
            this.emitCriticalAlert({
                type: 'error',
                message: `RabbitMQ connection failure: ${errorMessage}`,
                threshold: 0,
                current: 1,
            });
        }
    }

    /**
     * Get current queue metrics for external monitoring
     */
    async getQueueMetrics(): Promise<QueueMetrics[]> {
        return Array.from(this.lastMetrics.values());
    }

    /**
     * Force immediate health check
     */
    async forceHealthCheck(): Promise<void> {
        await this.checkQueueHealth();
    }
}

// rabbitmq.health.ts
import { Injectable } from '@nestjs/common';
import {
    HealthCheckError,
    HealthIndicator,
    HealthIndicatorResult,
} from '@nestjs/terminus';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { QueueValidatorService } from './queue-validator.service.js';
import { QUEUE_CONFIG } from './queue.constants.js';

@Injectable()
export class RabbitMQHealthIndicator extends HealthIndicator {
    constructor(
        private readonly connection: AmqpConnection,
        private readonly queueValidator: QueueValidatorService,
    ) {
        super();
    }

    async checkHealth(): Promise<HealthIndicatorResult> {
        const isHealthy = await this.performHealthCheck();

        if (!isHealthy) {
            throw new HealthCheckError(
                'RabbitMQ health check failed',
                this.getStatus('rabbitmq', false),
            );
        }

        return this.getStatus('rabbitmq', true);
    }

    private async performHealthCheck(): Promise<boolean> {
        try {
            // Test basic connectivity - use managed channel
            const channel = this.connection.managedChannel;

            try {
                // Test channel operations
                await channel.checkQueue(QUEUE_CONFIG.DEAD_LETTER_QUEUE);

                // Test configuration validation
                const validation =
                    await this.queueValidator.validateConfigurationHealth();

                // Check if critical queues exist
                const repoQueue = await this.queueValidator.getQueueInfo(
                    QUEUE_CONFIG.REPO_QUEUE,
                );
                const impactQueue = await this.queueValidator.getQueueInfo(
                    QUEUE_CONFIG.IMPACT_QUEUE,
                );

                // Validate that we can publish a test message (if needed)
                // This is optional as it might affect production queues

                return validation.healthy && !!repoQueue && !!impactQueue;
            } finally {
                await channel.close();
            }
        } catch (error) {
            console.error('RabbitMQ health check failed:', error);
            return false;
        }
    }

    /**
     * Detailed health check with more information
     */
    async checkHealthDetailed(): Promise<HealthIndicatorResult> {
        try {
            const channel = this.connection.managedChannel;

            try {
                const validation =
                    await this.queueValidator.validateConfigurationHealth();

                // Get queue stats
                const repoQueue = await this.queueValidator.getQueueInfo(
                    QUEUE_CONFIG.REPO_QUEUE,
                );
                const impactQueue = await this.queueValidator.getQueueInfo(
                    QUEUE_CONFIG.IMPACT_QUEUE,
                );
                const dlq = await this.queueValidator.getQueueInfo(
                    QUEUE_CONFIG.DEAD_LETTER_QUEUE,
                );

                const details = {
                    connection: 'healthy',
                    queues: {
                        repo: {
                            exists: !!repoQueue,
                            messageCount: repoQueue?.messageCount || 0,
                            consumerCount: repoQueue?.consumerCount || 0,
                        },
                        impact: {
                            exists: !!impactQueue,
                            messageCount: impactQueue?.messageCount || 0,
                            consumerCount: impactQueue?.consumerCount || 0,
                        },
                        dlq: {
                            exists: !!dlq,
                            messageCount: dlq?.messageCount || 0,
                            consumerCount: dlq?.consumerCount || 0,
                        },
                    },
                    configuration: validation.details,
                    issues: validation.issues,
                };

                const isHealthy =
                    validation.healthy && !!repoQueue && !!impactQueue && !!dlq;

                return this.getStatus('rabbitmq', isHealthy, details);
            } finally {
                await channel.close();
            }
        } catch (error: any) {
            return this.getStatus('rabbitmq', false, {
                error: error.message,
                connection: 'unhealthy',
            });
        }
    }
}

// task-queue.consumer.ts

import { Injectable } from '@nestjs/common';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { TaskQueueProcessor } from '@/core/application/services/task/task-queue-processor.service.js';
import type { TaskQueueMessage } from './task-queue.definition.js';
import {
    QUEUE_CONFIG,
    buildTaskQueueOptions,
    getQueueRuntimeConfig,
} from './queue.constants.js';

// Build queue options once at module load time
const TASK_QUEUE_OPTIONS = buildTaskQueueOptions(getQueueRuntimeConfig());

@Injectable()
export class TaskQueueConsumer {
    constructor(private readonly processor: TaskQueueProcessor) {}

    @RabbitSubscribe({
        exchange: QUEUE_CONFIG.EXCHANGE,
        routingKey: QUEUE_CONFIG.REPO_ROUTING_KEY,
        queue: QUEUE_CONFIG.REPO_QUEUE,
        allowNonJsonMessages: false,
        queueOptions: TASK_QUEUE_OPTIONS,
    })
    async handleInitializeRepo(msg: TaskQueueMessage) {
        await this.processor.process(msg);
    }

    @RabbitSubscribe({
        exchange: QUEUE_CONFIG.EXCHANGE,
        routingKey: QUEUE_CONFIG.IMPACT_ROUTING_KEY,
        queue: QUEUE_CONFIG.IMPACT_QUEUE,
        allowNonJsonMessages: false,
        queueOptions: TASK_QUEUE_OPTIONS,
    })
    async handleInitializeImpact(msg: TaskQueueMessage) {
        await this.processor.process(msg);
    }

    // ── Para um novo tipo, adicione outro método: ──
    // @RabbitSubscribe({
    //   exchange: 'ast.jobs.x',
    //   routingKey: 'ast.novo.tipo',
    //   queue: 'ast.novo.tipo.q',
    //   allowNonJsonMessages: false,
    //   queueOptions: { channel: 'consumer' },
    // })
    // async handleNovoTipo(msg: TaskQueueMessage) {
    //   await this.processor.process(msg);
    // }
}

// task-queue.definition.ts
import type { Channel } from 'amqplib';
import type { RabbitMqConfig } from './rabbit.config.js';
import { QUEUE_CONFIG } from './queue.constants.js';

export interface QueueBinding {
    type: string;
    queue: string;
    routingKey: string;
}

export interface TaskQueueMessage<TPayload = unknown> {
    taskId: string;
    type: string;
    payload: TPayload;
    metadata?: Record<string, unknown>;
    priority?: number;
    retryCount?: number;
    createdAt: string;
}

export const TASK_QUEUE_BINDINGS: ReadonlyArray<QueueBinding> = [
    {
        type: 'AST_INITIALIZE_REPOSITORY',
        queue: QUEUE_CONFIG.REPO_QUEUE,
        routingKey: QUEUE_CONFIG.REPO_ROUTING_KEY,
    },
    {
        type: 'AST_INITIALIZE_IMPACT_ANALYSIS',
        queue: QUEUE_CONFIG.IMPACT_QUEUE,
        routingKey: QUEUE_CONFIG.IMPACT_ROUTING_KEY,
    },
];

const ROUTING_BY_TYPE = new Map(
    TASK_QUEUE_BINDINGS.map((binding) => [binding.type, binding.routingKey]),
);

export function resolveRoutingKey(type: string): {
    routingKey: string;
    isFallback: boolean;
} {
    const routingKey = ROUTING_BY_TYPE.get(type);

    if (!routingKey) {
        const fallback = `ast.custom.${type.toLowerCase()}`;
        return { routingKey: fallback, isFallback: true };
    }

    return { routingKey, isFallback: false };
}

export async function ensureTaskQueueTopology(
    channel: Channel,
    config: RabbitMqConfig,
): Promise<void> {
    await channel.assertExchange(QUEUE_CONFIG.EXCHANGE, 'topic', {
        durable: true,
    });

    await channel.assertExchange(QUEUE_CONFIG.DEAD_LETTER_EXCHANGE, 'topic', {
        durable: true,
    });

    await channel.assertQueue(QUEUE_CONFIG.DEAD_LETTER_QUEUE, {
        durable: true,
        arguments: {
            'x-queue-type': QUEUE_CONFIG.QUEUE_TYPE,
        },
    });

    await channel.bindQueue(
        QUEUE_CONFIG.DEAD_LETTER_QUEUE,
        QUEUE_CONFIG.DEAD_LETTER_EXCHANGE,
        '#',
    );

    for (const binding of TASK_QUEUE_BINDINGS) {
        await channel.assertQueue(binding.queue, {
            durable: true,
            arguments: {
                'x-queue-type': QUEUE_CONFIG.QUEUE_TYPE,
                'x-dead-letter-exchange': QUEUE_CONFIG.DEAD_LETTER_EXCHANGE,
                'x-delivery-limit': QUEUE_CONFIG.DELIVERY_LIMIT,
            },
        });

        await channel.bindQueue(
            binding.queue,
            QUEUE_CONFIG.EXCHANGE,
            binding.routingKey,
        );
    }

    if (config.retryQueue) {
        await channel.assertQueue(config.retryQueue, {
            durable: true,
            arguments: {
                'x-dead-letter-exchange': QUEUE_CONFIG.EXCHANGE,
                ...(config.retryTtlMs
                    ? { 'x-message-ttl': config.retryTtlMs }
                    : {}),
            },
        });
    }
}

// worker.module.ts
// Worker application module - minimal and focused
import { Module } from '@nestjs/common';
import { QueueModuleWorker } from '@/core/infrastructure/queue/queue.module.worker.js';
import { ASTModule } from './ast.module.js';

@Module({
    imports: [
        // Queue infrastructure
        QueueModuleWorker,

        // Complete AST processing for worker (commands + queue processing)
        ASTModule.forWorker(),
    ],
    exports: [],
})
export class WorkerModule {}

// worker-ast.module.ts
import { Module } from '@nestjs/common';
import { TaskPersistenceModule } from '@/core/infrastructure/persistence/task/task-persistence.module.js';
import { LogModule } from './log.module.js';
import { RepositoryModule } from './repository.module.js';
import { TaskModule } from './task.module.js';
import { TaskQueueProcessor } from '@/core/application/services/task/task-queue-processor.service.js';
import { TaskQueueConsumer } from '@/core/infrastructure/queue/task-queue.consumer.js';
import { workerCommands } from '@/core/application/use-cases/ast/index.js';

@Module({
    imports: [
        TaskPersistenceModule,
        LogModule,
        RepositoryModule, // Provides REPOSITORY_MANAGER_TOKEN needed by use cases
        TaskModule, // Provides TASK_MANAGER_TOKEN needed by TaskQueueProcessor
        // ASTModule.forWorker() - provides ParsingModule and other base dependencies
    ],
    providers: [
        ...workerCommands, // Only async commands for worker
        TaskQueueProcessor,
        TaskQueueConsumer,
    ],
    exports: [TaskQueueProcessor, TaskQueueConsumer, ...workerCommands],
})
export class WorkerAstModule {}

// app.module.ts
// API Application Module - complete functionality for HTTP endpoints
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../core/infrastructure/database/database.module.js';
import { QueueModuleApi } from '@/core/infrastructure/queue/queue.module.api.js';
import { LLMModule } from '@kodus/kodus-common/llm';
import { PinoLoggerService } from '../core/infrastructure/adapters/services/logger/pino.service.js';

// Feature modules
import { HealthModule } from './health.module.js';
import { LogModule } from './log.module.js';
import { TaskModule } from './task.module.js';
import { ASTModule } from './ast.module.js';

@Module({
    imports: [
        // Infrastructure
        DatabaseModule,
        LogModule,

        // Business features
        HealthModule,
        TaskModule,
        ASTModule.forApi(), // API context with all use cases

        // External integrations
        QueueModuleApi,
        LLMModule.forRoot({
            logger: PinoLoggerService,
            global: true,
        }),
    ],
    providers: [],
    exports: [],
})
export class AppModule {}

// ast.module.ts
import { AstHttpController } from '@/core/infrastructure/http/controllers/ast.controller.js';
import { Module, DynamicModule } from '@nestjs/common';
import { EnrichmentModule } from './enrichment.module.js';
import { RepositoryModule } from './repository.module.js';
import { DiffModule } from './diff.module.js';
import { ParsingModule } from './parsing.module.js';
import { TaskModule } from './task.module.js';
import { GraphAnalysisModule } from './graph-analysis.module.js';
import {
    apiCommands,
    queries,
} from '@/core/application/use-cases/ast/index.js';

@Module({})
export class ASTModule {
    /**
     * Dynamic module for API context - includes all commands and queries
     */
    static forApi(): DynamicModule {
        return {
            module: ASTModule,
            imports: [
                ParsingModule,
                EnrichmentModule,
                RepositoryModule,
                DiffModule,
                TaskModule,
                GraphAnalysisModule,
            ],
            providers: [
                ...apiCommands, // All command use cases
                ...queries, // All query use cases
            ],
            exports: [...apiCommands, ...queries],
            controllers: [AstHttpController],
        };
    }

    /**
     * Dynamic module for Worker context - only async commands
     */
    static forWorker(): DynamicModule {
        return {
            module: ASTModule,
            imports: [
                ParsingModule, // Provides CodeKnowledgeGraphService for use cases
                EnrichmentModule,
                RepositoryModule,
                GraphAnalysisModule,
                // Note: Worker doesn't need DiffModule, TaskModule, or controllers
            ],
            providers: [
                // Only async commands executed by worker
                // (InitializeRepositoryUseCase, InitializeImpactAnalysisUseCase)
                // These will be provided by WorkerAstModule
            ],
            exports: [],
        };
    }
}
