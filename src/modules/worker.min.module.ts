// src/modules/worker.min.module.ts
import { Module } from '@nestjs/common';
import { QueueModuleWorker } from '@/core/infrastructure/queue/queue.module.worker.js';
import { RmqEchoConsumer } from '@/core/infrastructure/queue/rmq.echo.consumer.js';

@Module({
    imports: [QueueModuleWorker], // só RMQ
    providers: [RmqEchoConsumer], // só o handler simples
})
export class WorkerMinModule {}
