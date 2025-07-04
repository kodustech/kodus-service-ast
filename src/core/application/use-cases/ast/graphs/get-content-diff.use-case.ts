import { DiffAnalyzerService } from '@/core/infrastructure/adapters/services/diff/diff-analyzer.service';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import { GetContentFromDiffRequest } from '@kodus/kodus-proto/ast';
import { GetGraphsUseCase } from './get-graphs.use-case';
import { Injectable } from '@nestjs/common';
import { GrpcNotFoundException } from '@/shared/utils/grpc/exceptions';
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

                throw new GrpcNotFoundException(
                    'No graphs found for the provided repository',
                );
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
