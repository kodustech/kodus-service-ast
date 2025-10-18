import { type SupportedLanguage } from './supported-languages.js';

export type AliasConfig = {
    pattern: string;
    target: string;
};

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
