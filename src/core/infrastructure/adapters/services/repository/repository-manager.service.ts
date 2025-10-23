import { IRepositoryManager } from '@/core/domain/repository/contracts/repository-manager.contract.js';
import { Inject, Injectable } from '@nestjs/common';
import { PinoLoggerService } from '../logger/pino.service.js';
import { S3GraphsService } from '../storage/s3-graphs.service.js';
import { TaskResultStorageService } from '../storage/task-result-storage.service.js';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { minimatch } from 'minimatch';
import { simpleGit } from 'simple-git';
import { ProtoPlatformType, RepositoryData } from '@/shared/types/ast.js';
import { handleError } from '@/shared/utils/errors.js';
import { getEnvVariableAsBoolean } from '@/shared/utils/env.js';

@Injectable()
export class RepositoryManagerService implements IRepositoryManager {
    readonly graphsFileName: string = 'graphs';

    static readonly kodusDirectory = '.kodus';

    private readonly baseDir = '/tmp/cloned-repos';
    private readonly cloneTimeout = 8 * 60 * 1000; // 8 minutes timeout for clone operations
    private readonly allowedProtocols = ['https:', 'http:']; // Only allow HTTP/HTTPS
    private readonly maxRepoSize = 1024 * 1024 * 900; // 900MB max repo size

    constructor(
        @Inject(PinoLoggerService) private readonly logger: PinoLoggerService,
        @Inject(S3GraphsService)
        private readonly s3GraphsService: S3GraphsService,
        @Inject(TaskResultStorageService)
        private readonly taskResultStorageService: TaskResultStorageService,
    ) {
        void this.ensureBaseDirExists();
    }

    private async ensureBaseDirExists(): Promise<void> {
        try {
            const baseDirExists = await fs.promises
                .stat(this.baseDir)
                .catch(() => false);
            if (!baseDirExists) {
                await fs.promises.mkdir(this.baseDir, { recursive: true });
            }
        } catch (error) {
            this.logger.error({
                message: 'Error ensuring base directory exists',
                context: RepositoryManagerService.name,
                error,
                metadata: { baseDir: this.baseDir },
                serviceName: RepositoryManagerService.name,
            });
            throw error;
        }
    }

    private getClientDir(organizationId: string): string {
        const safeOrgId = this.sanitizeIdentifier(organizationId);
        return path.join(this.baseDir, safeOrgId);
    }

    private async getRepoDir(repoData: RepositoryData): Promise<string> {
        const { organizationId, repositoryId, repositoryName, branch } =
            repoData;
        const safeOrgId = this.sanitizeIdentifier(organizationId);
        const safeRepoId = this.sanitizeIdentifier(repositoryId);
        const safeRepoName = this.sanitizeIdentifier(repositoryName);
        const safeBranchName = this.sanitizeIdentifier(branch);
        const repoPath = path.join(
            this.baseDir,
            safeOrgId,
            'repositories',
            `${safeRepoId.toString()}:${safeRepoName}`,
            safeBranchName,
        );

        const repoPathExists = await fs.promises
            .stat(repoPath)
            .catch(() => false);
        if (!repoPathExists) {
            await fs.promises.mkdir(repoPath, { recursive: true });
        }

        return repoPath;
    }

    private sanitizeIdentifier(identifier: string | number): string {
        const idString = identifier.toString();
        const safePathRegex = /^[a-zA-Z0-9-_]+$/;
        const uuidRegex =
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

        if (uuidRegex.test(idString) || safePathRegex.test(idString)) {
            return idString;
        }

        return crypto
            .createHash('sha256')
            .update(idString)
            .digest('hex')
            .slice(0, 32);
    }

    private async ensureClientDirExists(organizationId: string): Promise<void> {
        const clientDir = this.getClientDir(organizationId);
        const clientDirExists = await fs.promises
            .stat(clientDir)
            .catch(() => false);
        if (!clientDirExists) {
            await fs.promises.mkdir(clientDir, { recursive: true });
        }
    }

