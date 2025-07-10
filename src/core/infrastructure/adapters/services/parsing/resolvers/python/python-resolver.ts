import { LanguageResolver } from '@/core/domain/parsing/contracts/language-resolver.contract';
import {
    ImportedModule,
    ResolvedImport,
} from '@/core/domain/parsing/types/language-resolver';
import { SupportedLanguage } from '@/core/domain/parsing/types/supported-languages';
import {
    doesFileExist,
    tryReadFile,
    doesFileExistSync,
} from '@/shared/utils/files';
import { tryParseToml } from '@/shared/utils/parsers';
import * as path from 'path';

type PyprojectToml = {
    tool?: {
        poetry?: {
            dependencies?: Record<string, string>;
            'dev-dependencies'?: Record<string, string>;
        };
        hatch?: {
            dependencies?: string[];
        };
    };
    project?: {
        dependencies?: string[];
        optionalDependencies?: Record<string, string[]>;
    };
};

export class PythonResolver implements LanguageResolver {
    private pyprojectPath: string;
    private requirementsPath: string;
    private setupPath: string;

    protected dependencies: Record<string, string> = {};
    protected projectRoot: string;

    async canHandle(projectRoot: string): Promise<boolean> {
        this.projectRoot = projectRoot;

        const pyproject = path.join(projectRoot, 'pyproject.toml');
        const requirements = path.join(projectRoot, 'requirements.txt');
        const setup = path.join(projectRoot, 'setup.py');

        const hasPyproject = await doesFileExist(pyproject);
        const hasRequirements = await doesFileExist(requirements);
        const hasSetup = await doesFileExist(setup);

        if (hasPyproject) this.pyprojectPath = pyproject;
        if (hasRequirements) this.requirementsPath = requirements;
        if (hasSetup) this.setupPath = setup;

        return hasPyproject || hasRequirements || hasSetup;
    }

    async initialize(): Promise<boolean> {
        if (this.pyprojectPath) await this.loadPyproject();
        if (this.requirementsPath) await this.loadRequirements();
        if (this.setupPath) await this.loadSetup();

        return true;
    }

    private async loadPyproject() {
        const content = await tryReadFile(this.pyprojectPath);
        if (!content) return;

        const parsed = tryParseToml<PyprojectToml>(content);
        if (!parsed) return;

        const poetryDeps = parsed.tool?.poetry?.dependencies || {};
        const poetryDevDeps = parsed.tool?.poetry?.['dev-dependencies'] || {};
        const hatchDeps = parsed.tool?.hatch?.dependencies || [];
        const pepsDeps = parsed.project?.dependencies || [];
        const optionalDeps = parsed.project?.optionalDependencies || {};

        for (const [pkg, version] of Object.entries(poetryDeps)) {
            if (pkg !== 'python') this.dependencies[pkg] = version;
        }
        for (const [pkg, version] of Object.entries(poetryDevDeps)) {
            this.dependencies[pkg] = version;
        }
        for (const dep of hatchDeps) {
            const [pkg] = dep.split(/[<=>]/);
            this.dependencies[pkg.trim()] = dep;
        }
        for (const dep of pepsDeps) {
            const [pkg] = dep.split(/[<=>]/);
            this.dependencies[pkg.trim()] = dep;
        }
        for (const depList of Object.values(optionalDeps)) {
            for (const dep of depList) {
                const [pkg] = dep.split(/[<=>]/);
                this.dependencies[pkg.trim()] = dep;
            }
        }
    }

    private async loadRequirements() {
        const content = await tryReadFile(this.requirementsPath);
        if (!content) return;

        const lines = content
            .split('\n')
            .map((line) => line.trim())
            .filter((line) => line && !line.startsWith('#'));
        for (const line of lines) {
            const [pkg] = line.split(/[<=>]/);
            this.dependencies[pkg.trim()] = line;
        }
    }

    private async loadSetup() {
        const content = await tryReadFile(this.setupPath);
        if (!content) return;

        const regex = /install_requires\s*=\s*\[(.*?)\]/s;
        const match = regex.exec(content);
        if (!match) return;

        const depsString = match[1];
        const deps = depsString
            .split(',')
            .map((d) => d.trim().replace(/['"]/g, ''));

        for (const dep of deps) {
            const [pkg] = dep.split(/[<=>]/);
            this.dependencies[pkg.trim()] = dep;
        }
    }

    resolveImport(imported: ImportedModule, fromFile: string): ResolvedImport {
        const moduleName = imported.origin
            .replace(/\.py$/, '')
            .replace(/\//g, '.');

        // Check if it's an external dependency (top-level module)
        const root = moduleName.split('.')[0];
        if (this.dependencies[root]) {
            return {
                originalPath: moduleName,
                normalizedPath: moduleName,
                relativePath: moduleName,
                isExternal: true,
                language: SupportedLanguage.PYTHON,
            };
        }

        // Local module resolution based on file structure
        const fromDir = path.dirname(fromFile);
        const relativePath =
            path.join(fromDir, ...moduleName.split('.')) + '.py';

        if (doesFileExistSync(relativePath)) {
            return {
                originalPath: moduleName,
                normalizedPath: relativePath,
                relativePath: path.relative(fromDir, relativePath),
                isExternal: false,
                language: SupportedLanguage.PYTHON,
            };
        }

        // Fallback to unresolved (could be installed globally or missing)
        return {
            originalPath: moduleName,
            normalizedPath: moduleName,
            relativePath: moduleName,
            isExternal: false,
            language: SupportedLanguage.PYTHON,
        };
    }
}
