import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service.js';
import { TaskResultStorageService } from '@/core/infrastructure/adapters/services/storage/task-result-storage.service.js';

import { Inject, Injectable } from '@nestjs/common';
import {
    GetGraphsRequest,
    GetGraphsResponseData,
    SerializedGetGraphsResponseData,
} from '@/shared/types/ast.js';
import { astDeserializer } from '@/shared/utils/ast-serialization.js';
import {
    type IRepositoryManager,
    REPOSITORY_MANAGER_TOKEN,
} from '@/core/domain/repository/contracts/repository-manager.contract.js';

@Injectable()
export class GetGraphsUseCase {
    constructor(
        @Inject(REPOSITORY_MANAGER_TOKEN)
        private readonly repositoryManagerService: IRepositoryManager,
        @Inject(TaskResultStorageService)
        private readonly taskResultStorageService: TaskResultStorageService,
        @Inject(PinoLoggerService)
        private readonly logger: PinoLoggerService,
    ) {}

    async execute(
        request: GetGraphsRequest,
        serialized: false,
    ): Promise<GetGraphsResponseData | null>;

    async execute(
        request: GetGraphsRequest,
        serialized: true,
    ): Promise<SerializedGetGraphsResponseData | null>;

    async execute(
        request: GetGraphsRequest,
        serialized: boolean,
    ): Promise<GetGraphsResponseData | SerializedGetGraphsResponseData | null> {
        const { headRepo, taskId } = request;

        const graphs = await this.repositoryManagerService.readFile({
            repoData: headRepo,
            filePath: this.repositoryManagerService.graphsFileName,
            taskId,
            inKodusDir: true,
        });

        if (!graphs) {
            this.logger.error({
                message: `No graphs found for repository ${headRepo.repositoryName}`,
                context: GetGraphsUseCase.name,
                metadata: {
                    request: JSON.stringify(headRepo),
                    taskId,
                },
                serviceName: GetGraphsUseCase.name,
            });
            throw new Error(
                `No graphs found for repository ${headRepo.repositoryName}`,
            );
        }

        const graphsData = JSON.parse(graphs);

        if (!graphsData) {
            this.logger.error({
                message: `No graphs found for repository ${headRepo.repositoryName}`,
                context: GetGraphsUseCase.name,
                metadata: {
                    request: JSON.stringify(headRepo),
                    taskId,
                },
                serviceName: GetGraphsUseCase.name,
            });
            throw new Error(
                `No graphs found for repository ${headRepo.repositoryName}`,
            );
        }

        this.logger.log({
            message: `Retrieved graphs for repository ${headRepo.repositoryName}`,
            context: GetGraphsUseCase.name,
            metadata: {
                request: JSON.stringify(headRepo),
                taskId,
                graphsSize: Buffer.byteLength(graphs, 'utf8'),
            },
            serviceName: GetGraphsUseCase.name,
        });

        const parsedGraphs = graphsData as SerializedGetGraphsResponseData;
        if (!parsedGraphs) {
            this.logger.error({
                message: `Failed to parse graphs for repository ${headRepo.repositoryName}`,
                context: GetGraphsUseCase.name,
                metadata: {
                    request: JSON.stringify(headRepo),
                },
                serviceName: GetGraphsUseCase.name,
            });
            throw new Error(
                `Failed to parse graphs for repository ${headRepo.repositoryName}`,
            );
        }

        const result = parsedGraphs;
        if (serialized) {
            return result;
        }

        const deserialized =
            astDeserializer.deserializeGetGraphsResponseData(parsedGraphs);

        return deserialized;
    }
}
