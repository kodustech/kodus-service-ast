import { Inject, Injectable } from '@nestjs/common';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { TaskQueueProcessor } from '@/core/application/services/task/task-queue-processor.service.js';
import type { TaskQueueMessage } from './task-queue.definition.js';
import { QUEUE_CONFIG } from './queue.constants.js';

@Injectable()
export class TaskQueueConsumer {
    constructor(
        @Inject(TaskQueueProcessor)
        private readonly processor: TaskQueueProcessor,
    ) {
        console.log('[DI] TaskQueueConsumer.processor?', !!this.processor);
    }

    @RabbitSubscribe({
        exchange: QUEUE_CONFIG.EXCHANGE,
        routingKey: QUEUE_CONFIG.REPO_ROUTING_KEY,
        queue: QUEUE_CONFIG.REPO_QUEUE,
        createQueueIfNotExists: false, // não assertar; definitions já criou
        allowNonJsonMessages: false,
        queueOptions: {
            durable: true,
            channel: 'consumer', // usa o canal que você nomeou no forRootAsync
        },
    })
    async handleInitializeRepo(msg: TaskQueueMessage) {
        await this.processor.process(msg);
    }

    @RabbitSubscribe({
        exchange: QUEUE_CONFIG.EXCHANGE,
        routingKey: QUEUE_CONFIG.IMPACT_ROUTING_KEY,
        queue: QUEUE_CONFIG.IMPACT_QUEUE,
        createQueueIfNotExists: false,
        allowNonJsonMessages: false,
        queueOptions: {
            channel: 'consumer',
            durable: true,
        },
    })
    async handleInitializeImpact(msg: TaskQueueMessage) {
        await this.processor.process(msg);
    }
}
