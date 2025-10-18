import { Global, Module } from '@nestjs/common';
import { RABBITMQ_CONFIG } from './rabbit.constants.js';
import { loadRabbitMqConfig } from './rabbit.config.js';

@Global()
@Module({
    providers: [
        {
            provide: RABBITMQ_CONFIG,
            useFactory: () => {
                return loadRabbitMqConfig();
            },
        },
    ],
    exports: [RABBITMQ_CONFIG],
})
export class QueueConfigModule {}
