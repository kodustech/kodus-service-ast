import { Inject, Injectable } from '@nestjs/common';
import {
    S3Client,
    PutObjectCommand,
    GetObjectCommand,
    DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
    getEnvVariableAsBoolean,
    getEnvVariableOrExit,
} from '@/shared/utils/env.js';
import { PinoLoggerService } from '../logger/pino.service.js';
import { TaskResultStorageService } from './task-result-storage.service.js';
import * as crypto from 'crypto';

export interface GraphStorageResult {
    key: string;
    size: number;
    url?: string;
}

@Injectable()
export class S3GraphsService {
    private readonly s3Client: S3Client;
    private readonly bucketName: string;
    private readonly enabled: boolean;
    private readonly baseTimeout = 30000; // 30s base timeout

    constructor(
        @Inject(PinoLoggerService) private readonly logger: PinoLoggerService,
        @Inject(TaskResultStorageService)
        private readonly taskResultStorage: TaskResultStorageService,
    ) {
        this.enabled = getEnvVariableAsBoolean('S3_ENABLED', false);
        this.bucketName = getEnvVariableOrExit('S3_BUCKET_NAME');

        this.s3Client = new S3Client({
            region: getEnvVariableOrExit('AWS_REGION'),
            // ✅ SECURITY: No credentials needed - ECS task role handles this automatically
            // ❌ DON'T USE: accessKeyId/secretAccessKey (insecure)
            // Security: Force HTTPS
            forcePathStyle: false,
            useAccelerateEndpoint: false,
            // Performance: Connection pooling
            maxAttempts: 3,
            retryMode: 'adaptive',
            // Security: Request timeout (will be overridden per request)
            requestHandler: {
                requestTimeout: this.baseTimeout,
                httpsAgent: {
                    keepAlive: true,
                    maxSockets: 50,
                },
            },
        });
    }

    /**
     * Calculate adaptive timeout based on data size
     */
    private getAdaptiveTimeout(size: number): number {
        const sizeFactor = Math.ceil(size / (1024 * 1024)); // MB
        const adaptiveTimeout = this.baseTimeout * Math.max(1, sizeFactor / 10);
        return Math.min(adaptiveTimeout, 300000); // Max 5 minutes
    }

    async saveGraphs(
        taskId: string,
        repositoryName: string,
        graphsData: any,
    ): Promise<GraphStorageResult | null> {
        if (!this.enabled) {
            this.logger.debug({
                message: 'S3 disabled, skipping graph storage',
                context: S3GraphsService.name,
            });
            return null;
        }

        try {
            // Security: Sanitize inputs
            const sanitizedRepo = this.sanitizeKey(repositoryName);
            const sanitizedTaskId = this.sanitizeKey(taskId);

            // Security: Generate secure key with timestamp
            const timestamp = Date.now();
            const key = `graphs/${sanitizedRepo}/${sanitizedTaskId}_${timestamp}.json`;

            const body = JSON.stringify(graphsData);
            const size = Buffer.byteLength(body, 'utf8');

            // Security: Validate reasonable size limits (1GB max for safety)
            if (size > 1024 * 1024 * 1024) {
                throw new Error(`Graphs too large: ${size} bytes (max 1GB)`);
            }

            // Calculate adaptive timeout based on size
            const adaptiveTimeout = this.getAdaptiveTimeout(size);

            // Security: Server-side encryption
            await this.s3Client.send(
                new PutObjectCommand({
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    Bucket: this.bucketName,
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    Key: key,
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    Body: body,
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    ContentType: 'application/json',
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    ContentEncoding: 'utf-8',
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    ServerSideEncryption: 'AES256',
                    ACL: 'private',
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    Metadata: {
                        repository: sanitizedRepo,
                        taskId: sanitizedTaskId,
                        size: size.toString(),
                        timestamp: timestamp.toString(),
                        version: '1.0',
                        timeout: adaptiveTimeout.toString(),
                    },
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    ContentMD5: this.calculateMD5(body),
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    CacheControl: 'no-cache, no-store, must-revalidate',
                }),
                { requestTimeout: adaptiveTimeout },
            );

            this.logger.log({
                message: 'Graphs saved to S3',
                context: S3GraphsService.name,
                metadata: {
                    repository: repositoryName,
                    taskId,
                    key,
                    size,
                },
            });

            return {
                key,
                size,
                url: `s3://${this.bucketName}/${key}`,
            };
        } catch (error) {
            this.logger.error({
                message: 'Error saving graphs to S3',
                context: S3GraphsService.name,
                error,
                metadata: {
                    repository: repositoryName,
                    taskId,
                },
            });
            return null;
        }
    }

