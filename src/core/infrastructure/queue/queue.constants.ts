import { getEnvVariable } from '@/shared/utils/env.js';

// Queue configuration versioning
export const QUEUE_CONFIG_VERSION = 'v2.0.0';

// Queue configuration constants and types
export const QUEUE_CONFIG = {
    // Delivery limits
    DELIVERY_LIMIT: 3,

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
        retryTtlMs: Number(getEnvVariable('RABBIT_RETRY_TTL_MS') ?? '60000'),
        prefetch: Number(getEnvVariable('RABBIT_PREFETCH') ?? '2'),
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
