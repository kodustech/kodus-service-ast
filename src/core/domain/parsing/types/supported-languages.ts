import * as path from 'path';

export enum SupportedLanguage {
    TYPESCRIPT = 'typescript',
    JAVASCRIPT = 'javascript',
    PYTHON = 'python',
    JAVA = 'java',
    GO = 'go',
    RUBY = 'ruby',
    PHP = 'php',
    CSHARP = 'csharp',
    RUST = 'rust',
}

export type LanguageConfig = {
    name: SupportedLanguage;
    extensions: string[];
    defaultExtension: string;
    properties: LanguageProperties;
};

export type LanguageProperties = {
    constructorName: string;
    selfAccessReference: string;
    comments: string[];
};

export const SUPPORTED_LANGUAGES: Record<SupportedLanguage, LanguageConfig> = {
    typescript: {
        name: SupportedLanguage.TYPESCRIPT,
        extensions: ['.ts', '.tsx'],
        defaultExtension: '.ts',
        properties: {
            constructorName: 'constructor',
            selfAccessReference: 'this',
            comments: ['//', '/*', '*/', '*'],
        },
    },
    javascript: {
        name: SupportedLanguage.JAVASCRIPT,
        extensions: ['.js', '.jsx'],
        defaultExtension: '.js',
        properties: {
            constructorName: 'constructor',
            selfAccessReference: 'this',
            comments: ['//', '/*', '*/', '*'],
        },
    },
    python: {
        name: SupportedLanguage.PYTHON,
        extensions: ['.py'],
        defaultExtension: '.py',
        properties: {
            constructorName: '__init__',
            selfAccessReference: 'self',
            comments: ['#'],
        },
    },
    java: {
        name: SupportedLanguage.JAVA,
        extensions: ['.java'],
        defaultExtension: '.java',
        properties: {
            constructorName: 'constructor',
            selfAccessReference: 'this',
            comments: ['//', '/*', '*/', '*'],
        },
    },
    go: {
        name: SupportedLanguage.GO,
        extensions: ['.go'],
        defaultExtension: '.go',
        properties: {
            constructorName: '',
            selfAccessReference: '',
            comments: ['//', '/*', '*/', '*'],
        },
    },
    ruby: {
        name: SupportedLanguage.RUBY,
        extensions: ['.rb'],
        defaultExtension: '.rb',
        properties: {
            constructorName: 'initialize',
            selfAccessReference: 'self',
            comments: ['#'],
        },
    },
    php: {
        name: SupportedLanguage.PHP,
        extensions: ['.php'],
        defaultExtension: '.php',
        properties: {
            constructorName: '__construct',
            selfAccessReference: '$this',
            comments: ['//', '/*', '*/', '*'],
        },
    },
    csharp: {
        name: SupportedLanguage.CSHARP,
        extensions: ['.cs'],
        defaultExtension: '.cs',
        properties: {
            constructorName: 'constructor',
            selfAccessReference: 'this',
            comments: ['//', '/*', '*/', '*'],
        },
    },
    rust: {
        name: SupportedLanguage.RUST,
        extensions: ['.rs'],
        defaultExtension: '.rs',
        properties: {
            constructorName: '',
            selfAccessReference: 'self',
            comments: ['//', '/*', '*/', '*'],
        },
    },
};

export function getLanguageConfig(language: SupportedLanguage): LanguageConfig {
    const config = SUPPORTED_LANGUAGES[language];
    if (!config) {
        throw new Error(`Unsupported language: ${language}`);
    }
    return config;
}

export function getLanguageConfigForFilePath(
    filePath: string,
): LanguageConfig | undefined {
    const ext = path.extname(filePath);
    return Object.values(SUPPORTED_LANGUAGES).find((lang) =>
        lang.extensions.includes(ext),
    );
}

export function getLanguageConfigByExtension(
    extension: string,
): LanguageConfig | undefined {
    return Object.values(SUPPORTED_LANGUAGES).find((lang) =>
        lang.extensions.includes(extension),
    );
}
