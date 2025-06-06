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
};

export const SUPPORTED_LANGUAGES: Record<SupportedLanguage, LanguageConfig> = {
    typescript: {
        name: SupportedLanguage.TYPESCRIPT,
        extensions: ['.ts', '.tsx'],
        defaultExtension: '.ts',
    },
    javascript: {
        name: SupportedLanguage.JAVASCRIPT,
        extensions: ['.js', '.jsx'],
        defaultExtension: '.js',
    },
    python: {
        name: SupportedLanguage.PYTHON,
        extensions: ['.py'],
        defaultExtension: '.py',
    },
    java: {
        name: SupportedLanguage.JAVA,
        extensions: ['.java'],
        defaultExtension: '.java',
    },
    go: {
        name: SupportedLanguage.GO,
        extensions: ['.go'],
        defaultExtension: '.go',
    },
    ruby: {
        name: SupportedLanguage.RUBY,
        extensions: ['.rb'],
        defaultExtension: '.rb',
    },
    php: {
        name: SupportedLanguage.PHP,
        extensions: ['.php'],
        defaultExtension: '.php',
    },
    csharp: {
        name: SupportedLanguage.CSHARP,
        extensions: ['.cs'],
        defaultExtension: '.cs',
    },
    rust: {
        name: SupportedLanguage.RUST,
        extensions: ['.rs'],
        defaultExtension: '.rs',
    },
};
