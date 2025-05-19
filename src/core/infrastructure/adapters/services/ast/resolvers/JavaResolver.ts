import {
    AliasConfig,
    LanguageResolver,
} from '@/core/domain/ast/contracts/LanguageResolver';
import * as fs from 'fs';
import * as path from 'path';
import { XMLParser } from 'fast-xml-parser';

interface PomXml {
    project?: {
        groupId?: string;
        artifactId?: string;
        version?: string;
        dependencies?: {
            dependency?:
                | {
                      groupId?: string;
                      artifactId?: string;
                      version?: string;
                      scope?: string;
                  }
                | Array<{
                      groupId?: string;
                      artifactId?: string;
                      version?: string;
                      scope?: string;
                  }>;
        };
        [key: string]: any;
    };
}

export class JavaResolver implements LanguageResolver {
    private projectRoot: string;
    private aliases: Record<string, AliasConfig> = {};
    private moduleDirectories = ['target', 'build', 'out'];

    async canHandle(projectRoot: string): Promise<boolean> {
        this.projectRoot = projectRoot;

        const pomPath = path.join(projectRoot, 'pom.xml');
        const gradlePath = path.join(projectRoot, 'build.gradle');

        if (fs.existsSync(pomPath)) {
            await this.readPomXml(pomPath);
            return true;
        } else if (fs.existsSync(gradlePath)) {
            this.readGradleFile();
            return true;
        }

        return false;
    }

    private async readPomXml(pomPath: string): Promise<void> {
        this.aliases = {};
        try {
            const content = await fs.promises.readFile(pomPath, 'utf8');
            const parser = new XMLParser({ ignoreAttributes: false });
            const parsed = parser.parse(content) as PomXml;

            const groupId = parsed?.project?.groupId || '';
            const artifactId = parsed?.project?.artifactId || '';

            const srcDir = path.join(this.projectRoot, 'src', 'main', 'java');
            this.mapJavaPackages(srcDir, groupId || artifactId);
        } catch (err) {
            console.error('Error parsing pom.xml:', err);
        }
    }

    private readGradleFile(): void {
        this.aliases = {};
        try {
            // Gradle files are not XML, so we extract the default source path manually
            const srcDir = path.join(this.projectRoot, 'src', 'main', 'java');
            const rootPkg = path.basename(this.projectRoot);

            this.mapJavaPackages(srcDir, rootPkg);
        } catch (err) {
            console.error('Error reading build.gradle:', err);
        }
    }

    private mapJavaPackages(srcDir: string, baseAlias: string): void {
        if (!fs.existsSync(srcDir)) return;

        const walk = (dir: string, currentPkg: string[] = []) => {
            const files = fs.readdirSync(dir);
            for (const file of files) {
                const fullPath = path.join(dir, file);
                const stat = fs.statSync(fullPath);
                if (stat.isDirectory()) {
                    walk(fullPath, [...currentPkg, file]);
                } else if (file.endsWith('.java')) {
                    const pkgName = [...currentPkg].join('.');
                    const aliasKey = `${baseAlias}.${pkgName}`;
                    const aliasPath = path.join(srcDir, ...currentPkg);

                    if (!this.aliases[aliasKey]) {
                        this.aliases[aliasKey] = {
                            pattern: aliasKey,
                            target: aliasPath,
                        };
                    }
                }
            }
        };

        walk(srcDir);
    }

    readAliasConfig(): Record<string, AliasConfig> {
        return this.aliases;
    }

    getPriority(): number {
        return 80;
    }

    isExternalModule(importPath: string): boolean {
        // Relative or already resolved is not external
        if (importPath.startsWith('.') || path.isAbsolute(importPath)) {
            return false;
        }

        // Check alias map
        return !Object.keys(this.aliases).some((alias) =>
            importPath.startsWith(alias),
        );
    }

    resolveModulePath(importPath: string, fromFile: string): string {
        if (this.isExternalModule(importPath)) {
            return importPath;
        }

        const match = Object.entries(this.aliases).find(([key]) =>
            importPath.startsWith(key),
        );

        if (match) {
            const [alias, config] = match;
            const subPath = importPath
                .slice(alias.length)
                .replace(/\./g, path.sep);
            const fullPath = path.join(config.target, `${subPath}.java`);
            return fs.existsSync(fullPath) ? fullPath : config.target;
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
