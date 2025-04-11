import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import { Global, Module } from '@nestjs/common';

@Global()
@Module({
    providers: [PinoLoggerService],
    exports: [PinoLoggerService],
})
export class LogModule {}
