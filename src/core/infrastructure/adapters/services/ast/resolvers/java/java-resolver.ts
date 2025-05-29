import {
    ImportedModule,
    LanguageResolver,
    ResolvedImport,
} from '@/core/domain/ast/contracts/LanguageResolver';
import { SupportedLanguage } from '@/core/domain/ast/contracts/SupportedLanguages';
import {
    doesFileExist,
    tryReadFile,
    doesFileExistSync,
} from '@/shared/utils/files';
import { tryParseXml } from '@/shared/utils/parsers';
import * as path from 'path';

type MavenPom = {
    dependencies?: {
        dependency: Array<{
            groupId: string;
            artifactId: string;
            version?: string;
        }>;
    };
};

type GradleDependencies = Array<{
    group: string;
    name: string;
    version?: string;
}>;

type JMSModule = {
    requires: string[];
    exports: string[];
};

export class JavaResolver implements LanguageResolver {
    private pomPath: string;
    private gradlePath: string;
    private moduleInfoPath: string;

    protected dependencies: Record<string, string> = {};
    protected modules: string[] = [];

    async canHandle(projectRoot: string): Promise<boolean> {
        const pom = path.join(projectRoot, 'pom.xml');
        const gradle = path.join(projectRoot, 'build.gradle');
        const gradleKts = path.join(projectRoot, 'build.gradle.kts');
        const moduleInfo = path.join(
            projectRoot,
            'src',
            'main',
            'java',
            'module-info.java',
        );

        const hasPom = await doesFileExist(pom);
        const hasGradle =
            (await doesFileExist(gradle)) || (await doesFileExist(gradleKts));
        const hasModuleInfo = await doesFileExist(moduleInfo);

        if (hasPom) this.pomPath = pom;
        if (hasGradle)
            this.gradlePath = hasGradle
                ? (await doesFileExist(gradle))
                    ? gradle
                    : gradleKts
                : null;
        if (hasModuleInfo) this.moduleInfoPath = moduleInfo;

        return hasPom || hasGradle || hasModuleInfo;
    }

    async initialize(): Promise<boolean> {
        if (this.pomPath) {
            await this.loadMavenDependencies();
        }
        if (this.gradlePath) {
            await this.loadGradleDependencies();
        }
        if (this.moduleInfoPath) {
            await this.loadJavaModules();
        }

        return true;
    }

    private async loadMavenDependencies() {
        const content = await tryReadFile(this.pomPath);
        if (!content) return;

        const parsed = tryParseXml<MavenPom>(content);
        if (!parsed?.dependencies?.dependency) return;

        for (const dep of parsed.dependencies.dependency) {
            const key = `${dep.groupId}:${dep.artifactId}`;
            this.dependencies[key] = dep.version || 'unknown';
        }
    }

    private async loadGradleDependencies() {
        const content = await tryReadFile(this.gradlePath);
        if (!content) return;

        const regex =
            /['"]([a-zA-Z0-9_.-]+):([a-zA-Z0-9_.-]+):?([a-zA-Z0-9_.-]*)['"]/g;
        let match: RegExpExecArray | null;
        while ((match = regex.exec(content)) !== null) {
            const key = `${match[1]}:${match[2]}`;
            this.dependencies[key] = match[3] || 'unknown';
        }
    }

    private async loadJavaModules() {
        const content = await tryReadFile(this.moduleInfoPath);
        if (!content) return;

        const requiresRegex = /requires\s+([a-zA-Z0-9_.]+);/g;
        let match: RegExpExecArray | null;
        while ((match = requiresRegex.exec(content)) !== null) {
            this.modules.push(match[1]);
        }
    }

    resolveImport(imported: ImportedModule, fromFile: string): ResolvedImport {
        const importName = imported.origin.replace(/;/g, '');

        // Check if it's a JMS module
        if (this.modules.includes(importName)) {
            return {
                originalPath: importName,
                normalizedPath: importName,
                relativePath: importName,
                isExternal: true,
                language: SupportedLanguage.JAVA,
            };
        }

        // Check Maven/Gradle dependencies by matching groupId or artifactId
        const matched = Object.keys(this.dependencies).find((key) =>
            importName.startsWith(key.split(':')[1]),
        );
        if (matched) {
            return {
                originalPath: importName,
                normalizedPath: matched,
                relativePath: matched,
                isExternal: true,
                language: SupportedLanguage.JAVA,
            };
        }

        // Local class resolution based on file structure
        const fromDir = path.dirname(fromFile);
        const pathParts = importName.split('.');
        const candidatePath =
            path.join(fromDir, ...pathParts.slice(-pathParts.length + 1)) +
            '.java';

        if (doesFileExistSync(candidatePath)) {
            return {
                originalPath: importName,
                normalizedPath: candidatePath,
                relativePath: path.relative(fromDir, candidatePath),
                isExternal: false,
                language: SupportedLanguage.JAVA,
            };
        }

        // Fallback to unresolved
        return {
            originalPath: importName,
            normalizedPath: importName,
            relativePath: importName,
            isExternal: false,
            language: SupportedLanguage.JAVA,
        };
    }
}
