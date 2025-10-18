import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service.js';
import { Global, Module } from '@nestjs/common';

@Global()
@Module({
    imports: [],
    providers: [PinoLoggerService],
    exports: [PinoLoggerService],
    controllers: [],
})
export class LogModule {}
