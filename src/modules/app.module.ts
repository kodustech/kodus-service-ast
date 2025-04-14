import { Module } from '@nestjs/common';
import { AstModule } from './ast.module';
import { LogModule } from './log.module';
import { RepositoryModule } from './repository.module';

@Module({
    imports: [LogModule, AstModule, RepositoryModule],
    providers: [],
    exports: [],
})
export class AppModule {}