    private validateGitUrl(url: string): void {
        try {
            // If the URL is already complete (starts with http:// or https://)
            if (url.startsWith('http://') || url.startsWith('https://')) {
                const parsedUrl = new URL(url);

                // Ensure URL protocol is allowed
                if (!this.allowedProtocols.includes(parsedUrl.protocol)) {
                    throw new Error(
                        `Invalid protocol: ${parsedUrl.protocol}. Only HTTPS/HTTP are allowed.`,
                    );
                }

                // Validate allowed domains
                const allowedDomains = [
                    'github.com',
                    'gitlab.com',
                    'bitbucket.org',
                ];
                if (
                    !allowedDomains.some(
                        (domain) => parsedUrl.hostname === domain,
                    )
                ) {
                    throw new Error(
                        `Invalid domain: ${parsedUrl.hostname}. Only ${allowedDomains.join(', ')} are allowed.`,
                    );
                }

                // Ensure URL path is not empty and looks like a repository URL
                if (
                    !parsedUrl.pathname ||
                    parsedUrl.pathname.split('/').length < 3
                ) {
                    throw new Error('Invalid repository URL format');
                }
            }
            // If it is a short path (e.g., organization/repo)
            else {
                const parts = url.split('/');
                if (parts.length !== 2) {
                    throw new Error(
                        'Invalid repository format. Should be in the format: organization/repository',
                    );
                }

                if (!parts[0] || !parts[1]) {
                    throw new Error(
                        'Both organization and repository names are required',
                    );
                }
            }
        } catch (error) {
            throw new Error(`Invalid Git URL: ${handleError(error).message}`);
        }
    }

    private configureGit() {
        const git = simpleGit({
            timeout: {
                block: this.cloneTimeout,
            },
            config: [
                // Disable all write operations
                'receive.denyNonFastForwards=true',
                'receive.denyCurrentBranch=true',
                'core.logAllRefUpdates=false',

                // Security settings
                'http.sslVerify=true',
                'core.askPass=',
                'credential.helper=',

                // Performance settings
                'core.compression=0',
                'core.preloadIndex=true',
                'gc.auto=0',

                // Disable features we don't need
                'uploadpack.allowAnySHA1InWant=false',
                'uploadpack.allowReachableSHA1InWant=false',
            ],
        });

        return git;
    }

    async gitCloneWithAuth(params: {
        repoData: RepositoryData;
    }): Promise<string> {
        const { repoData } = params;

        this.validateGitUrl(repoData.url);
        await this.ensureClientDirExists(repoData.organizationId);

        const repoPath = await this.getRepoDir(repoData);

        if (await fs.promises.stat(repoPath).catch(() => false)) {
            await this.deleteLocalRepository({ repoData });
        }

        let cloneUrl = repoData.url;

        if (repoData.auth) {
            const { token, username } = repoData.auth;
            const urlObj = new URL(repoData.url);

            if (token) {
                if (
                    repoData.provider ===
                    ProtoPlatformType.PROTO_PLATFORM_TYPE_GITHUB
                ) {
                    urlObj.username = token;
                } else if (
                    repoData.provider ===
                    ProtoPlatformType.PROTO_PLATFORM_TYPE_BITBUCKET
                ) {
                    urlObj.username = (username as string) || 'oauth2';
                    urlObj.password = token;
                } else {
                    urlObj.username = 'oauth2';
                    urlObj.password = token;
                }
            }

            cloneUrl = urlObj.toString();
        }

        try {
            const git = this.configureGit();
            const cloneOptions = [
                '--depth',
                '1',
                '--single-branch',
                '--no-tags',
                '--no-hardlinks',
                '--progress',
            ];

            if (repoData.branch) {
                cloneOptions.push('--branch', repoData.branch);
            }

            await git.clone(cloneUrl, repoPath, cloneOptions);

            const stats = await this.getDirectorySize(repoPath);
            if (stats > this.maxRepoSize) {
                await this.deleteLocalRepository({ repoData });

                throw new Error(
                    `Repository size (${Math.round(stats / 1024 / 1024)}MB) exceeds max allowed (${Math.round(this.maxRepoSize / 1024 / 1024)}MB)`,
                );
            }

            return repoPath;
        } catch (error) {
            this.logger.error({
                message: 'Error cloning repository',
                context: RepositoryManagerService.name,
                error,
                metadata: { params: repoData, repoPath, cloneUrl },
                serviceName: RepositoryManagerService.name,
            });

            await this.deleteLocalRepository({ repoData });

            throw error;
        }
    }

