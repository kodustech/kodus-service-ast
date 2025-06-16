import { RepositoryData } from '@kodus/kodus-proto/v1';

export interface IRepositoryManager {
    gitCloneWithAuth(params: { repoData: RepositoryData }): Promise<string>;
    deleteLocalRepository(params: {
        repoData: RepositoryData;
        keepKodusData?: boolean;
    }): Promise<void>;
    listRepositoryFiles(params: {
        repoData: RepositoryData;
        patterns?: string[];
        excludePatterns?: string[];
        maxFiles?: number;
    }): Promise<string[]>;
    writeFile(params: {
        repoData: RepositoryData;
        filePath: string;
        data: Buffer;
        inKodusDir?: boolean;
    }): Promise<boolean>;
    readFile(params: {
        repoData: RepositoryData;
        filePath: string;
        inKodusDir?: boolean;
    }): Promise<Buffer | null>;
}
