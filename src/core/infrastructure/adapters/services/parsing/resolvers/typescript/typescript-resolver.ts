import * as path from 'path';
import {
    sys as tsSys,
    type CompilerOptions,
    readConfigFile,
    parseJsonConfigFileContent,
    resolveModuleName,
} from 'typescript';
import { JavaScriptResolver } from '../javascript/javascript-resolver.js';
import { SupportedLanguage } from '@/core/domain/parsing/types/supported-languages.js';
import { type LanguageResolver } from '@/core/domain/parsing/contracts/language-resolver.contract.js';
import {
    type ImportedModule,
    type ResolvedImport,
} from '@/core/domain/parsing/types/language-resolver.js';

export class TypeScriptResolver
    extends JavaScriptResolver
    implements LanguageResolver
{
    private tsConfig!: CompilerOptions;
    private tsConfigPath!: string;

    override async canHandle(projectRoot: string): Promise<boolean> {
        if (!(await super.canHandle(projectRoot))) {
            return false;
        }

        const tsConfigPath = path.join(projectRoot, 'tsconfig.json');

        const tsConfigExists = tsSys.fileExists(tsConfigPath);

        if (tsConfigExists) {
            this.tsConfigPath = tsConfigPath;
        }

        return tsConfigExists;
    }

    override async initialize(): Promise<boolean> {
        if (!(await super.initialize())) {
            return false;
        }

        const tsConfigFile = readConfigFile(this.tsConfigPath, tsSys.readFile);
        if (tsConfigFile.error) {
            console.error(
                `Error reading tsconfig.json at ${this.tsConfigPath}}`,
            );
            return false;
        }

        const parsedConfig = parseJsonConfigFileContent(
            tsConfigFile.config,
            tsSys,
            path.dirname(this.tsConfigPath),
        );
        if (parsedConfig.errors.length > 0) {
            console.error(
                `Error parsing tsconfig.json at ${this.tsConfigPath}`,
            );
            return false;
        }

        this.tsConfig = parsedConfig.options;
        return true;
    }

    resolveImport(imported: ImportedModule, fromFile: string): ResolvedImport {
        try {
            const moduleName = imported.origin;
            if (this.dependencies[moduleName]) {
                return {
                    originalPath: moduleName,
                    normalizedPath: moduleName,
                    relativePath: moduleName,
                    isExternal: true,
                    language: SupportedLanguage.TYPESCRIPT,
                };
            }

            const resolved = resolveModuleName(
                moduleName,
                fromFile,
                this.tsConfig,
                tsSys,
            );
            if (!resolved.resolvedModule) {
                // If the module is not resolved, it might be an external module
                // since we don't install modules then typescript will not resolve them.
                return {
                    originalPath: moduleName,
                    normalizedPath: moduleName,
                    relativePath: moduleName,
                    isExternal: true,
                    language: SupportedLanguage.TYPESCRIPT,
                };
            }

            return {
                originalPath: moduleName,
                normalizedPath: resolved.resolvedModule.resolvedFileName,
                relativePath: path.relative(
                    path.dirname(fromFile),
                    resolved.resolvedModule.resolvedFileName,
                ),
                isExternal: false,
                language: SupportedLanguage.TYPESCRIPT,
            };
        } catch (error) {
            console.error(
                `Error resolving import ${imported.origin} from ${fromFile}:`,
                error,
            );
            return {
                originalPath: imported.origin,
                normalizedPath: imported.origin,
                relativePath: imported.origin,
                isExternal: true,
            };
        }
    }
}
