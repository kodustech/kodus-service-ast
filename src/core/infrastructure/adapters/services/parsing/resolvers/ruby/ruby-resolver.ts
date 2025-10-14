import { LanguageResolver } from '@/core/domain/parsing/contracts/language-resolver.contract.js';
import {
    ImportedModule,
    ResolvedImport,
} from '@/core/domain/parsing/types/language-resolver.js';
import { SupportedLanguage } from '@/core/domain/parsing/types/supported-languages.js';
import {
    doesFileExist,
    tryReadFile,
    doesFileExistSync,
} from '@/shared/utils/files.js';
import * as path from 'path';

export class RubyResolver implements LanguageResolver {
    private gemfilePath!: string;
    private gemfileLockPath!: string;

    protected dependencies: Record<string, string> = {};
    protected projectRoot!: string;

    async canHandle(projectRoot: string): Promise<boolean> {
        this.projectRoot = projectRoot;

        const gemfile = path.join(projectRoot, 'Gemfile');
        const gemfileLock = path.join(projectRoot, 'Gemfile.lock');

        const hasGemfile = await doesFileExist(gemfile);
        const hasGemfileLock = await doesFileExist(gemfileLock);

        if (hasGemfile) {
            this.gemfilePath = gemfile;
        }
        if (hasGemfileLock) {
            this.gemfileLockPath = gemfileLock;
        }

        return hasGemfile || hasGemfileLock;
    }

    async initialize(): Promise<boolean> {
        if (this.gemfileLockPath) {
            await this.loadGemfileLock();
        } else if (this.gemfilePath) {
            await this.loadGemfile();
        }
        return true;
    }

    private async loadGemfile() {
        const content = await tryReadFile(this.gemfilePath);
        if (!content) {
            return;
        }

        // Simple regex for `gem 'gem_name', 'version'`
        const gemRegex = /gem\s+['"]([^'"]+)['"](?:,\s*['"]([^'"]+)['"])?/g;
        let match: RegExpExecArray | null;
        while ((match = gemRegex.exec(content)) !== null) {
            const gemName = match[1];
            const version = match[2] || 'latest';
            this.dependencies[gemName] = version;
        }
    }

    private async loadGemfileLock() {
        const content = await tryReadFile(this.gemfileLockPath);
        if (!content) {
            return;
        }

        // Parse Gemfile.lock simple format (top-level gems only)
        // Sections start with "GEM"
        // Under "GEM", dependencies listed as:
        //   gem_name (version)
        // For simplicity, parse lines with pattern: `  gem_name (version)`
        const gemSectionStart = content.indexOf('GEM');
        if (gemSectionStart === -1) {
            return;
        }

        const gemSection = content.slice(gemSectionStart);
        const gemLines = gemSection
            .split('\n')
            .filter((line) => /^\s{2}[^ ]/.test(line));

        for (const line of gemLines) {
            const m = /^\s{2}([\w-]+) \((.+)\)/.exec(line);
            if (m) {
                const gemName = m[1];
                const version = m[2];
                this.dependencies[gemName] = version;
            }
        }
    }

    resolveImport(imported: ImportedModule, fromFile: string): ResolvedImport {
        const importName = imported.origin;

        // Check if it is an external gem
        if (this.dependencies[importName]) {
            return {
                originalPath: importName,
                normalizedPath: importName,
                relativePath: importName,
                isExternal: true,
                language: SupportedLanguage.RUBY,
            };
        }

        // Resolve relative requires: might be './foo', 'foo/bar'
        // If it starts with '.' treat as relative path; otherwise try relative from file
        let resolvedPath: string;

        if (importName.startsWith('.')) {
            resolvedPath =
                path.resolve(path.dirname(fromFile), importName) + '.rb';
        } else {
            // Try relative to fromFile dir + importName.rb
            resolvedPath =
                path.resolve(
                    path.dirname(fromFile),
                    importName.replace(/\./g, '/'),
                ) + '.rb';
        }

        if (doesFileExistSync(resolvedPath)) {
            return {
                originalPath: importName,
                normalizedPath: resolvedPath,
                relativePath: path.relative(
                    path.dirname(fromFile),
                    resolvedPath,
                ),
                isExternal: false,
                language: SupportedLanguage.RUBY,
            };
        }

        // fallback unresolved
        return {
            originalPath: importName,
            normalizedPath: importName,
            relativePath: importName,
            isExternal: false,
            language: SupportedLanguage.RUBY,
        };
    }
}
