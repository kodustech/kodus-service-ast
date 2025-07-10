import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import { GrpcInvalidArgumentException } from '@/shared/utils/grpc/exceptions';
import { RepositoryData } from '@kodus/kodus-proto/ast/v2';
import {
    DeleteRepositoryRequest,
    DeleteRepositoryResponse,
} from '@kodus/kodus-proto/ast';
import { Inject, Injectable } from '@nestjs/common';
import {
    IRepositoryManager,
    REPOSITORY_MANAGER_TOKEN,
} from '@/core/domain/repository/contracts/repository-manager.contract';

@Injectable()
export class DeleteRepositoryUseCase {
    constructor(
        @Inject(REPOSITORY_MANAGER_TOKEN)
        private readonly repositoryManagerService: IRepositoryManager,

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
                error,
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
