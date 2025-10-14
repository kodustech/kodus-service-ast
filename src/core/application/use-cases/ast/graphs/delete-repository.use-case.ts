import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service.js';
import {
    DeleteRepositoryRequest,
    DeleteRepositoryResponse,
    RepositoryData,
} from '@/shared/types/ast.js';
import { Inject, Injectable } from '@nestjs/common';
import {
    IRepositoryManager,
    REPOSITORY_MANAGER_TOKEN,
} from '@/core/domain/repository/contracts/repository-manager.contract.js';

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
            throw new Error('Both baseRepo and headRepo must be provided');
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
