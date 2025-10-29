// API Application Module - complete functionality for HTTP endpoints
import { Module } from '@nestjs/common';
import { DatabaseModule } from '../core/infrastructure/database/database.module.js';
import { QueueModuleApi } from '@/core/infrastructure/queue/queue.module.api.js';
import { LLMModule } from '@kodus/kodus-common/llm';
import { PinoLoggerService } from '../core/infrastructure/adapters/services/logger/pino.service.js';
import { GlobalExceptionFilter } from '../core/infrastructure/http/filters/global-exception.filter.js';
import { RequestLoggerInterceptor } from '../core/infrastructure/http/interceptors/request-logger.interceptor.js';

// Feature modules
import { HealthModule } from './health.module.js';
import { LogModule } from './log.module.js';
import { TaskModule } from './task.module.js';
import { ASTModule } from './ast.module.js';

@Module({
    imports: [
        // Infrastructure
        DatabaseModule,
        LogModule,

        // Business features
        HealthModule,
        TaskModule,
        ASTModule.forApi(), // API context with all use cases

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
