import { DiffAnalyzerService } from '@/core/infrastructure/adapters/services/diff/diff-analyzer.service.js';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service.js';
import { GetContentFromDiffRequest } from '@/shared/types/ast.js';
import { GetGraphsUseCase } from './get-graphs.use-case.js';
import { Injectable } from '@nestjs/common';
import * as path from 'path';

@Injectable()
export class GetContentFromDiffUseCase {
    constructor(
        private readonly getGraphsUseCase: GetGraphsUseCase,
        private readonly differService: DiffAnalyzerService,

        private readonly logger: PinoLoggerService,
    ) {}

    async execute(request: GetContentFromDiffRequest): Promise<string> {
        try {
            const { diff, filePath, ...repoData } = request;

            const graphs = await this.getGraphsUseCase.execute(repoData, false);

            if (!graphs) {
                this.logger.error({
                    message: `No graphs found for repository ${repoData.headRepo.repositoryName}`,
                    context: GetContentFromDiffUseCase.name,
                    metadata: {
                        request: JSON.stringify(repoData),
                    },
                    serviceName: GetContentFromDiffUseCase.name,
                });

                throw new Error('No graphs found for the provided repository');
            }

            let absoluteFilePath = filePath;
            if (!path.isAbsolute(filePath)) {
                absoluteFilePath = path.join(graphs.headGraph.dir, filePath);
            }

            return this.differService.getRelevantContent(
                absoluteFilePath,
                diff,
                graphs,
                repoData.headRepo,
            );
        } catch (error) {
            this.logger.error({
                context: GetContentFromDiffUseCase.name,
                message: `Failed to get content from diff`,
                error,
                metadata: {
                    request,
                },
                serviceName: GetContentFromDiffUseCase.name,
            });

            throw error;
        }
    }
}
