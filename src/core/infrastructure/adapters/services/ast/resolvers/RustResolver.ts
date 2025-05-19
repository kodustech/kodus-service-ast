import {
    AliasConfig,
    LanguageResolver,
} from '@/core/domain/ast/contracts/LanguageResolver';
import * as fs from 'fs';
import * as path from 'path';
import * as toml from 'toml';

interface CargoToml {
    package?: {
        name?: string;
    };
    lib?: {
        name?: string;
        path?: string;
    };
}

export class RustResolver implements LanguageResolver {
    private projectRoot: string;
    private aliases: Record<string, AliasConfig> = {};
    private moduleDirectories = ['target'];

    async canHandle(projectRoot: string): Promise<boolean> {
        this.projectRoot = projectRoot;

        const cargoPath = path.join(projectRoot, 'Cargo.toml');
        if (!fs.existsSync(cargoPath)) {
            return false;
        }

        await this.readCargoToml(cargoPath);
        return true;
    }

    private async readCargoToml(cargoPath: string): Promise<void> {
        this.aliases = {};
        try {
            const content = await fs.promises.readFile(cargoPath, 'utf8');
            const parsed = toml.parse(content) as CargoToml;

            const crateName =
                parsed.lib?.name || parsed.package?.name || 'crate';
            const libPath = parsed.lib?.path
                ? path.join(this.projectRoot, parsed.lib.path)
                : path.join(this.projectRoot, 'src', 'lib.rs');

            const baseDir = path.dirname(libPath);
            if (fs.existsSync(baseDir)) {
                this.mapRustModules(crateName, baseDir);
            }
        } catch (err) {
            console.error('Failed to read Cargo.toml:', err);
        }
    }

    private mapRustModules(crateName: string, baseDir: string): void {
        const walk = (dir: string, parts: string[] = []) => {
            const files = fs.readdirSync(dir);
            for (const file of files) {
                const fullPath = path.join(dir, file);
                const stat = fs.statSync(fullPath);

                if (stat.isDirectory()) {
                    walk(fullPath, [...parts, file]);
                } else if (file.endsWith('.rs')) {
                    const modulePath = [
                        ...parts,
                        file.replace(/\.rs$/, ''),
                    ].join('::');
                    const aliasKey = `${crateName}::${modulePath}`;
                    const aliasPath = path.join(baseDir, ...parts, file);

                    this.aliases[aliasKey] = {
                        pattern: aliasKey,
                        target: aliasPath,
                    };
                }
            }
        };

        walk(baseDir);
    }

    readAliasConfig(): Record<string, AliasConfig> {
        return this.aliases;
    }

    getPriority(): number {
        return 70;
    }

    isExternalModule(importPath: string): boolean {
        if (
            importPath.startsWith('crate') ||
            importPath.startsWith('self') ||
            importPath.startsWith('super')
        ) {
            return false;
        }

        return !Object.keys(this.aliases).some((alias) =>
            importPath.startsWith(alias),
        );
    }

    resolveModulePath(importPath: string, fromFile: string): string {
        if (this.isExternalModule(importPath)) {
            return importPath;
        }

        const match = Object.entries(this.aliases).find(([pattern]) =>
            importPath.startsWith(pattern),
        );

        if (match) {
            return match[1].target;
        }

        // Fallback
        return path.resolve(
            path.dirname(fromFile),
            importPath.replace(/::/g, path.sep) + '.rs',
        );
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
