// Worker application module - minimal and focused
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service.js';
import { QueueModuleWorker } from '@/core/infrastructure/queue/queue.module.worker.js';
import { LLMModule } from '@kodus/kodus-common/llm';
import { Module } from '@nestjs/common';
import { ASTModule } from './ast.module.js';
import { LogModule } from './log.module.js';
import { LspModule } from './lsp.module.js';
import { WorkerAstModule } from './worker-ast.module.js';

@Module({
    imports: [
        LLMModule.forRoot({
            logger: PinoLoggerService,
            global: true,
        }),
        LogModule,
        QueueModuleWorker,
        ASTModule.forWorker(),
        LspModule.forWorker(),
        WorkerAstModule,
    ],
    exports: [],
})
export class WorkerModule {}
