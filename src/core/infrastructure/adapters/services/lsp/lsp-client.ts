import * as cp from 'child_process';
import * as path from 'path';
import * as rpc from 'vscode-jsonrpc/node.js';
import {
    type Diagnostic,
    type DidChangeTextDocumentParams,
    type DidCloseTextDocumentParams,
    type DidOpenTextDocumentParams,
    type InitializeParams,
    type PublishDiagnosticsParams,
} from 'vscode-languageserver-protocol';
import { type PinoLoggerService } from '../logger/pino.service.js';

export class LspClient {
    private process: cp.ChildProcess | undefined;
    private connection: rpc.MessageConnection | undefined;

    private readonly documentVersions: Map<string, number> = new Map();

    constructor(
        private readonly logger: PinoLoggerService,
        private readonly serverCommand: string,
        private readonly serverArgs: string[],
    ) {}

    async start(rootPath: string) {
        const env = { ...process.env };

        delete env.NODE_OPTIONS;

        // 1. Spawn the LSP server (e.g., typescript-language-server)
        this.process = cp.spawn(this.serverCommand, this.serverArgs, { env });

        if (!this.process.stdout || !this.process.stdin) {
            throw new Error('Failed to spawn LSP server');
        }

        // 2. Setup JSON-RPC over Stdio
        this.connection = rpc.createMessageConnection(
            new rpc.StreamMessageReader(this.process.stdout),
            new rpc.StreamMessageWriter(this.process.stdin),
        );

        this.connection.listen();

        const rootPathName = path.basename(rootPath);

        // 3. Initialize Handshake
        const initParams: InitializeParams = {
            processId: process.pid,
            rootUri: `file://${rootPath}`,
            capabilities: {
                textDocument: {
                    publishDiagnostics: {
                        relatedInformation: true,
                        tagSupport: { valueSet: [1, 2] },
                        versionSupport: true,
                    },
                    synchronization: {
                        dynamicRegistration: true,
                        willSave: false,
                        didSave: false,
                        willSaveWaitUntil: false,
                    },
                },
                workspace: {
                    workspaceFolders: true,
                },
            },
            workspaceFolders: [
                { uri: `file://${rootPath}`, name: rootPathName },
            ],
        };

        await this.connection.sendRequest('initialize', initParams);
        await this.connection.sendNotification('initialized');
    }

    async sendDidOpen(
        absoluteFilePath: string,
        content: string,
    ): Promise<void> {
        const fileUri = `file://${absoluteFilePath}`;

        const version = 1;

        const params: DidOpenTextDocumentParams = {
            textDocument: {
                uri: fileUri,
                languageId: 'typescript',
                version,
                text: content,
            },
        };

        this.documentVersions.set(fileUri, version);

        this.logger.log({
            message: '[LSP] Sending didOpen...',
            context: LspClient.name,
            metadata: {
                fileUri,
                version,
            },
        });
        await this.connection?.sendNotification('textDocument/didOpen', params);
    }

    async sendDidChange(
        absoluteFilePath: string,
        newContent: string,
    ): Promise<void> {
        const fileUri = `file://${absoluteFilePath}`;

        const currentVersion = this.documentVersions.get(fileUri) || 0;
        const nextVersion = currentVersion + 1;

        this.documentVersions.set(fileUri, nextVersion);

        const params: DidChangeTextDocumentParams = {
            textDocument: {
                uri: fileUri,
                version: nextVersion,
            },
            contentChanges: [{ text: newContent }],
        };

        this.logger.log({
            message: `[LSP] Sending didChange (v${nextVersion})...`,
            context: LspClient.name,
            metadata: {
                fileUri,
                version: nextVersion,
            },
        });
        await this.connection?.sendNotification(
            'textDocument/didChange',
            params,
        );
    }

    async sendDidClose(absoluteFilePath: string): Promise<void> {
        const fileUri = `file://${absoluteFilePath}`;

        const params: DidCloseTextDocumentParams = {
            textDocument: { uri: fileUri },
        };

        this.logger.log({
            message: `[LSP] Sending didClose...`,
            context: LspClient.name,
            metadata: {
                fileUri,
            },
        });
        await this.connection?.sendNotification(
            'textDocument/didClose',
            params,
        );

        this.documentVersions.delete(fileUri);
    }

    async waitForDiagnostics(
        absoluteFilePath: string,
        timeoutMs = 5000,
    ): Promise<Diagnostic[]> {
        const fileUri = `file://${absoluteFilePath}`;

        return new Promise((resolve) => {
            let latestDiagnostics: Diagnostic[] | null = null;
            let debounceTimer: NodeJS.Timeout | undefined;

            const timeoutTimer = setTimeout(() => {
                cleanup();
                if (latestDiagnostics) {
                    resolve(latestDiagnostics);
                } else {
                    this.logger.warn({
                        message: `[LSP] Timeout waiting for diagnostics`,
                        context: LspClient.name,
                        metadata: {
                            fileUri,
                        },
                    });
                    resolve([]);
                }
            }, timeoutMs);

            const cleanup = () => {
                disposable?.dispose();
                if (timeoutTimer) {
                    clearTimeout(timeoutTimer);
                }
                if (debounceTimer) {
                    clearTimeout(debounceTimer);
                }
            };

            const SETTLE_TIME_MS = 250;

            const disposable = this.connection?.onNotification(
                'textDocument/publishDiagnostics',
                (params: PublishDiagnosticsParams) => {
                    const incomingUri = decodeURIComponent(params.uri);
                    const targetUri = decodeURIComponent(fileUri);

                    let isMatch = false;

                    if (incomingUri === targetUri) {
                        isMatch = true;
                    } else {
                        const rawIncomingPath = incomingUri.replace(
                            /^file:\/\//,
                            '',
                        );

                        isMatch = targetUri.endsWith(rawIncomingPath);
                    }

                    if (isMatch) {
                        latestDiagnostics = params.diagnostics;

                        if (debounceTimer) {
                            clearTimeout(debounceTimer);
                        }

                        debounceTimer = setTimeout(() => {
                            cleanup();
                            resolve(latestDiagnostics || []);
                        }, SETTLE_TIME_MS);
                    }
                },
            );
        });
    }

    async getDiagnosticsForChange(
        filePath: string,
        baselineContent: string,
        patchedContent: string,
    ): Promise<Diagnostic[]> {
        const baselineListener = this.waitForDiagnostics(filePath);
        await this.sendDidOpen(filePath, baselineContent);
        const baselineDiagnostics = await baselineListener;

        const changeListener = this.waitForDiagnostics(filePath);
        await this.sendDidChange(filePath, patchedContent);
        const newDiagnostics = await changeListener;

        await this.sendDidClose(filePath);

        return this.filterNewDiagnostics(baselineDiagnostics, newDiagnostics);
    }

    private filterNewDiagnostics(
        baseline: Diagnostic[],
        current: Diagnostic[],
    ): Diagnostic[] {
        const getSignature = (d: Diagnostic) =>
            `${d.source || ''}::${d.code || ''}::${d.message}`;

        const baselineCounts = new Map<string, number>();

        for (const diag of baseline) {
            const sig = getSignature(diag);
            baselineCounts.set(sig, (baselineCounts.get(sig) || 0) + 1);
        }

        const newErrors: Diagnostic[] = [];

        for (const diag of current) {
            const sig = getSignature(diag);
            const count = baselineCounts.get(sig) || 0;

            if (count > 0) {
                baselineCounts.set(sig, count - 1);
            } else {
                newErrors.push(diag);
            }
        }

        return newErrors;
    }

    stop() {
        this.connection?.dispose();
        this.process?.kill();
    }
}
