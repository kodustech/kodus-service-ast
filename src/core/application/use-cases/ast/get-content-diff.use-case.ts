import { DifferService } from '@/core/infrastructure/adapters/services/ast/differ.service';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import { GetContentFromDiffRequest } from '@kodus/kodus-proto/v2';
import { GetGraphsUseCase } from './get-graphs.use-case';
import { handleError } from '@/shared/utils/errors';
import { RepositoryManagerService } from '@/core/infrastructure/adapters/services/repository/repository-manager.service';
import { Injectable } from '@nestjs/common';

@Injectable()
export class GetContentFromDiffUseCase {
    constructor(
        private readonly getGraphsUseCase: GetGraphsUseCase,
        private readonly differService: DifferService,
        private readonly repositoryManagerService: RepositoryManagerService,
        private readonly logger: PinoLoggerService,
    ) {}

    async execute(request: GetContentFromDiffRequest): Promise<string> {
        try {
            const { diff, filePath, ...repoData } = request;

            const graphs = await this.getGraphsUseCase.execute(repoData, false);

            if (!graphs) {
                this.logger.warn({
                    message: `No graphs found for repository ${repoData.headRepo.repositoryName}`,
                    context: GetContentFromDiffUseCase.name,
                    metadata: {
                        request: JSON.stringify(repoData),
                    },
                    serviceName: GetContentFromDiffUseCase.name,
                });
                return null;
            }

            const fileContent = await this.repositoryManagerService.readFile({
                repoData: repoData.headRepo,
                filePath,
            });

            return this.differService.getRelevantContent(
                filePath,
                diff,
                fileContent.toString('utf-8'),
                graphs,
            );
        } catch (error) {
            this.logger.error({
                context: GetContentFromDiffUseCase.name,
                message: `Failed to get content from diff`,
                error: handleError(error),
                metadata: {
                    request,
                },
                serviceName: GetContentFromDiffUseCase.name,
            });
            return null;
        }
    }
}
