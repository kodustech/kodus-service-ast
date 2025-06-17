import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import { RepositoryManagerService } from '@/core/infrastructure/adapters/services/repository/repository-manager.service';
import { handleError } from '@/shared/utils/errors';
import { GrpcInvalidArgumentException } from '@/shared/utils/grpc/exceptions';
import {
    DeleteRepositoryRequest,
    DeleteRepositoryResponse,
    RepositoryData,
} from '@kodus/kodus-proto/v2';
import { Injectable } from '@nestjs/common';

@Injectable()
export class DeleteRepositoryUseCase {
    constructor(
        private readonly repositoryManagerService: RepositoryManagerService,

        private readonly logger: PinoLoggerService,
    ) {}

    async execute(
        request: DeleteRepositoryRequest,
    ): Promise<DeleteRepositoryResponse> {
        const { baseRepo, headRepo } = request;

        if (!baseRepo || !headRepo) {
            throw new GrpcInvalidArgumentException(
                'Both baseRepo and headRepo must be provided',
            );
        }

        try {
            await this.deleteRepo(baseRepo);
            await this.deleteRepo(headRepo);

            return {};
        } catch (error) {
            this.logger.error({
                message: 'Failed to delete repository',
                context: DeleteRepositoryUseCase.name,
                error: handleError(error),
                metadata: {
                    request,
                },
                serviceName: DeleteRepositoryUseCase.name,
            });
            throw error;
        }
    }

    private async deleteRepo(repoData: RepositoryData): Promise<void> {
        await this.repositoryManagerService.deleteLocalRepository({
            repoData,
            keepKodusData: true,
        });

        this.logger.log({
            message: `Deleted repository ${repoData.repositoryName}`,
            context: DeleteRepositoryUseCase.name,
            metadata: {
                request: JSON.stringify(repoData),
            },
            serviceName: DeleteRepositoryUseCase.name,
        });
    }
}
