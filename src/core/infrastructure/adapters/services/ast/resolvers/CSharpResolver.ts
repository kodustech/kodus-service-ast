import {
    AliasConfig,
    LanguageResolver,
} from '@/core/domain/ast/contracts/LanguageResolver';
import * as fs from 'fs';
import * as path from 'path';
import { XMLParser } from 'fast-xml-parser';

interface CompileItem {
    Include: string;
}

interface ItemGroup {
    Compile?: CompileItem[] | CompileItem;
    [key: string]: any;
}

interface CsProjStructure {
    Project: {
        ItemGroup: ItemGroup[] | ItemGroup;
        [key: string]: any;
    };
}

export class CSharpResolver implements LanguageResolver {
    private projectRoot: string;
    private moduleDirectories = ['packages'];
    private aliases: Record<string, AliasConfig> = {};

    async canHandle(filePath: string): Promise<boolean> {
        this.projectRoot = filePath;

        try {
            const csprojFiles = await fs.promises.readdir(filePath);
            const csprojFile = csprojFiles.find((file) =>
                file.endsWith('.csproj'),
            );

            if (!csprojFile) {
                return false;
            }

            const csprojPath = path.join(filePath, csprojFile);

            await this.readCsProj(csprojPath);

            return true;
        } catch (error) {
            console.error('Error in canHandle (C#): ', error);
            return false;
        }
    }

    private async readCsProj(csprojPath: string): Promise<void> {
        this.aliases = {};

        try {
            const content = await fs.promises.readFile(csprojPath, 'utf8');
            const parser = new XMLParser({
                ignoreAttributes: false,
                attributeNamePrefix: '',
            });
            const parsed = parser.parse(content) as CsProjStructure;

            const itemGroups = parsed?.Project?.ItemGroup;

            const compileItems: string[] = [];

            const processCompileGroup = (group: ItemGroup) => {
                const { Compile } = group;
                if (!Compile) return;

                if (Array.isArray(Compile)) {
                    compileItems.push(...Compile.map((item) => item.Include));
                } else if (Compile.Include) {
                    compileItems.push(Compile.Include);
                }
            };

            if (Array.isArray(itemGroups)) {
                itemGroups.forEach(processCompileGroup);
            } else if (itemGroups) {
                processCompileGroup(itemGroups);
            }

            for (const includePath of compileItems) {
                const aliasName = path.basename(includePath, '.cs');
                const fullPath = path.join(this.projectRoot, includePath);
                this.aliases[aliasName] = {
                    pattern: aliasName,
                    target: fullPath,
                };
            }
        } catch (error) {
            console.error('Error reading/parsing .csproj file:', error);
            this.aliases = {};
        }
    }

    readAliasConfig(): Record<string, AliasConfig> {
        return this.aliases;
    }

    getPriority(): number {
        return 85;
    }

    isExternalModule(importPath: string): boolean {
        if (
            importPath.startsWith('.') ||
            path.isAbsolute(importPath) ||
            this.aliases[importPath]
        ) {
            return false;
        }

        const fullPath = path.join(this.projectRoot, importPath);
        return !fs.existsSync(fullPath);
    }

    resolveModulePath(importPath: string, fromFile: string): string {
        if (this.isExternalModule(importPath)) {
            return importPath;
        }

        if (this.aliases[importPath]) {
            return this.aliases[importPath].target;
        }

        const resolvedPath = path.resolve(path.dirname(fromFile), importPath);
        return fs.existsSync(resolvedPath) ? resolvedPath : importPath;
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
