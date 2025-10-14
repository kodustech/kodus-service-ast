import { LanguageResolver } from '@/core/domain/parsing/contracts/language-resolver.contract.js';
import {
    ImportedModule,
    ResolvedImport,
} from '@/core/domain/parsing/types/language-resolver.js';
import * as path from 'path';
import { SupportedLanguage } from '@/core/domain/parsing/types/supported-languages.js';
import {
    doesFileExist,
    doesFileExistSync,
    tryReadFile,
} from '@/shared/utils/files.js';
import { tryParseJson } from '@/shared/utils/parsers.js';

type ComposerJson = {
    'require'?: Record<string, string>;
    // eslint-disable-next-line @typescript-eslint/naming-convention
    'require-dev'?: Record<string, string>;
    'autoload'?: {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        'psr-4'?: Record<string, string>;
        'classmap'?: string[];
    };
};

export class PHPResolver implements LanguageResolver {
    private composerJsonPath!: string;
    protected dependencies: Record<string, string> = {};
    protected psr4Map: Record<string, string> = {};

    async canHandle(projectRoot: string): Promise<boolean> {
        const composerJsonPath = path.join(projectRoot, 'composer.json');
        const exists = await doesFileExist(composerJsonPath);
        if (exists) {
            this.composerJsonPath = composerJsonPath;
        }
        return exists;
    }

    async initialize(): Promise<boolean> {
        if (!this.composerJsonPath) {
            console.error('composer.json path is not set.');
            return false;
        }

        const content = await tryReadFile(this.composerJsonPath);
        if (!content) {
            return false;
        }

        const parsed = tryParseJson<ComposerJson>(content);
        if (!parsed) {
            return false;
        }

        this.dependencies = {
            ...(parsed.require || {}),
            ...(parsed['require-dev'] || {}),
        };

        this.psr4Map = parsed.autoload?.['psr-4'] || {};

        return true;
    }

    resolveImport(imported: ImportedModule, fromFile: string): ResolvedImport {
        const namespace = imported.origin;

        // Check if it's an external package
        const rootNamespace = namespace.split('\\')[0];
        if (this.dependencies[rootNamespace]) {
            return {
                originalPath: namespace,
                normalizedPath: namespace,
                relativePath: namespace,
                isExternal: true,
                language: SupportedLanguage.PHP,
            };
        }

        // PSR-4 Namespace resolution
        for (const [prefix, relativePath] of Object.entries(this.psr4Map)) {
            if (
                namespace.startsWith(prefix) ||
                namespace.startsWith(prefix.split('\\')[0])
            ) {
                const candidates = [
                    namespace.slice(prefix.length).replace(/\\/g, '/'),
                    namespace.slice(prefix.length).replace(/\\/g, '/') +
                        imported.imported.map((m) => '/' + m.symbol).join(''),
                ];

                const candidatePaths = candidates.map((candidate) =>
                    path.join(
                        path.dirname(this.composerJsonPath),
                        relativePath,
                        `${candidate}.php`,
                    ),
                );

                const resolvedPath = candidatePaths.find((p) =>
                    doesFileExistSync(p),
                );

                if (resolvedPath) {
                    return {
                        originalPath: namespace,
                        normalizedPath: resolvedPath,
                        relativePath: path.relative(
                            path.dirname(fromFile),
                            resolvedPath,
                        ),
                        isExternal: false,
                        language: SupportedLanguage.PHP,
                    };
                }
            }
        }

        // Fallback: unresolved or global class
        return {
            originalPath: namespace,
            normalizedPath: namespace,
            relativePath: namespace,
            isExternal: false,
            language: SupportedLanguage.PHP,
        };
    }
}
