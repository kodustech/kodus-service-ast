import { Module } from '@nestjs/common';
import { AstModule } from './ast.module';
import { LogModule } from './log.module';
import { RepositoryModule } from './repository.module';
import { HealthModule } from './health.module';

@Module({
    imports: [LogModule, AstModule, RepositoryModule, HealthModule],
    providers: [],
    exports: [],
})
export class AppModule {}
