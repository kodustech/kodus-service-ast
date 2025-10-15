import { getEnvVariable, getEnvVariableAsNumber } from '@/shared/utils/env.js';
import { QUEUE_CONFIG } from './queue.constants.js';

export interface RabbitMqConfig {
    enabled: boolean;
    url: string;
    exchange: string;
    deadLetterExchange: string;
    deadLetterQueue: string;
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
            exchange: QUEUE_CONFIG.EXCHANGE,
            deadLetterExchange: QUEUE_CONFIG.DEAD_LETTER_EXCHANGE,
            deadLetterQueue: QUEUE_CONFIG.DEAD_LETTER_QUEUE,
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
        exchange: getEnvVariable('RABBIT_EXCHANGE', QUEUE_CONFIG.EXCHANGE)!,
        deadLetterExchange: getEnvVariable(
            'RABBIT_DLX',
            QUEUE_CONFIG.DEAD_LETTER_EXCHANGE,
        )!,
        deadLetterQueue: getEnvVariable(
            'RABBIT_DLQ',
            QUEUE_CONFIG.DEAD_LETTER_QUEUE,
        )!,
        retryQueue: getEnvVariable('RABBIT_RETRY_QUEUE'),
        retryTtlMs: getEnvVariableAsNumber('RABBIT_RETRY_TTL_MS', 30000),
        prefetch: getEnvVariableAsNumber('RABBIT_PREFETCH', 1) ?? 1,
        publishTimeoutMs:
            getEnvVariableAsNumber('RABBIT_PUBLISH_TIMEOUT_MS', 5000) ?? 5000,
        connectionName: serviceName,
    };
}
