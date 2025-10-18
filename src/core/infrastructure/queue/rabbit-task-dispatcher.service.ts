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
                    persistent: true, // grava em disco
                    contentType: 'application/json',
                    contentEncoding: 'utf-8',
                    messageId: payload.taskId,
                    timestamp: Date.now(),
                    correlationId: payload.taskId,
                    appId: this.cfg.connectionName,
                    // mandatory: true // opcional: combine com returns para detectar rota inválida
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