    private async getDirectorySize(directoryPath: string): Promise<number> {
        let totalSize = 0;

        const calculateSize = async (currentPath: string) => {
            const entries = await fs.promises.readdir(currentPath, {
                withFileTypes: true,
            });

            for (const entry of entries) {
                const fullPath = path.join(currentPath, entry.name);

                if (entry.isDirectory()) {
                    if (entry.name === '.git') {
                        continue;
                    } // Skip .git directory
                    await calculateSize(fullPath);
                } else {
                    const stats = await fs.promises.stat(fullPath);
                    totalSize += stats.size;
                }
            }
        };

        await calculateSize(directoryPath);
        return totalSize;
    }

    async deleteLocalRepository(params: {
        repoData: RepositoryData;
        keepKodusData?: boolean;
    }): Promise<void> {
        const { repoData, keepKodusData = false } = params;

        try {
            const repoPath = await this.getRepoDir(repoData);

            const normalizedPath = repoPath.normalize();
            if (!normalizedPath.startsWith(this.baseDir)) {
                throw new Error(
                    'Invalid repository path: must be within base directory',
                );
            }

            if (await fs.promises.stat(repoPath).catch(() => false)) {
                const entries = await fs.promises.readdir(repoPath, {
                    withFileTypes: true,
                });
                for (const entry of entries) {
                    if (
                        keepKodusData &&
                        entry.name === RepositoryManagerService.kodusDirectory
                    ) {
                        continue;
                    }
                    const entryPath = path.join(repoPath, entry.name);
                    await fs.promises.rm(entryPath, {
                        recursive: true,
                        force: true,
                    });
                }
            }
        } catch (error) {
            this.logger.error({
                message:
                    'Error while attempting to delete the local repository',
                context: RepositoryManagerService.name,
                error,
                metadata: {
                    repoData,
                },
                serviceName: RepositoryManagerService.name,
            });
            throw error;
        }
    }

    private async scanDirectoryForFiles(params: {
        dirPath: string;
        patterns?: string[];
        excludePatterns?: string[];
    }): Promise<string[]> {
        const { dirPath, patterns = [], excludePatterns = [] } = params;

        const allFiles: string[] = [];
        const MAX_FILES_TO_SCAN = 10000; // Safety limit
        let scannedFiles = 0;

        const processDirectory = async (currentPath: string) => {
            if (scannedFiles >= MAX_FILES_TO_SCAN) {
                throw new Error(
                    `File scan limit reached (${MAX_FILES_TO_SCAN} files)`,
                );
            }

            const entries = await fs.promises.readdir(currentPath, {
                withFileTypes: true,
            });

            for (const entry of entries) {
                const fullPath = path.join(currentPath, entry.name);
                const relativePath = path.relative(dirPath, fullPath);

                if (entry.isDirectory()) {
                    if (entry.name === '.git') {
                        continue;
                    }
                    await processDirectory(fullPath);
                } else {
                    scannedFiles++;

                    // Check if file matches patterns and doesn't match exclude patterns
                    const shouldInclude =
                        !patterns?.length ||
                        patterns.some((pattern) =>
                            minimatch(relativePath, pattern),
                        );
                    const shouldExclude = excludePatterns?.some((pattern) =>
                        minimatch(relativePath, pattern),
                    );

                    if (shouldInclude && !shouldExclude) {
                        allFiles.push(relativePath);
                    }
                }
            }
        };

        await processDirectory(dirPath);
        return allFiles;
    }

