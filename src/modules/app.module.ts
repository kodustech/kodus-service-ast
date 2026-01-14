// API Application Module - complete functionality for HTTP endpoints
import { QueueModuleApi } from '@/core/infrastructure/queue/queue.module.api.js';
import { LLMModule } from '@kodus/kodus-common/llm';
import { Module } from '@nestjs/common';
import { PinoLoggerService } from '../core/infrastructure/adapters/services/logger/pino.service.js';
import { DatabaseModule } from '../core/infrastructure/database/database.module.js';
import { GlobalExceptionFilter } from '../core/infrastructure/http/filters/global-exception.filter.js';
import { RequestLoggerInterceptor } from '../core/infrastructure/http/interceptors/request-logger.interceptor.js';

// Feature modules
import { ASTModule } from './ast.module.js';
import { HealthModule } from './health.module.js';
import { LogModule } from './log.module.js';
import { LspModule } from './lsp.module.js';
import { TaskModule } from './task.module.js';

@Module({
    imports: [
        // Infrastructure
        DatabaseModule,
        LogModule,

        // Business features
        HealthModule,
        TaskModule,
        ASTModule.forApi(), // API context with all use cases
        LspModule.forApi(),

        // External integrations
        QueueModuleApi,
        LLMModule.forRoot({
            logger: PinoLoggerService,
            global: true,
        }),
    ],
    providers: [GlobalExceptionFilter, RequestLoggerInterceptor],
    exports: [GlobalExceptionFilter, RequestLoggerInterceptor],
})
export class AppModule {}
