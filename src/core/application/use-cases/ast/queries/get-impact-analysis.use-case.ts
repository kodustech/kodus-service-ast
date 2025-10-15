import { ChangeResult } from '@/core/domain/diff/types/diff-analyzer.types.js';
import {
    type IRepositoryManager,
    REPOSITORY_MANAGER_TOKEN,
} from '@/core/domain/repository/contracts/repository-manager.contract.js';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service.js';
import {
    GetImpactAnalysisRequest,
    GetImpactAnalysisResponse,
} from '@/shared/types/ast.js';
import { Inject, Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class GetImpactAnalysisUseCase {
    constructor(
        @Inject(REPOSITORY_MANAGER_TOKEN)
        private readonly repositoryManagerService: IRepositoryManager,

        private readonly logger: PinoLoggerService,
    ) {}

    async execute(
        request: GetImpactAnalysisRequest,
    ): Promise<GetImpactAnalysisResponse> {
        try {
            const { headRepo, baseRepo } = request;

            if (!headRepo || !baseRepo) {
                this.logger.error({
                    message: 'Both headRepo and baseRepo must be provided',
                    context: GetImpactAnalysisUseCase.name,
                    metadata: { request },
                });

                throw new Error('Both headRepo and baseRepo must be provided');
            }

            const fileName = `impact-analysis`;
            const impactAnalysis = await this.repositoryManagerService.readFile(
                {
                    repoData: headRepo,
                    filePath: fileName,
                    inKodusDir: true,
                },
            );

            if (!impactAnalysis) {
                this.logger.error({
                    message: `No impact analysis found for repository ${headRepo.repositoryName}`,
                    context: GetImpactAnalysisUseCase.name,
                    metadata: { request: JSON.stringify(headRepo) },
                    serviceName: GetImpactAnalysisUseCase.name,
                });

                throw new Error(
                    `No impact analysis found for repository ${headRepo.repositoryName}`,
                );
            }

            const parsedAnalysis = JSON.parse(impactAnalysis) as {
                analysisResult: ChangeResult;
                impactAnalysis: GetImpactAnalysisResponse;
            };

            this.logger.log({
                message: `Retrieved impact analysis for repository ${headRepo.repositoryName}`,
                context: GetImpactAnalysisUseCase.name,
                metadata: { request: JSON.stringify(headRepo) },
                serviceName: GetImpactAnalysisUseCase.name,
            });

            return parsedAnalysis.impactAnalysis;
        } catch (error) {
            this.logger.error({
                context: GetImpactAnalysisUseCase.name,
                message: 'Failed to get impact analysis',
                error,
                metadata: { request },
                serviceName: GetImpactAnalysisUseCase.name,
            });

            throw error;
        }
    }

    observe(
        request: GetImpactAnalysisRequest,
    ): Observable<GetImpactAnalysisResponse> {
        return new Observable((subscriber) => {
            void (async () => {
                try {
                    const response = await this.execute(request);

                    const BATCH_SIZE = 10;

                    const affectResults = response.functionsAffect;
                    const similarityResults = response.functionSimilarity;

                    for (let i = 0; i < affectResults.length; i += BATCH_SIZE) {
                        const batch = affectResults.slice(i, i + BATCH_SIZE);
                        subscriber.next({
                            functionsAffect: batch,
                            functionSimilarity: [],
                        });
                    }

                    for (
                        let i = 0;
                        i < similarityResults.length;
                        i += BATCH_SIZE
                    ) {
                        const batch = similarityResults.slice(
                            i,
                            i + BATCH_SIZE,
                        );
                        subscriber.next({
                            functionsAffect: [],
                            functionSimilarity: batch,
                        });
                    }

                    subscriber.complete();
                } catch (error) {
                    this.logger.error({
                        context: GetImpactAnalysisUseCase.name,
                        message: 'Failed to observe impact analysis',
                        error,
                        metadata: { request },
                        serviceName: GetImpactAnalysisUseCase.name,
                    });

                    subscriber.error(error);
                }
            })();
        });
    }
}
