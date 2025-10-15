import { Injectable } from '@nestjs/common';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';
import { TaskQueueProcessor } from '@/core/application/services/task/task-queue-processor.service.js';
import type { TaskQueueMessage } from './task-queue.definition.js';

@Injectable()
export class TaskQueueConsumer {
    constructor(private readonly processor: TaskQueueProcessor) {}

    @RabbitSubscribe({
        exchange: 'ast.jobs.x',
        routingKey: 'ast.initialize.repo',
        queue: 'ast.initialize.repo.q',
        allowNonJsonMessages: false,
        queueOptions: { channel: 'consumer' },
    })
    async handleInitializeRepo(msg: TaskQueueMessage) {
        await this.processor.process(msg);
    }

    @RabbitSubscribe({
        exchange: 'ast.jobs.x',
        routingKey: 'ast.initialize.impact',
        queue: 'ast.initialize.impact.q',
        allowNonJsonMessages: false,
        queueOptions: { channel: 'consumer' },
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
