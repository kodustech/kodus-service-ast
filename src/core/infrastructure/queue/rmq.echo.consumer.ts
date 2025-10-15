// src/core/infrastructure/queue/rmq.echo.consumer.ts
import { Injectable } from '@nestjs/common';
import { RabbitSubscribe } from '@golevelup/nestjs-rabbitmq';

@Injectable()
export class RmqEchoConsumer {
    @RabbitSubscribe({
        exchange: 'ast.jobs.x',
        routingKey: 'ast.test.echo',
        queue: 'ast.test.echo.q',
        allowNonJsonMessages: true,
        queueOptions: { channel: 'consumer' },
    })
    async handleEcho(msg: any) {
        console.log('[ECHO] received:', msg?.toString?.() ?? msg);
    }
}