    async listRepositoryFiles(params: {
        repoData: RepositoryData;
        patterns?: string[];
        excludePatterns?: string[];
        maxFiles?: number;
    }): Promise<string[]> {
        const {
            repoData,
            patterns = [],
            excludePatterns = [],
            maxFiles,
        } = params;

        try {
            const repoPath = await this.getRepoDir(repoData);

            const repoExists = await fs.promises
                .stat(repoPath)
                .catch(() => false);
            if (!repoExists) {
                throw new Error('Repository not found');
            }

            let files = await this.scanDirectoryForFiles({
                dirPath: repoPath,
                patterns,
                excludePatterns,
            });

            if (maxFiles && files.length > maxFiles) {
                files = files.slice(0, maxFiles);
            }

            return files;
        } catch (error) {
            this.logger.error({
                message: 'Error listing repository files',
                context: RepositoryManagerService.name,
                error,
                metadata: {
                    repoData,
                    patterns,
                    excludePatterns,
                    maxFiles,
                },
                serviceName: RepositoryManagerService.name,
            });
            throw error;
        }
    }

    public async writeFile(params: {
        repoData: RepositoryData;
        filePath: string;
        data: Buffer | string;
        taskId: string;
        inKodusDir?: boolean;
    }): Promise<boolean> {
        const { repoData, filePath, data, inKodusDir = false, taskId } = params;
        let s3Result: any = null;

        try {
            // Check if this is a graphs file and S3 is enabled
            if (
                inKodusDir &&
                filePath === this.graphsFileName &&
                getEnvVariableAsBoolean('S3_ENABLED', false) &&
                taskId
            ) {
                this.logger.log({
                    message: 'Saving graphs to S3',
                    context: RepositoryManagerService.name,
                    metadata: {
                        repository: repoData.repositoryName,
                        taskId,
                        filePath,
                    },
                });

                s3Result = await this.s3GraphsService.saveGraphs(
                    taskId,
                    repoData.repositoryName,
                    JSON.parse(data.toString()),
                );

                if (s3Result) {
                    this.logger.log({
                        message: 'Graphs saved to S3 successfully',
                        context: RepositoryManagerService.name,
                        metadata: {
                            repository: repoData.repositoryName,
                            taskId,
                            s3Key: s3Result.key,
                            size: s3Result.size,
                        },
                    });
                    return true;
                } else {
                    this.logger.warn({
                        message:
                            'Failed to save graphs to S3, falling back to local storage',
                        context: RepositoryManagerService.name,
                        metadata: {
                            repository: repoData.repositoryName,
                            taskId,
                        },
                    });
                    // Fall through to local storage
                }
            }
            const repoPath = await this.getRepoDir(repoData);

            const fullPath = inKodusDir
                ? path.join(
                      repoPath,
                      RepositoryManagerService.kodusDirectory,
                      filePath,
                  )
                : path.join(repoPath, filePath);
            const normalizedFullPath = fullPath.normalize();
            if (!normalizedFullPath.startsWith(repoPath)) {
                throw new Error('Invalid file path: path traversal detected');
            }

            await fs.promises.mkdir(path.dirname(fullPath), {
                recursive: true,
            });
            await fs.promises.writeFile(fullPath, data);

            this.logger.log({
                message: 'File saved to local filesystem',
                context: RepositoryManagerService.name,
                metadata: {
                    repository: repoData.repositoryName,
                    filePath,
                    inKodusDir,
                    storageType: 'local',
                },
            });

            // Save graphs metadata if this is a graphs file
            if (inKodusDir && filePath === this.graphsFileName && taskId) {
                try {
                    // Determine actual storage type based on what was used
                    const storageType = s3Result ? 's3' : 'local';
                    const graphsSize = Buffer.byteLength(
                        data.toString(),
                        'utf8',
                    );

                    // Prepare metadata with paths/URLs
                    const metadata: any = {
                        storageType,
                        repository: repoData.repositoryName,
                        commit: repoData.commitSha ?? '',
                        size: graphsSize,
                    };

                    // Add local path for local storage
                    if (storageType === 'local') {
                        metadata.localPath = fullPath;
                    }

                    // Add S3 info if S3 was used
                    if (s3Result) {
                        metadata.s3Key = s3Result.key;
                        metadata.s3Url = s3Result.url;
                    }

                    await this.taskResultStorageService.saveGraphsMetadata(
                        taskId,
                        metadata,
                    );

                    this.logger.log({
                        message: `Saved graphs metadata for task ${taskId}`,
                        context: RepositoryManagerService.name,
                        metadata: {
                            taskId,
                            repository: repoData.repositoryName,
                            size: graphsSize,
                            storageType,
                        },
                    });
                } catch (error) {
                    this.logger.warn({
                        message: `Failed to save graphs metadata for task ${taskId}`,
                        context: RepositoryManagerService.name,
                        error,
                        metadata: {
                            taskId,
                            repository: repoData.repositoryName,
                        },
                    });
                    // Don't throw error - graphs are saved, metadata is optional
                }
            }

            return true;
        } catch (error) {
            this.logger.error({
                message: 'Error writing file',
                context: RepositoryManagerService.name,
                error,
                metadata: {
                    repoData,
                    filePath,
                    data: data.toString('base64').slice(0, 100), // Log only first 100 chars for safety
                    inKodusDir,
                },
                serviceName: RepositoryManagerService.name,
            });
            return false;
        }
    }

