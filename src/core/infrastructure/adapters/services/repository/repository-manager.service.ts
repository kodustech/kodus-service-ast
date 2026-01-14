import { IRepositoryManager } from '@/core/domain/repository/contracts/repository-manager.contract.js';
import { ProtoPlatformType, RepositoryData } from '@/shared/types/ast.js';
import { getEnvVariableAsBoolean } from '@/shared/utils/env.js';
import { handleError } from '@/shared/utils/errors.js';
import { Inject, Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import { minimatch } from 'minimatch';
import * as path from 'path';
import { simpleGit } from 'simple-git';
import { PinoLoggerService } from '../logger/pino.service.js';
import { S3GraphsService } from '../storage/s3-graphs.service.js';
import { TaskResultStorageService } from '../storage/task-result-storage.service.js';

@Injectable()
export class RepositoryManagerService implements IRepositoryManager {
    readonly graphsFileName: string = 'graphs';

    static readonly kodusDirectory = '.kodus';

    private readonly baseDir = process.env.SHARED_STORAGE_PATH
        ? `${process.env.SHARED_STORAGE_PATH}/tmp/cloned-repos`
        : '/shared/tmp/cloned-repos';
    private readonly cloneTimeout = 8 * 60 * 1000; // 8 minutes timeout for clone operations
    private readonly allowedProtocols = ['https:', 'http:']; // Only allow HTTP/HTTPS
    private readonly maxRepoSize = 1024 * 1024 * 2048; // 2GB max repo size

    // Cache em arquivo para todos os dados
    private readonly fileCacheDir = '/tmp/s3-cache';
    private readonly maxFileCacheSize = 2 * 1024 * 1024 * 1024; // 2GB max cache
    private readonly maxFileAge = 30 * 60 * 1000; // 30 minutos

    constructor(
        @Inject(PinoLoggerService) private readonly logger: PinoLoggerService,
        @Inject(S3GraphsService)
        private readonly s3GraphsService: S3GraphsService,
        @Inject(TaskResultStorageService)
        private readonly taskResultStorageService: TaskResultStorageService,
    ) {
        void this.ensureBaseDirExists();
        void this.ensureFileCacheDirExists();
    }

    private async ensureBaseDirExists(): Promise<void> {
        try {
            const baseDirExists = await fs.promises
                .stat(this.baseDir)
                .catch(() => false);
            if (!baseDirExists) {
                await fs.promises.mkdir(this.baseDir, { recursive: true });
            }

            this.logger.log({
                message: 'Base directory ensured',
                context: RepositoryManagerService.name,
                metadata: {
                    baseDir: this.baseDir,
                    environment: process.env.NODE_ENV || 'development',
                },
                serviceName: RepositoryManagerService.name,
            });
        } catch (error) {
            this.logger.error({
                message: 'Error ensuring base directory exists',
                context: RepositoryManagerService.name,
                error,
                metadata: {
                    baseDir: this.baseDir,
                    environment: process.env.NODE_ENV || 'development',
                },
                serviceName: RepositoryManagerService.name,
            });
            throw error;
        }
    }

    private async ensureFileCacheDirExists(): Promise<void> {
        try {
            const cacheDirExists = await fs.promises
                .stat(this.fileCacheDir)
                .catch(() => false);
            if (!cacheDirExists) {
                await fs.promises.mkdir(this.fileCacheDir, { recursive: true });
                this.logger.debug({
                    message: 'File cache directory created',
                    context: RepositoryManagerService.name,
                    metadata: { cacheDir: this.fileCacheDir },
                    serviceName: RepositoryManagerService.name,
                });
            }
        } catch (error) {
            this.logger.error({
                message: 'Error ensuring file cache directory exists',
                context: RepositoryManagerService.name,
                error,
                metadata: { cacheDir: this.fileCacheDir },
                serviceName: RepositoryManagerService.name,
            });
            // Não falha a inicialização se não conseguir criar o cache
        }
    }

    private getClientDir(organizationId: string): string {
        const safeOrgId = this.sanitizeIdentifier(organizationId);
        return path.join(this.baseDir, safeOrgId);
    }

    async getRepoDir(repoData: RepositoryData): Promise<string> {
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

    private async saveGraphsMetadata(
        taskId: string,
        repoData: RepositoryData,
        data: Buffer | string,
        storageType: 's3' | 'local',
        s3Result?: any,
        localPath?: string,
        graphsTaskId?: string,
    ): Promise<void> {
        try {
            const graphsSize = Buffer.byteLength(data.toString(), 'utf8');

            const metadata: any = {
                storageType,
                repository: repoData.repositoryName,
                commit: repoData.commitSha ?? '',
                size: graphsSize,
            };

            // Include graphsTaskId if provided (for impact analysis)
            if (graphsTaskId) {
                metadata.graphsTaskId = graphsTaskId;
            }

            // Add local path for local storage
            if (storageType === 'local' && localPath) {
                metadata.localPath = localPath;
            }

            // Add S3 info if S3 was used
            if (storageType === 's3' && s3Result) {
                metadata.s3Key = s3Result.key;
                metadata.s3Url = s3Result.url;
            }

            await this.taskResultStorageService.saveGraphsMetadata(
                taskId,
                metadata,
            );

            this.logger.log({
                message: `Saved ${storageType} graphs metadata for task ${taskId}`,
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
                message: `Failed to save ${storageType} graphs metadata for task ${taskId}`,
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

        // Clean URL by removing extra spaces
        let cloneUrl = repoData.url.trim().replace(/\s+/g, '');

        this.logger.debug({
            message: 'Processing repository URL',
            context: RepositoryManagerService.name,
            metadata: {
                originalUrl: repoData.url,
                cleanedUrl: cloneUrl,
                hasAuth: !!repoData.auth,
            },
            serviceName: RepositoryManagerService.name,
        });

        if (repoData.auth) {
            const { token, username } = repoData.auth;
            const urlObj = new URL(cloneUrl);

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

                    this.logger.debug({
                        message: 'Bitbucket authentication configured',
                        context: RepositoryManagerService.name,
                        metadata: {
                            username: urlObj.username,
                            hasPassword: !!urlObj.password,
                            passwordLength: urlObj.password?.length || 0,
                            finalUrl: urlObj
                                .toString()
                                .replace(/\/\/[^@]+@/, '//***:***@'), // Hide credentials in log
                        },
                        serviceName: RepositoryManagerService.name,
                    });
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

            this.logger.log({
                message: 'Repository cloned successfully',
                context: RepositoryManagerService.name,
                metadata: {
                    repository: repoData.repositoryName,
                    branch: repoData.branch,
                    repoPath,
                    baseDir: this.baseDir,
                },
                serviceName: RepositoryManagerService.name,
            });

            const stats = await this.getDirectorySize(repoPath);
            if (stats > this.maxRepoSize) {
                await this.deleteLocalRepository({ repoData });

                throw new Error(
                    `Repository size (${Math.round(stats / 1024 / 1024)}MB) exceeds max allowed (${Math.round(this.maxRepoSize / 1024 / 1024)}MB)`,
                );
            }

            return repoPath;
        } catch (error) {
            // Enhanced error logging for Bitbucket authentication issues
            const errorMessage =
                error instanceof Error ? error.message : String(error);
            const isBitbucketAuthError =
                repoData.provider ===
                    ProtoPlatformType.PROTO_PLATFORM_TYPE_BITBUCKET &&
                (errorMessage.includes('authentication') ||
                    errorMessage.includes('access') ||
                    errorMessage.includes('permission') ||
                    errorMessage.includes('not have access'));

            this.logger.error({
                message: isBitbucketAuthError
                    ? 'Bitbucket authentication failed'
                    : 'Error cloning repository',
                context: RepositoryManagerService.name,
                error,
                metadata: {
                    params: repoData,
                    repoPath,
                    cloneUrl: cloneUrl.replace(/\/\/[^@]+@/, '//***:***@'), // Hide credentials
                    isBitbucketAuthError,
                    provider: repoData.provider,
                    hasAuth: !!repoData.auth,
                    authUsername: repoData.auth?.username || 'none',
                },
                serviceName: RepositoryManagerService.name,
            });

            await this.deleteLocalRepository({ repoData });

            // Provide more specific error message for Bitbucket auth issues
            if (isBitbucketAuthError) {
                const authError = new Error(
                    `Bitbucket authentication failed for repository: ${repoData.repositoryName}. ` +
                        `Please verify: 1) Token is valid and not expired, 2) Username is correct, ` +
                        `3) Token has repository access permissions, 4) Repository exists and is accessible.`,
                );
                (authError as any).errorType = 'BUSINESS_ERROR';
                throw authError;
            }

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
        graphsTaskId?: string;
    }): Promise<boolean> {
        const {
            repoData,
            filePath,
            data,
            inKodusDir = false,
            taskId,
            graphsTaskId,
        } = params;
        let s3Result: any = null;

        try {
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

                    // Save S3 metadata (fire and forget)
                    this.saveGraphsMetadata(
                        taskId,
                        repoData,
                        data,
                        's3',
                        s3Result,
                        undefined,
                        graphsTaskId,
                    ).catch((error) => {
                        this.logger.warn({
                            message: `Failed to save S3 graphs metadata for task ${taskId}`,
                            context: RepositoryManagerService.name,
                            error,
                            metadata: {
                                taskId,
                                repository: repoData.repositoryName,
                            },
                        });
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
                    return false;
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

            // Save graphs metadata if this is a graphs file (local storage - fire and forget)
            if (inKodusDir && filePath === this.graphsFileName && taskId) {
                this.saveGraphsMetadata(
                    taskId,
                    repoData,
                    data,
                    'local',
                    undefined,
                    fullPath,
                    graphsTaskId,
                ).catch((error) => {
                    this.logger.warn({
                        message: `Failed to save local graphs metadata for task ${taskId}`,
                        context: RepositoryManagerService.name,
                        error,
                        metadata: {
                            taskId,
                            repository: repoData.repositoryName,
                        },
                    });
                });
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
                // Check file cache first
                const cacheKey = this.generateCacheKey(
                    taskId,
                    repoData.repositoryName,
                    repoData.organizationId,
                );
                const fileCachedData = await this.loadFromFileCache(cacheKey);

                if (fileCachedData) {
                    this.logger.debug({
                        message: 'Reading graphs from file cache',
                        context: RepositoryManagerService.name,
                        metadata: {
                            repository: repoData.repositoryName,
                            taskId,
                            cacheKey,
                            dataType: typeof fileCachedData,
                            dataKeys: fileCachedData
                                ? Object.keys(fileCachedData)
                                : null,
                        },
                    });

                    try {
                        if (stringify) {
                            return JSON.stringify(fileCachedData);
                        }

                        return Buffer.from(JSON.stringify(fileCachedData));
                    } catch (error) {
                        this.logger.error({
                            message:
                                'Failed to serialize file cached data, falling back to S3',
                            context: RepositoryManagerService.name,
                            error,
                            metadata: { cacheKey, taskId },
                        });
                    }
                }

                this.logger.debug({
                    message: 'Reading graphs from S3',
                    context: RepositoryManagerService.name,
                    metadata: {
                        repository: repoData.repositoryName,
                        taskId,
                    },
                });

                const graphsData = await this.s3GraphsService.getGraphs(
                    taskId,
                    repoData.repositoryName,
                );

                if (!graphsData) {
                    return null;
                }

                // Calculate data size
                const dataSize = Buffer.byteLength(
                    JSON.stringify(graphsData),
                    'utf8',
                );

                // Save all data to file cache
                await this.saveToFileCache(cacheKey, graphsData, dataSize);

                this.logger.debug({
                    message: 'Cached S3 data to file',
                    context: RepositoryManagerService.name,
                    metadata: {
                        repository: repoData.repositoryName,
                        taskId,
                        cacheKey,
                        dataSize: Math.round(dataSize / 1024 / 1024), // MB
                        dataType: typeof graphsData,
                        dataKeys: graphsData ? Object.keys(graphsData) : null,
                    },
                });

                try {
                    if (stringify) {
                        return JSON.stringify(graphsData);
                    }

                    return Buffer.from(JSON.stringify(graphsData));
                } catch (error) {
                    this.logger.error({
                        message: 'Failed to serialize S3 data',
                        context: RepositoryManagerService.name,
                        error,
                        metadata: {
                            taskId,
                            repository: repoData.repositoryName,
                        },
                    });
                    throw new Error('Failed to serialize graphs data');
                }
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

    /**
     * Gera uma chave de cache baseada no hash do conteúdo
     * Inclui organizationId para evitar conflitos entre clientes
     */
    private generateCacheKey(
        taskId: string,
        repositoryName: string,
        organizationId: string,
    ): string {
        const content = `${organizationId}-${taskId}-${repositoryName}`;
        return crypto.createHash('md5').update(content).digest('hex');
    }

    /**
     * Salva dados no cache em arquivo
     */
    private async saveToFileCache(
        cacheKey: string,
        data: any,
        size: number,
    ): Promise<void> {
        try {
            const filePath = path.join(this.fileCacheDir, `${cacheKey}.json`);
            const cacheData = {
                data,
                timestamp: Date.now(),
                size,
            };

            await fs.promises.writeFile(
                filePath,
                JSON.stringify(cacheData),
                'utf-8',
            );

            this.logger.debug({
                message: 'Data saved to file cache',
                context: RepositoryManagerService.name,
                metadata: {
                    cacheKey,
                    filePath,
                    size,
                },
                serviceName: RepositoryManagerService.name,
            });

            // Limpar cache antigo
            await this.cleanFileCache();
        } catch (error) {
            this.logger.warn({
                message: 'Failed to save to file cache',
                context: RepositoryManagerService.name,
                error,
                metadata: { cacheKey, size },
                serviceName: RepositoryManagerService.name,
            });
        }
    }

    /**
     * Carrega dados do cache em arquivo
     */
    private async loadFromFileCache(cacheKey: string): Promise<any | null> {
        try {
            const filePath = path.join(this.fileCacheDir, `${cacheKey}.json`);

            // Verificar se o arquivo existe
            const exists = await fs.promises.stat(filePath).catch(() => false);
            if (!exists) {
                return null;
            }

            // Ler e parsear o arquivo
            const content = await fs.promises.readFile(filePath, 'utf-8');
            const cacheData = JSON.parse(content);

            // Verificar se não expirou
            const age = Date.now() - cacheData.timestamp;
            if (age > this.maxFileAge) {
                // Remover arquivo expirado
                await fs.promises.unlink(filePath).catch(() => {});
                return null;
            }

            this.logger.debug({
                message: 'Data loaded from file cache',
                context: RepositoryManagerService.name,
                metadata: {
                    cacheKey,
                    filePath,
                    age: Math.round(age / 1000), // em segundos
                    size: cacheData.size,
                },
                serviceName: RepositoryManagerService.name,
            });

            return cacheData.data;
        } catch (error) {
            this.logger.warn({
                message: 'Failed to load from file cache',
                context: RepositoryManagerService.name,
                error,
                metadata: { cacheKey },
                serviceName: RepositoryManagerService.name,
            });
            return null;
        }
    }

    /**
     * Limpa arquivos de cache antigos
     */
    private async cleanFileCache(): Promise<void> {
        try {
            const files = await fs.promises.readdir(this.fileCacheDir);
            const now = Date.now();
            let totalSize = 0;
            const fileStats: Array<{
                path: string;
                size: number;
                age: number;
            }> = [];

            // Coletar estatísticas dos arquivos
            for (const file of files) {
                if (!file.endsWith('.json')) {
                    continue;
                }

                const filePath = path.join(this.fileCacheDir, file);
                try {
                    const stats = await fs.promises.stat(filePath);
                    const age = now - stats.mtime.getTime();

                    fileStats.push({
                        path: filePath,
                        size: stats.size,
                        age,
                    });
                    totalSize += stats.size;
                } catch {
                    // Ignorar arquivos que não conseguimos ler
                }
            }

            // Remover arquivos expirados
            for (const fileStat of fileStats) {
                if (fileStat.age > this.maxFileAge) {
                    await fs.promises.unlink(fileStat.path).catch(() => {});
                    totalSize -= fileStat.size;
                }
            }

            // Se ainda exceder o tamanho máximo, remover os mais antigos
            if (totalSize > this.maxFileCacheSize) {
                const remainingFiles = fileStats
                    .filter((f) => f.age <= this.maxFileAge)
                    .sort((a, b) => b.age - a.age); // Mais antigos primeiro

                for (const fileStat of remainingFiles) {
                    if (totalSize <= this.maxFileCacheSize) {
                        break;
                    }

                    await fs.promises.unlink(fileStat.path).catch(() => {});
                    totalSize -= fileStat.size;
                }
            }

            this.logger.debug({
                message: 'File cache cleaned',
                context: RepositoryManagerService.name,
                metadata: {
                    totalSize: Math.round(totalSize / 1024 / 1024), // MB
                    maxSize: Math.round(this.maxFileCacheSize / 1024 / 1024), // MB
                    filesRemoved: files.length - fileStats.length,
                },
                serviceName: RepositoryManagerService.name,
            });
        } catch (error) {
            this.logger.warn({
                message: 'Failed to clean file cache',
                context: RepositoryManagerService.name,
                error,
                serviceName: RepositoryManagerService.name,
            });
        }
    }
}
