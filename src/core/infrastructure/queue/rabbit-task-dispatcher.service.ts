import { Inject, Injectable } from '@nestjs/common';
import { AmqpConnection } from '@golevelup/nestjs-rabbitmq';
import { handleError } from '@/shared/utils/errors.js';
import {
    ITaskJobDispatcher,
    DispatchTaskPayload,
} from '@/core/application/services/task/task.service.js';
import { RABBITMQ_CONFIG } from './rabbit.constants.js';
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
            await this.amqp.publish(this.cfg.exchange, routingKey, message, {
                persistent: true,
                contentType: 'application/json',
                contentEncoding: 'utf-8',
                headers: {
                    'x-task-id': payload.taskId,
                    'x-task-type': payload.type,
                    'x-retry-count': 0,
                    ...payload.metadata,
                },
            });
        } catch (e) {
            throw handleError(e);
        }
    }
}
