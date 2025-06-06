import { RepositoryData } from '@kodus/kodus-proto/v1';

export interface IRepositoryManager {
    gitCloneWithAuth(repoData: RepositoryData): Promise<string>;
    deleteLocalRepository(
        repoData: RepositoryData,
        keepKodusData?: boolean,
    ): Promise<void>;
    listRepositoryFiles(
        repoData: RepositoryData,
        patterns?: string[],
        excludePatterns?: string[],
        maxFiles?: number,
    ): Promise<string[]>;
    writeFile(
        repoData: RepositoryData,
        filePath: string,
        data: Buffer,
    ): Promise<boolean>;
    readFile(
        repoData: RepositoryData,
        filePath: string,
    ): Promise<Buffer | null>;
}
