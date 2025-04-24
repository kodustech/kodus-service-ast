import { RepositoryData } from '@kodus/kodus-proto';

export interface IRepositoryManager {
    gitCloneWithAuth(params: RepositoryData): Promise<string>;
    deleteLocalRepository(
        organizationId: string,
        repositoryId: string,
        repositoryName: string,
        branchName: string,
    ): Promise<void>;
    listRepositoryFiles(
        organizationId: string,
        repositoryId: string,
        repositoryName: string,
        branchName: string,
        patterns?: string[],
        excludePatterns?: string[],
        maxFiles?: number,
    ): Promise<string[]>;
    readFileContent(
        organizationId: string,
        repositoryId: string,
        repositoryName: string,
        filePath: string,
        branchName: string,
    ): Promise<string>;
}
