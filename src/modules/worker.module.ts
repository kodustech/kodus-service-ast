// Worker application module - minimal and focused
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service.js';
import { QueueModuleWorker } from '@/core/infrastructure/queue/queue.module.worker.js';
import { LLMModule } from '@kodus/kodus-common/llm';
import { Module } from '@nestjs/common';
import { LogModule } from './log.module.js';
import { WorkerAstModule } from './worker-ast.module.js';

@Module({
    imports: [
        LLMModule.forRoot({
            logger: PinoLoggerService,
            global: true,
        }),
        LogModule,
        QueueModuleWorker,
        WorkerAstModule,
    ],
    exports: [],
})
export class WorkerModule {}
