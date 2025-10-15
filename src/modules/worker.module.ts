// Worker application module - minimal and focused
import { Module } from '@nestjs/common';
import { QueueModuleWorker } from '@/core/infrastructure/queue/queue.module.worker.js';
import { ASTModule } from './ast.module.js';

@Module({
    imports: [
        // Queue infrastructure
        QueueModuleWorker,

        // Complete AST processing for worker (commands + queue processing)
        ASTModule.forWorker(),
    ],
    exports: [],
})
export class WorkerModule {}
