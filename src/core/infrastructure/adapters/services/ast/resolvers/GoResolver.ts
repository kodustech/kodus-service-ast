import {
    AliasConfig,
    LanguageResolver,
} from '@/core/domain/ast/contracts/LanguageResolver';
import * as fs from 'fs';
import * as path from 'path';

export class GoResolver implements LanguageResolver {
    private projectRoot: string;
    private aliases: Record<string, AliasConfig> = {};
    private moduleDirectories = ['vendor'];

    async canHandle(projectRoot: string): Promise<boolean> {
        this.projectRoot = projectRoot;

        const goModPath = path.join(projectRoot, 'go.mod');
        if (!fs.existsSync(goModPath)) {
            return false;
        }

        await this.readGoMod(goModPath);
        return true;
    }

    private async readGoMod(goModPath: string): Promise<void> {
        this.aliases = {};
        try {
            const content = await fs.promises.readFile(goModPath, 'utf8');
            const moduleLine = content
                .split('\n')
                .find((line) => line.trim().startsWith('module '));

            if (!moduleLine) return;

            const moduleName = moduleLine.replace('module', '').trim();
            const srcDir = this.projectRoot;

            this.mapGoPackages(moduleName, srcDir);
        } catch (err) {
            console.error('Error parsing go.mod:', err);
        }
    }

    private mapGoPackages(baseModule: string, baseDir: string): void {
        const walk = (dir: string, parts: string[] = []) => {
            const files = fs.readdirSync(dir);
            const hasGoFiles = files.some((f) => f.endsWith('.go'));

            if (hasGoFiles) {
                const importPath = [baseModule, ...parts].join('/');
                const targetPath = path.join(baseDir, ...parts);
                this.aliases[importPath] = {
                    pattern: importPath,
                    target: targetPath,
                };
            }

            for (const file of files) {
                const fullPath = path.join(dir, file);
                const stat = fs.statSync(fullPath);
                if (stat.isDirectory() && !file.startsWith('.')) {
                    walk(fullPath, [...parts, file]);
                }
            }
        };

        walk(baseDir);
    }

    readAliasConfig(): Record<string, AliasConfig> {
        return this.aliases;
    }

    getPriority(): number {
        return 60;
    }

    isExternalModule(importPath: string): boolean {
        if (
            importPath.startsWith('.') ||
            path.isAbsolute(importPath) ||
            Object.keys(this.aliases).some((alias) =>
                importPath.startsWith(alias),
            )
        ) {
            return false;
        }

        return true;
    }

    resolveModulePath(importPath: string, fromFile: string): string {
        if (this.isExternalModule(importPath)) {
            return importPath;
        }

        const match = Object.entries(this.aliases).find(([pattern]) =>
            importPath.startsWith(pattern),
        );

        if (match) {
            const [alias, config] = match;
            const subPath = importPath
                .slice(alias.length)
                .replace(/\//g, path.sep);
            const fullPath = path.join(config.target, subPath);

            if (fs.existsSync(fullPath)) {
                return fullPath;
            }
            return config.target;
        }

        return path.resolve(path.dirname(fromFile), importPath);
    }

    getModuleDirectories(): string[] {
        return this.moduleDirectories;
    }

    getAliasMap(): Record<string, string> {
        return Object.fromEntries(
            Object.entries(this.aliases).map(([pattern, config]) => [
                pattern,
                config.target,
            ]),
        );
    }
}
