import {
    AliasConfig,
    LanguageResolver,
} from '@/core/domain/ast/contracts/LanguageResolver';
import * as path from 'path';
import {
    sys as tsSys,
    findConfigFile,
    readConfigFile,
    parseJsonConfigFileContent,
    CompilerOptions,
    resolveModuleName,
} from 'typescript';

export class TypeScriptResolver implements LanguageResolver {
    private projectRoot: string;
    private moduleDirectories = ['node_modules'];
    private config: CompilerOptions;

    canHandle(projectRoot: string): Promise<boolean> {
        this.projectRoot = projectRoot;

        const tsConfigPath = findConfigFile(
            projectRoot,
            // eslint-disable-next-line @typescript-eslint/unbound-method
            tsSys.fileExists,
            'tsconfig.json',
        );

        if (!tsConfigPath) {
            return Promise.resolve(false);
        }

        // eslint-disable-next-line @typescript-eslint/unbound-method
        const tsConfigFile = readConfigFile(tsConfigPath, tsSys.readFile);
        if (tsConfigFile.error) {
            console.error(`Error reading tsconfig.json at ${tsConfigPath}}`);
            return Promise.resolve(false);
        }

        const parsedConfig = parseJsonConfigFileContent(
            tsConfigFile.config,
            tsSys,
            path.dirname(tsConfigPath),
        );
        if (parsedConfig.errors.length > 0) {
            console.error(`Error parsing tsconfig.json at ${tsConfigPath}`);
            return Promise.resolve(false);
        }

        this.config = parsedConfig.options;
        return Promise.resolve(true);
    }

    readAliasConfig(): Record<string, AliasConfig> {
        return {};
    }

    getPriority(): number {
        return 100;
    }

    isExternalModule(importPath: string): boolean {
        if (importPath.startsWith('.') || importPath.startsWith('/')) {
            return false;
        }

        const resolved = resolveModuleName(
            importPath,
            this.projectRoot,
            this.config,
            tsSys,
        );
        const resolvedModule = resolved.resolvedModule;
        if (!resolvedModule) {
            return true; // If we can't resolve it (e.g. we don't have node_modules), treat it as external
        }

        return false;
    }

    resolveModulePath(importPath: string, fromFile: string): string {
        if (this.isExternalModule(importPath)) {
            return importPath;
        }

        const resolved = resolveModuleName(
            importPath,
            fromFile,
            this.config,
            tsSys,
        );

        const resolvedModule = resolved.resolvedModule;
        if (!resolvedModule) {
            console.warn(
                `Could not resolve module: ${importPath} from ${fromFile}`,
            );
            return importPath; // Fallback to original import path
        }

        return resolvedModule.resolvedFileName;
    }

    getModuleDirectories(): string[] {
        return this.moduleDirectories;
    }

    getAliasMap(): Record<string, string> {
        return {};
    }
}
