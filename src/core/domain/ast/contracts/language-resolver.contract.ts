import { ImportedModule, ResolvedImport } from '../types/language-resolver';

export interface LanguageResolver {
    canHandle(projectRoot: string): Promise<boolean>;
    initialize(): Promise<boolean>;
    resolveImport(imported: ImportedModule, fromFile: string): ResolvedImport;
}