    async getGraphs(
        taskId: string,
        repositoryName: string,
    ): Promise<any | null> {
        if (!this.enabled) {
            this.logger.debug({
                message: 'S3 disabled, skipping graph retrieval',
                context: S3GraphsService.name,
            });
            return null;
        }

        try {
            // Get the s3Key from task_results table
            const graphsMetadata =
                await this.taskResultStorage.getGraphsMetadata(taskId);

            if (!graphsMetadata?.s3Key) {
                this.logger.warn({
                    message: 'No S3 key found in task_results for task',
                    context: S3GraphsService.name,
                    metadata: {
                        taskId,
                        repository: repositoryName,
                    },
                });
                return null;
            }

            const key = graphsMetadata.s3Key;

            const response = await this.s3Client.send(
                new GetObjectCommand({
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    Bucket: this.bucketName,
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    Key: key,
                }),
            );

            if (!response.Body) {
                return null;
            }

            const chunks: Uint8Array[] = [];
            const stream = response.Body as any;

            for await (const chunk of stream) {
                chunks.push(chunk);
            }

            const buffer = Buffer.concat(chunks);
            const content = buffer.toString('utf-8');

            this.logger.log({
                message: 'Graphs retrieved from S3',
                context: S3GraphsService.name,
                metadata: {
                    repository: repositoryName,
                    taskId,
                    key,
                    size: graphsMetadata.size,
                },
            });

            return JSON.parse(content);
        } catch (error) {
            this.logger.error({
                message: 'Error retrieving graphs from S3',
                context: S3GraphsService.name,
                error,
                metadata: {
                    repository: repositoryName,
                    taskId,
                },
            });
            return null;
        }
    }

    async deleteGraphs(
        taskId: string,
        repositoryName: string,
    ): Promise<boolean> {
        if (!this.enabled) {
            this.logger.debug({
                message: 'S3 disabled, skipping graph deletion',
                context: S3GraphsService.name,
            });
            return false;
        }

        try {
            // Get the s3Key from task_results table
            const graphsMetadata =
                await this.taskResultStorage.getGraphsMetadata(taskId);

            if (!graphsMetadata?.s3Key) {
                this.logger.warn({
                    message: 'No S3 key found in task_results for deletion',
                    context: S3GraphsService.name,
                    metadata: {
                        taskId,
                        repository: repositoryName,
                    },
                });
                return false;
            }

            const key = graphsMetadata.s3Key;

            await this.s3Client.send(
                new DeleteObjectCommand({
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    Bucket: this.bucketName,
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    Key: key,
                }),
            );

            this.logger.log({
                message: 'Graphs deleted from S3',
                context: S3GraphsService.name,
                metadata: {
                    repository: repositoryName,
                    taskId,
                    key,
                },
            });

            return true;
        } catch (error) {
            this.logger.error({
                message: 'Failed to delete graphs from S3',
                context: S3GraphsService.name,
                error,
                metadata: {
                    repository: repositoryName,
                    taskId,
                },
            });
            return false;
        }
    }

    // Security: Sanitize S3 keys to prevent path traversal
    private sanitizeKey(input: string): string {
        return input
            .replace(/[^a-zA-Z0-9._-]/g, '_') // Only allow safe chars
            .replace(/\.\./g, '_') // Prevent path traversal
            .replace(/^\./, '_') // No leading dots
            .substring(0, 100); // Limit length
    }

    // Security: Calculate MD5 for content validation
    private calculateMD5(content: string): string {
        return crypto.createHash('md5').update(content).digest('base64');
    }

    // Security: Generate presigned URL for secure access
    async generatePresignedUrl(
        repositoryName: string,
        taskId: string,
        expirationMinutes: number = 60,
    ): Promise<string | null> {
        if (!this.enabled) {
            this.logger.debug({
                message: 'S3 disabled, cannot generate presigned URL',
                context: S3GraphsService.name,
            });
            return null;
        }

        try {
            // Get the s3Key from task_results table
            const graphsMetadata =
                await this.taskResultStorage.getGraphsMetadata(taskId);

            if (!graphsMetadata?.s3Key) {
                this.logger.warn({
                    message:
                        'No S3 key found in task_results for presigned URL',
                    context: S3GraphsService.name,
                    metadata: {
                        taskId,
                        repository: repositoryName,
                    },
                });
                return null;
            }

            const key = graphsMetadata.s3Key;

            const presignedUrl = await getSignedUrl(
                this.s3Client,
                new GetObjectCommand({
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    Bucket: this.bucketName,
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    Key: key,
                }),
                { expiresIn: expirationMinutes * 60 },
            );

            this.logger.log({
                message: 'Presigned URL generated',
                context: S3GraphsService.name,
                metadata: {
                    repository: repositoryName,
                    taskId,
                    expirationMinutes,
                    key,
                },
            });

            return presignedUrl;
        } catch (error) {
            this.logger.error({
                message: 'Failed to generate presigned URL',
                context: S3GraphsService.name,
                error,
                metadata: {
                    repository: repositoryName,
                    taskId,
                },
            });
            return null;
        }
    }
}
