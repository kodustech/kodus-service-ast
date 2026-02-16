import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { Inject, Injectable } from '@nestjs/common';
import { TaskQueueProcessor } from '../../application/services/task/task-queue-processor.service.js';
import {
    QUEUE_CONFIG,
    buildTaskQueueOptions,
    getQueueRuntimeConfig,
} from './queue.constants.js';
import type { TaskQueueMessage } from './task-queue.definition.js';

const runtime = getQueueRuntimeConfig();
const taskQueueOpts = buildTaskQueueOptions({
    enableSingleActiveConsumer: runtime.enableSingleActiveConsumer,
});

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
        queueOptions: taskQueueOpts,
    })
    async handleInitializeDiff(msg: TaskQueueMessage) {
        await this.processor.process(msg);
    }

    @RabbitSubscribe({
        exchange: QUEUE_CONFIG.EXCHANGE,
        routingKey: QUEUE_CONFIG.VALIDATE_CODE_ROUTING_KEY,
        queue: QUEUE_CONFIG.VALIDATE_CODE_QUEUE,
        queueOptions: taskQueueOpts,
    })
    async handleValidateCode(msg: TaskQueueMessage) {
        await this.processor.process(msg);
    }
}
