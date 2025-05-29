import { SupportedLanguage } from './SupportedLanguages';

export interface LanguageResolver {
    canHandle(projectRoot: string): Promise<boolean>;
    initialize(): Promise<boolean>;
    resolveImport(imported: ImportedModule, fromFile: string): ResolvedImport;
}
export interface AliasConfig {
    pattern: string;
    target: string;
}

export type ResolvedImport = {
    originalPath: string;
    normalizedPath: string;
    relativePath: string;
    isExternal: boolean;
    language?: SupportedLanguage;
    usedAlias?: string;
};

export type ImportedModule = {
    origin: string;
    imported: {
        symbol: string;
        alias: string | null;
    }[];
};
