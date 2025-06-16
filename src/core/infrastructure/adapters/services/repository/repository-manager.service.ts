import { IRepositoryManager } from '@/core/domain/repository/contracts/repository-manager.contract';
import { Injectable } from '@nestjs/common';
import { PinoLoggerService } from '../logger/pino.service';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { minimatch } from 'minimatch';
import simpleGit from 'simple-git';
import { handleError, isError } from '@/shared/utils/errors';
import { RepositoryData, ProtoPlatformType } from '@kodus/kodus-proto/v1';

@Injectable()
export class RepositoryManagerService implements IRepositoryManager {
    static readonly KODUS_DIRECTORY = '.kodus';

    private readonly baseDir = '/tmp/cloned-repos';
    private readonly CLONE_TIMEOUT = 8 * 60 * 1000; // 8 minutes timeout for clone operations
    private readonly ALLOWED_PROTOCOLS = ['https:', 'http:']; // Only allow HTTP/HTTPS
    private readonly MAX_REPO_SIZE = 1024 * 1024 * 900; // 900MB max repo size

    constructor(private readonly logger: PinoLoggerService) {
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
                error: handleError(error),
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
                if (!this.ALLOWED_PROTOCOLS.includes(parsedUrl.protocol)) {
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
            throw new Error(
                `Invalid Git URL: ${isError(error) ? error.message : error}`,
            );
        }
    }

    private configureGit() {
        const git = simpleGit({
            timeout: {
                block: this.CLONE_TIMEOUT,
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
            const { token } = repoData.auth;
            const urlObj = new URL(repoData.url);

            if (token) {
                if (
                    repoData.provider ===
                    ProtoPlatformType.PROTO_PLATFORM_TYPE_GITHUB
                ) {
                    urlObj.username = token;
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
            if (stats > this.MAX_REPO_SIZE) {
                await this.deleteLocalRepository({ repoData });

                throw new Error(
                    `Repository size (${Math.round(stats / 1024 / 1024)}MB) exceeds max allowed (${Math.round(this.MAX_REPO_SIZE / 1024 / 1024)}MB)`,
                );
            }

            return repoPath;
        } catch (error) {
            this.logger.error({
                message: 'Error cloning repository',
                context: RepositoryManagerService.name,
                error: handleError(error),
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
                    if (entry.name === '.git') continue; // Skip .git directory
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
                        entry.name === RepositoryManagerService.KODUS_DIRECTORY
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
                error: handleError(error),
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
                    if (entry.name === '.git') continue;
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
                error: handleError(error),
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
        inKodusDir?: boolean;
    }): Promise<boolean> {
        const { repoData, filePath, data, inKodusDir = false } = params;
        try {
            const repoPath = await this.getRepoDir(repoData);

            const fullPath = inKodusDir
                ? path.join(
                      repoPath,
                      RepositoryManagerService.KODUS_DIRECTORY,
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

            return true;
        } catch (error) {
            this.logger.error({
                message: 'Error writing file',
                context: RepositoryManagerService.name,
                error: handleError(error),
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
        inKodusDir?: boolean;
    }): Promise<Buffer | null> {
        const { repoData, filePath, inKodusDir = false } = params;

        try {
            const repoPath = await this.getRepoDir(repoData);

            const fullPath = inKodusDir
                ? path.join(
                      repoPath,
                      RepositoryManagerService.KODUS_DIRECTORY,
                      filePath,
                  )
                : path.join(repoPath, filePath);
            const normalizedFullPath = fullPath.normalize();
            if (!normalizedFullPath.startsWith(repoPath)) {
                throw new Error('Invalid file path: path traversal detected');
            }

            if (!(await fs.promises.stat(fullPath).catch(() => false))) {
                return null;
            }

            return await fs.promises.readFile(fullPath);
        } catch (error) {
            this.logger.error({
                message: 'Error reading file',
                context: RepositoryManagerService.name,
                error: handleError(error),
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
