// src/core/infrastructure/queue/rmq-echo.consumer.ts
import { Injectable } from '@nestjs/common';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';

const EXCHANGE = process.env.RABBIT_EXCHANGE ?? 'ast.jobs.x';
const DLX = process.env.RABBIT_DLX ?? 'ast.jobs.dlx';

@Injectable()
export class RmqEchoConsumer {
    @RabbitSubscribe({
        exchange: EXCHANGE,
        routingKey: 'ast.test.echo',
        queue: 'ast.test.echo.q',
        queueOptions: {
            durable: true,
            arguments: {
                'x-queue-type': 'quorum',
                'x-dead-letter-exchange': DLX,
            },
        },
    })
    async handleEcho(msg: unknown) {
        console.log('[ECHO] received:', msg?.toString?.() ?? msg);
    }
}
