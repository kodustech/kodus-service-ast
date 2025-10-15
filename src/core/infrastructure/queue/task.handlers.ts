// queue/task.handlers.ts
import { Injectable, Inject } from '@nestjs/common';
import { RabbitSubscribe, Nack } from '@golevelup/nestjs-rabbitmq';
import { TaskQueueProcessor } from '@/core/application/services/task/task-queue-processor.service.js';
import { RABBITMQ_CONFIG } from './rabbit.constants.js';
import { type RabbitMqConfig } from './rabbit.config.js';
import { type TaskQueueMessage } from './task-queue.definition.js';

const DELIVERY_LIMIT = 5; // mantém seu valor atual

@Injectable()
export class TaskQueueHandlers {
    constructor(
        private readonly processor: TaskQueueProcessor,
        @Inject(RABBITMQ_CONFIG) private readonly cfg: RabbitMqConfig,
    ) {}

    @RabbitSubscribe({
        exchange: (ctx) => ctx.cfg.exchange,
        routingKey: 'ast.initialize.repo',
        queue: 'ast.initialize.repo.q',
        createQueueIfNotExists: true,
        queueOptions: {
            durable: true,
            channel: 'consumer',
            // argumentos da fila (quorum + sac + dlx + delivery limit)
            arguments: {
                'x-queue-type': 'quorum',
                'x-single-active-consumer': true,
                'x-dead-letter-exchange': (ctx) => ctx.cfg.deadLetterExchange,
                'x-delivery-limit': DELIVERY_LIMIT,
            },
            // prioridade do consumidor (x-priority) — este worker “ganha” disputa
            consumerOptions: {
                noAck: false,
                arguments: { 'x-priority': 10 }, // prioridade do consumidor  [oai_citation:11‡RabbitMQ](https://www.rabbitmq.com/docs/consumer-priority?utm_source=chatgpt.com)
            },
        },
    } as any)
    public async handleInitializeRepo(msg: TaskQueueMessage) {
        try {
            await this.processor.process(msg);
            // ACK automático quando não há erro (comportamento padrão da lib).  [oai_citation:12‡Go Level Up](https://golevelup.github.io/nestjs/modules/rabbitmq.html)
        } catch (e) {
            // Transiente? peça requeue (conta para o delivery-limit). Fatal? DLX imediato.
            const isTransient = this.isTransient(e);
            return new Nack(isTransient);
        }
    }

    @RabbitSubscribe({
        exchange: (ctx) => ctx.cfg.exchange,
        routingKey: 'ast.initialize.impact',
        queue: 'ast.initialize.impact.q',
        createQueueIfNotExists: true,
        queueOptions: {
            durable: true,
            channel: 'consumer',
            arguments: {
                'x-queue-type': 'quorum',
                'x-single-active-consumer': true,
                'x-dead-letter-exchange': (ctx) => ctx.cfg.deadLetterExchange,
                'x-delivery-limit': DELIVERY_LIMIT,
            },
            consumerOptions: {
                noAck: false,
                arguments: { 'x-priority': 10 },
            },
        },
    } as any)
    public async handleInitializeImpact(msg: TaskQueueMessage) {
        try {
            await this.processor.process(msg);
        } catch (e) {
            const isTransient = this.isTransient(e);
            return new Nack(isTransient);
        }
    }

    private isTransient(err: unknown): boolean {
        // heurística simples; adapte para suas exceptions
        const m = (err as any)?.message ?? '';
        return /timeout|rate|network|lock/i.test(m);
    }
}
