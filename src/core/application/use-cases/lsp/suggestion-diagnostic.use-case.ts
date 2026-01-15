import { TaskContext } from '@/core/domain/task/contracts/task-manager.contract.js';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service.js';
import { LSPManager } from '@/core/infrastructure/adapters/services/lsp/lsp-manager.js';
import { Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';

@Injectable()
export class SuggestionDiagnosticUseCase {
    constructor(
        private readonly logger: PinoLoggerService,
        private readonly LSPManager: LSPManager,
    ) {}

    async execute(
        payload: {
            repoPath: string;
            files: {
                filePath: string;
                encodedPatch: string;
            }[];
            language: string;
        },
        taskContext: TaskContext,
    ) {
        const { repoPath, files, language } = payload;

        await taskContext.update('Starting LSP client');

        const lsp = this.LSPManager.getClientForLanguage(language);

        await lsp.start(repoPath);

        const results: any[] = [];

        await taskContext.update('Analyzing suggestions');

        for (const { filePath, encodedPatch } of files) {
            const targetFilePath = path.join(repoPath, filePath);

            const originalContent = await fs.readFile(targetFilePath, 'utf-8');

            const patchedCode = Buffer.from(encodedPatch, 'base64').toString(
                'utf-8',
            );

            try {
                const diagnostics = await lsp.getDiagnosticsForChange(
                    filePath,
                    originalContent,
                    patchedCode,
                );

                results.push({
                    status: diagnostics.length === 0 ? 'clean' : 'error',
                    filePath,
                    diagnostics,
                });
            } catch (error) {
                this.logger.error({
                    message: 'LSP Check Failed',
                    context: SuggestionDiagnosticUseCase.name,
                    error,
                    metadata: {
                        repoPath,
                        filePath,
                        patchedCode,
                    },
                });
            }
        }

        await taskContext.update('Stopping LSP client');

        lsp.stop();

        await taskContext.complete('Finished LSP diagnosis', results);
    }
}
