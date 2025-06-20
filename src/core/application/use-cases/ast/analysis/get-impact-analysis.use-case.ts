import { ChangeResult } from '@/core/domain/diff/types/diff-analyzer.types';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import { RepositoryManagerService } from '@/core/infrastructure/adapters/services/repository/repository-manager.service';
import {
    GrpcInvalidArgumentException,
    GrpcNotFoundException,
} from '@/shared/utils/grpc/exceptions';
import {
    GetImpactAnalysisRequest,
    GetImpactAnalysisResponse,
} from '@kodus/kodus-proto/v3';
import { Injectable } from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class GetImpactAnalysisUseCase {
    constructor(
        private readonly repositoryManagerService: RepositoryManagerService,

        private readonly logger: PinoLoggerService,
    ) {}

    async execute(
        request: GetImpactAnalysisRequest,
    ): Promise<GetImpactAnalysisResponse[]> {
        try {
            const { headRepo, baseRepo } = request;

            if (!headRepo || !baseRepo) {
                this.logger.error({
                    message: 'Both headRepo and baseRepo must be provided',
                    context: GetImpactAnalysisUseCase.name,
                    metadata: { request },
                });

                throw new GrpcInvalidArgumentException(
                    'Both headRepo and baseRepo must be provided',
                );
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

                throw new GrpcNotFoundException(
                    `No impact analysis found for repository ${headRepo.repositoryName}`,
                );
            }

            const parsedAnalysis = JSON.parse(
                impactAnalysis.toString('utf-8'),
            ) as {
                analysisResult: ChangeResult;
                impactAnalysis: GetImpactAnalysisResponse[];
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

                    for (const item of response) {
                        subscriber.next(item);
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
