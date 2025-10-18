import { type LanguageResolver } from '@/core/domain/parsing/contracts/language-resolver.contract.js';
import {
    type ImportedModule,
    type ResolvedImport,
} from '@/core/domain/parsing/types/language-resolver.js';
import * as path from 'path';
import { SupportedLanguage } from '@/core/domain/parsing/types/supported-languages.js';
import { doesFileExist, tryReadFile } from '@/shared/utils/files.js';
import { tryParseJson } from '@/shared/utils/parsers.js';

type PackageJson = {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
};

export class JavaScriptResolver implements LanguageResolver {
    private packageJsonPath!: string;
    protected dependencies: Record<string, string> = {};

    async canHandle(projectRoot: string): Promise<boolean> {
        const packageJsonPath = path.join(projectRoot, 'package.json');
        const exists = await doesFileExist(packageJsonPath);
        if (exists) {
            this.packageJsonPath = packageJsonPath;
        }
        return exists;
    }

    async initialize(): Promise<boolean> {
        if (!this.packageJsonPath) {
            console.error('Package.json path is not set.');
            return false;
        }

        const content = await tryReadFile(this.packageJsonPath);
        if (!content) {
            return false;
        }

        const config = tryParseJson<PackageJson>(content);
        if (!config) {
            return false;
        }

        this.dependencies = {
            ...config.dependencies,
            ...config.devDependencies,
            ...config.peerDependencies,
            ...config.optionalDependencies,
        };

        return true;
    }

    resolveImport(imported: ImportedModule, fromFile: string): ResolvedImport {
        const moduleName = imported.origin;

        if (this.dependencies[moduleName]) {
            return {
                originalPath: moduleName,
                normalizedPath: moduleName,
                relativePath: moduleName,
                isExternal: true,
                language: SupportedLanguage.JAVASCRIPT,
            };
        }

        const resolvedPath = path.resolve(path.dirname(fromFile), moduleName);

        return {
            originalPath: moduleName,
            normalizedPath: resolvedPath,
            relativePath: path.relative(path.dirname(fromFile), resolvedPath),
            isExternal: false,
            language: SupportedLanguage.JAVASCRIPT,
        };
    }
}
