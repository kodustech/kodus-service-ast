import { RepositoryData } from '@/shared/types/ast.js';

export const REPOSITORY_MANAGER_TOKEN = Symbol('REPOSITORY_MANAGER_TOKEN');

export interface IRepositoryManager {
    readonly graphsFileName: string;

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
        data: Buffer | string;
        inKodusDir?: boolean;
    }): Promise<boolean>;

    readFile(params: {
        repoData: RepositoryData;
        filePath: string;
        inKodusDir?: boolean;
        stringify?: true; // default is true
        absolute?: boolean;
    }): Promise<string | null>;
    readFile(params: {
        repoData: RepositoryData;
        filePath: string;
        inKodusDir?: boolean;
        stringify?: false;
        absolute?: boolean;
    }): Promise<Buffer | null>;
    readFile(params: {
        repoData: RepositoryData;
        filePath: string;
        inKodusDir?: boolean;
        absolute?: boolean;
    }): Promise<Buffer | string | null>;
}
