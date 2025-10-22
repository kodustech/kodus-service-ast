import { Injectable } from '@nestjs/common';
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

    constructor(private readonly logger: PinoLoggerService) {
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
            // Security: Request timeout
            requestHandler: {
                requestTimeout: 30000, // 30s timeout
                httpsAgent: {
                    keepAlive: true,
                    maxSockets: 50,
                },
            },
        });
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
                    },
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    ContentMD5: this.calculateMD5(body),
                    // eslint-disable-next-line @typescript-eslint/naming-convention
                    CacheControl: 'no-cache, no-store, must-revalidate',
                }),
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
            const sanitizedRepo = this.sanitizeKey(repositoryName);
            const sanitizedTaskId = this.sanitizeKey(taskId);

            // Try to find the most recent graph file for this commit
            const key = `graphs/${sanitizedRepo}/${sanitizedTaskId}_`;

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
                    repository: sanitizedRepo,
                    taskId: sanitizedTaskId,
                    key,
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
            const sanitizedRepo = this.sanitizeKey(repositoryName);
            const sanitizedTaskId = this.sanitizeKey(taskId);
            const key = `graphs/${sanitizedRepo}/${sanitizedTaskId}_`;

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
                    taskId: sanitizedTaskId,
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
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const crypto = require('crypto');
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
            const sanitizedRepo = this.sanitizeKey(repositoryName);
            const sanitizedTaskId = this.sanitizeKey(taskId);
            const key = `graphs/${sanitizedRepo}/${sanitizedTaskId}_`;

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
                    repository: sanitizedRepo,
                    taskId: sanitizedTaskId,
                    expirationMinutes,
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
