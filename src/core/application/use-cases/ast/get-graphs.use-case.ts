import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service';
import { RepositoryManagerService } from '@/core/infrastructure/adapters/services/repository/repository-manager.service';
import { handleError } from '@/shared/utils/errors';
import { GrpcInvalidArgumentException } from '@/shared/utils/grpc/exceptions';
import {
    GetGraphsRequest,
    GetGraphsResponse,
    RepositoryData,
    GetGraphsResponseData as SerializedGraphs,
} from '@kodus/kodus-proto/v2';
import { Injectable } from '@nestjs/common';
import { from, Observable } from 'rxjs';

@Injectable()
export class GetGraphsUseCase {
    constructor(
        private readonly repositoryManagerService: RepositoryManagerService,

        private readonly logger: PinoLoggerService,
    ) {}

    execute(request: GetGraphsRequest): Observable<GetGraphsResponse> {
        const { baseRepo, headRepo } = request;

        if (!baseRepo || !headRepo) {
            throw new GrpcInvalidArgumentException(
                'Both baseRepo and headRepo must be provided',
            );
        }

        return from(this.handleRequest(request));
    }

    private async getGraphs(
        repoData: RepositoryData,
    ): Promise<SerializedGraphs> {
        const fileName = 'graphs';

        const graphs = await this.repositoryManagerService.readFile(
            repoData,
            fileName,
        );

        if (!graphs) {
            this.logger.warn({
                message: `No graphs found for repository ${repoData.repositoryName}`,
                context: GetGraphsUseCase.name,
                metadata: {
                    request: JSON.stringify(repoData),
                },
            });
            return null;
        }

        this.logger.log({
            message: `Retrieved graphs for repository ${repoData.repositoryName}`,
            context: GetGraphsUseCase.name,
            metadata: {
                request: JSON.stringify(repoData),
            },
        });

        return JSON.parse(graphs.toString('utf-8')) as SerializedGraphs;
    }

    private async *handleRequest(
        request: GetGraphsRequest,
    ): AsyncGenerator<GetGraphsResponse> {
        try {
            const headGraph = await this.getGraphs(request.headRepo);

            yield* this.createChunkStream(headGraph);
        } catch (error) {
            this.logger.error({
                message: 'Failed to get graphs',
                context: GetGraphsUseCase.name,
                error: handleError(error),
                metadata: {
                    request,
                },
            });
            throw error;
        }
    }

    private *createChunkStream(
        result: any,
        chunkSize = 1024 * 1024,
    ): Generator<GetGraphsResponse> {
        const jsonString = JSON.stringify(result);
        const totalLength = jsonString.length;

        for (let i = 0; i < totalLength; i += chunkSize) {
            const chunk = jsonString.slice(i, i + chunkSize);
            const isLast = i + chunkSize >= totalLength;

            yield {
                data: new TextEncoder().encode(chunk),
                isLast,
            };
        }
    }
}
