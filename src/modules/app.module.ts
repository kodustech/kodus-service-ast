import { Module } from '@nestjs/common';
import { AstModule } from './ast.module';
import { LogModule } from './log.module';

@Module({
    imports: [LogModule, AstModule],
    providers: [],
    exports: [],
})
export class AppModule {}
