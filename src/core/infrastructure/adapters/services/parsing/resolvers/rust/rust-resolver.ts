import { LanguageResolver } from '@/core/domain/parsing/contracts/language-resolver.contract';
import {
    ImportedModule,
    ResolvedImport,
} from '@/core/domain/parsing/types/language-resolver';
import * as path from 'path';
import { SupportedLanguage } from '@/core/domain/parsing/types/supported-languages';
import {
    doesFileExist,
    doesFileExistSync,
    tryReadFile,
} from '@/shared/utils/files';
import { tryParseToml } from '@/shared/utils/parsers';

type CargoToml = {
    dependencies?: Record<string, string>;
    'dev-dependencies'?: Record<string, string>;
    'build-dependencies'?: Record<string, string>;
};

export class RustResolver implements LanguageResolver {
    private cargoTomlPath: string;
    protected dependencies: Record<string, string> = {};

    async canHandle(projectRoot: string): Promise<boolean> {
        const cargoTomlPath = path.join(projectRoot, 'Cargo.toml');
        const exists = await doesFileExist(cargoTomlPath);
        if (exists) {
            this.cargoTomlPath = cargoTomlPath;
        }
        return exists;
    }

    async initialize(): Promise<boolean> {
        if (!this.cargoTomlPath) {
            console.error('Cargo.toml path is not set.');
            return false;
        }

        const content = await tryReadFile(this.cargoTomlPath);
        if (!content) return false;

        const parsed = tryParseToml<CargoToml>(content);
        if (!parsed) return false;

        this.dependencies = {
            ...(parsed.dependencies || {}),
            ...(parsed['dev-dependencies'] || {}),
            ...(parsed['build-dependencies'] || {}),
        };

        return true;
    }

    resolveImport(imported: ImportedModule, fromFile: string): ResolvedImport {
        let moduleName = imported.origin;

        if (moduleName.startsWith('crate')) {
            moduleName = imported.imported.map((m) => m.symbol).join('::');
        }

        // Check if it's an external crate
        if (this.dependencies[moduleName]) {
            return {
                originalPath: moduleName,
                normalizedPath: moduleName,
                relativePath: moduleName,
                isExternal: true,
                language: SupportedLanguage.RUST,
            };
        }

        // Local module resolution based on Rust's mod system
        const fromDir = path.dirname(fromFile);

        const candidates = [
            path.join(fromDir, `${moduleName}.rs`),
            path.join(fromDir, moduleName, 'mod.rs'),
            path.join(fromDir, moduleName, `${moduleName}.rs`),
        ];

        const resolvedPath = candidates.find((p) => doesFileExistSync(p));

        if (resolvedPath) {
            return {
                originalPath: moduleName,
                normalizedPath: resolvedPath,
                relativePath: path.relative(fromDir, resolvedPath),
                isExternal: false,
                language: SupportedLanguage.RUST,
            };
        }

        // Fallback: unresolved, assume external (may happen in macro imports or generated code)
        return {
            originalPath: moduleName,
            normalizedPath: moduleName,
            relativePath: moduleName,
            isExternal: true,
            language: SupportedLanguage.RUST,
        };
    }
}
