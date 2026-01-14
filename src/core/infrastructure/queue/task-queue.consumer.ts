import { TaskQueueProcessor } from '@/core/application/services/task/task-queue-processor.service.js';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { Inject, Injectable } from '@nestjs/common';
import { QUEUE_CONFIG } from './queue.constants.js';
import type { TaskQueueMessage } from './task-queue.definition.js';

@Injectable()
export class TaskQueueConsumer {
    constructor(
        @Inject(TaskQueueProcessor)
        private readonly processor: TaskQueueProcessor,
    ) {}

    @RabbitSubscribe({
        exchange: QUEUE_CONFIG.EXCHANGE,
        routingKey: QUEUE_CONFIG.REPO_ROUTING_KEY,
        queue: QUEUE_CONFIG.REPO_QUEUE,
    })
    async handleInitializeRepo(msg: TaskQueueMessage) {
        await this.processor.process(msg);
    }

    @RabbitSubscribe({
        exchange: QUEUE_CONFIG.EXCHANGE,
        routingKey: QUEUE_CONFIG.IMPACT_ROUTING_KEY,
        queue: QUEUE_CONFIG.IMPACT_QUEUE,
    })
    async handleInitializeImpact(msg: TaskQueueMessage) {
        await this.processor.process(msg);
    }

    @RabbitSubscribe({
        exchange: QUEUE_CONFIG.EXCHANGE,
        routingKey: QUEUE_CONFIG.VALIDATE_CODE_ROUTING_KEY,
        queue: QUEUE_CONFIG.VALIDATE_CODE_QUEUE,
    })
    async handleValidateCode(msg: TaskQueueMessage) {
        await this.processor.process(msg);
    }
}
