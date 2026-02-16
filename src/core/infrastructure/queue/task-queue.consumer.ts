import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { Inject, Injectable } from '@nestjs/common';
import { TaskQueueProcessor } from '../../application/services/task/task-queue-processor.service.js';
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
        routingKey: QUEUE_CONFIG.DIFF_ROUTING_KEY,
        queue: QUEUE_CONFIG.DIFF_QUEUE,
    })
    async handleInitializeDiff(msg: TaskQueueMessage) {
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
