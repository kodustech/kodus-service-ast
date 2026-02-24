import { type LanguageResolver } from '@/core/domain/parsing/contracts/language-resolver.contract.js';
import {
    type ImportedModule,
    type ResolvedImport,
} from '@/core/domain/parsing/types/language-resolver.js';

export class NoOpResolver implements LanguageResolver {
    async canHandle(_projectRoot: string): Promise<boolean> {
        return true;
    }

    async initialize(): Promise<boolean> {
        return true;
    }

    resolveImport(imported: ImportedModule, _fromFile: string): ResolvedImport {
        return {
            originalPath: imported.origin,
            normalizedPath: imported.origin,
            relativePath: imported.origin,
            isExternal: false,
        };
    }
}
