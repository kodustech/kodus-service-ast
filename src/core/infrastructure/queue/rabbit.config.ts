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
