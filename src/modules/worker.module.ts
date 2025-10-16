// Worker application module - minimal and focused
import { Module } from '@nestjs/common';
import { QueueModuleWorker } from '@/core/infrastructure/queue/queue.module.worker.js';
import { WorkerAstModule } from './worker-ast.module.js';
import { ASTModule } from './ast.module.js';
import { LogModule } from './log.module.js';

@Module({
    imports: [
        LogModule,
        QueueModuleWorker,
        ASTModule.forWorker(),
        WorkerAstModule,
    ],
    exports: [],
})
export class WorkerModule {}