    public async readFile(params: {
        repoData: RepositoryData;
        filePath: string;
        taskId: string;
        inKodusDir?: boolean;
        stringify?: true; // default is true
        absolute?: boolean;
    }): Promise<string | null>;

    public async readFile(params: {
        repoData: RepositoryData;
        filePath: string;
        taskId: string;
        inKodusDir?: boolean;
        stringify?: false;
        absolute?: boolean;
    }): Promise<Buffer | null>;

    public async readFile(params: {
        repoData: RepositoryData;
        filePath: string;
        taskId: string;
        inKodusDir?: boolean;
        stringify?: boolean;
        absolute?: boolean;
    }): Promise<Buffer | string | null> {
        const {
            repoData,
            filePath,
            inKodusDir = false,
            stringify = true,
            absolute = false,
            taskId,
        } = params;

        try {
            // Check if this is a graphs file and S3 is enabled
            if (
                inKodusDir &&
                filePath === this.graphsFileName &&
                getEnvVariableAsBoolean('S3_ENABLED', false) &&
                taskId
            ) {
                this.logger.debug({
                    message: 'Reading graphs from S3',
                    context: RepositoryManagerService.name,
                    metadata: {
                        repository: repoData.repositoryName,
                    },
                });

                const graphsData = await this.s3GraphsService.getGraphs(
                    taskId,
                    repoData.repositoryName,
                );

                if (!graphsData) {
                    return null;
                }

                if (stringify) {
                    return JSON.stringify(graphsData);
                }

                return Buffer.from(JSON.stringify(graphsData));
            }

            let fullPath: string;
            if (absolute) {
                fullPath = filePath;
            } else {
                const repoPath = await this.getRepoDir(repoData);

                fullPath = inKodusDir
                    ? path.join(
                          repoPath,
                          RepositoryManagerService.kodusDirectory,
                          filePath,
                      )
                    : path.join(repoPath, filePath);
                const normalizedFullPath = fullPath.normalize();
                if (!normalizedFullPath.startsWith(repoPath)) {
                    throw new Error(
                        'Invalid file path: path traversal detected',
                    );
                }
            }

            if (!(await fs.promises.stat(fullPath).catch(() => false))) {
                return null;
            }

            const buff = await fs.promises.readFile(fullPath);

            if (stringify) {
                return buff.toString('utf-8');
            }

            return buff;
        } catch (error) {
            this.logger.error({
                message: 'Error reading file',
                context: RepositoryManagerService.name,
                error,
                metadata: {
                    repoData,
                    filePath,
                    inKodusDir,
                },
                serviceName: RepositoryManagerService.name,
            });
            return null;
        }
    }
}
