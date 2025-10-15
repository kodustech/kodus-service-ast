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
