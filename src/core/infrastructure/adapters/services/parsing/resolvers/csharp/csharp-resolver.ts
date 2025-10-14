import { LanguageResolver } from '@/core/domain/parsing/contracts/language-resolver.contract.js';
import {
    ImportedModule,
    ResolvedImport,
} from '@/core/domain/parsing/types/language-resolver.js';
import { SupportedLanguage } from '@/core/domain/parsing/types/supported-languages.js';
import { tryReadFile, doesFileExistSync } from '@/shared/utils/files.js';
import { tryParseXml } from '@/shared/utils/parsers.js';
import { readdir } from 'fs/promises';
import * as path from 'path';

interface Csproj {
    // eslint-disable-next-line @typescript-eslint/naming-convention
    Project: {
        // eslint-disable-next-line @typescript-eslint/naming-convention
        ItemGroup?: Array<{
            // eslint-disable-next-line @typescript-eslint/naming-convention
            PackageReference?: Array<{
                // eslint-disable-next-line @typescript-eslint/naming-convention
                $: { Include: string; Version?: string };
                // eslint-disable-next-line @typescript-eslint/naming-convention
                Version?: string[];
            }>;
            // eslint-disable-next-line @typescript-eslint/naming-convention
            ProjectReference?: Array<{ $: { Include: string } }>;
        }>;
    };
}

export class CSharpResolver implements LanguageResolver {
    private csprojPath!: string;
    protected dependencies: Record<string, string> = {};
    protected projectReferences: string[] = [];
    protected projectRoot!: string;

    async canHandle(projectRoot: string): Promise<boolean> {
        this.projectRoot = projectRoot;

        const files = await readdir(projectRoot);
        const csprojFiles = files.filter((f) => f.endsWith('.csproj'));
        if (csprojFiles.length === 0) {
            return false;
        }

        this.csprojPath = path.join(projectRoot, csprojFiles[0]);
        return true;
    }

    async initialize(): Promise<boolean> {
        if (!this.csprojPath) {
            console.error('No .csproj file found.');
            return false;
        }

        const content = await tryReadFile(this.csprojPath);
        if (!content) {
            return false;
        }

        const parsed = tryParseXml<Csproj>(content);
        if (!parsed) {
            console.error('Failed to parse .csproj XML');
            return false;
        }

        const project = parsed.Project;
        if (!project || !project.ItemGroup) {
            return false;
        }

        for (const itemGroup of project.ItemGroup) {
            // PackageReference: <PackageReference Include="Newtonsoft.Json" Version="13.0.1" />
            if (itemGroup.PackageReference) {
                for (const pkgRef of itemGroup.PackageReference) {
                    const include = pkgRef.$?.Include;
                    const version =
                        pkgRef.$?.Version ||
                        (pkgRef.Version && pkgRef.Version[0]);
                    if (include) {
                        this.dependencies[include] = version || 'latest';
                    }
                }
            }

            // ProjectReference: <ProjectReference Include="..\MyLib\MyLib.csproj" />
            if (itemGroup.ProjectReference) {
                for (const projRef of itemGroup.ProjectReference) {
                    const include = projRef.$?.Include;
                    if (include) {
                        this.projectReferences.push(
                            path.resolve(
                                path.dirname(this.csprojPath),
                                include,
                            ),
                        );
                    }
                }
            }
        }

        return true;
    }

    resolveImport(imported: ImportedModule, fromFile: string): ResolvedImport {
        const namespaceName = imported.origin;

        if (this.dependencies[namespaceName]) {
            return {
                originalPath: namespaceName,
                normalizedPath: namespaceName,
                relativePath: namespaceName,
                isExternal: true,
                language: SupportedLanguage.CSHARP,
            };
        }

        const relativePathParts = namespaceName.split('.');
        const localPath =
            path.join(this.projectRoot, ...relativePathParts) + '.cs';

        if (doesFileExistSync(localPath)) {
            return {
                originalPath: namespaceName,
                normalizedPath: localPath,
                relativePath: path.relative(path.dirname(fromFile), localPath),
                isExternal: false,
                language: SupportedLanguage.CSHARP,
            };
        }

        return {
            originalPath: namespaceName,
            normalizedPath: namespaceName,
            relativePath: namespaceName,
            isExternal: true,
            language: SupportedLanguage.CSHARP,
        };
    }
}
