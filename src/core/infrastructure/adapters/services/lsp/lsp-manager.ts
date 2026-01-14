import { SUPPORTED_LANGUAGES } from '@/core/domain/parsing/types/supported-languages.js';
import { Injectable } from '@nestjs/common';
import { PinoLoggerService } from '../logger/pino.service.js';
import { LspClient } from './lsp-client.js';

@Injectable()
export class LSPManager {
    constructor(private readonly logger: PinoLoggerService) {}

    getClientForLanguage(language: string): LspClient {
        switch (language) {
            case SUPPORTED_LANGUAGES.typescript.name:
            case SUPPORTED_LANGUAGES.javascript.name:
                return new LspClient(this.logger, 'npx', [
                    'typescript-language-server',
                    '--stdio',
                ]);
            default:
                this.logger.error({
                    message: 'Language not supported for LSP analysis',
                    context: LSPManager.name,
                    metadata: {
                        language,
                    },
                });

                throw new Error('Language not supported');
        }
    }
}
