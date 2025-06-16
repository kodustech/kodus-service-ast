import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import { RepositoryManagerService } from '@/core/infrastructure/adapters/services/repository/repository-manager.service';
import {
    ASTDeserializer,
    SerializedGetGraphsResponseData,
} from '@kodus/kodus-proto/serialization/ast';
import { GetGraphsRequest, GetGraphsResponseData } from '@kodus/kodus-proto/v2';
import { Injectable } from '@nestjs/common';

@Injectable()
export class GetGraphsUseCase {
    constructor(
        private readonly repositoryManagerService: RepositoryManagerService,

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
        const { headRepo } = request;
        const fileName = `graphs`;

        const graphs = await this.repositoryManagerService.readFile({
            repoData: headRepo,
            filePath: fileName,
            inKodusDir: true,
        });

        if (!graphs) {
            this.logger.warn({
                message: `No graphs found for repository ${headRepo.repositoryName}`,
                context: GetGraphsUseCase.name,
                metadata: {
                    request: JSON.stringify(headRepo),
                },
                serviceName: GetGraphsUseCase.name,
            });
            return null;
        }

        this.logger.log({
            message: `Retrieved graphs for repository ${headRepo.repositoryName}`,
            context: GetGraphsUseCase.name,
            metadata: {
                request: JSON.stringify(headRepo),
            },
            serviceName: GetGraphsUseCase.name,
        });

        const parsedGraphs = JSON.parse(
            graphs.toString(),
        ) as SerializedGetGraphsResponseData;
        if (!parsedGraphs) {
            this.logger.warn({
                message: `Failed to parse graphs for repository ${headRepo.repositoryName}`,
                context: GetGraphsUseCase.name,
                metadata: {
                    request: JSON.stringify(headRepo),
                },
                serviceName: GetGraphsUseCase.name,
            });
            return null;
        }

        const result = parsedGraphs;
        if (serialized) {
            return result;
        }

        const deserialized =
            ASTDeserializer.deserializeGetGraphsResponseData(parsedGraphs);

        return deserialized;
    }
}
