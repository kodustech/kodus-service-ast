import {
    SupportedLanguage,
    getLanguageConfigForFilePath,
} from '@/core/domain/parsing/types/supported-languages.js';
import { PinoLoggerService } from '@/core/infrastructure/adapters/services/logger/pino.service.js';
import {
    ValidateCodeItem,
    ValidateCodeRequest,
    ValidateCodeResponse,
    ValidateCodeResult,
    ValidationStatus,
} from '@/shared/types/ast.js';
import { Injectable } from '@nestjs/common';
import { createRequire } from 'module';
import Parser from 'tree-sitter';

const require = createRequire(import.meta.url);

@Injectable()
export class ValidateCodeUseCase {
    private parser: Parser;
    private languages = new Map<string, any>();

    constructor(private readonly logger: PinoLoggerService) {
        this.parser = new Parser();
        this.initializeLanguages();
    }

    private initializeLanguages() {
        try {
            // TypeScript
            try {
                const TreeSitterTypeScript = require('tree-sitter-typescript');
                this.languages.set(
                    SupportedLanguage.TYPESCRIPT,
                    TreeSitterTypeScript.typescript,
                );
                this.languages.set(
                    SupportedLanguage.JAVASCRIPT,
                    TreeSitterTypeScript.typescript,
                );
            } catch {
                // Ignore if not found
            }

            // JavaScript (Try specific parser, override if successful)
            try {
                const TreeSitterJavaScript = require('tree-sitter-javascript');
                this.languages.set(
                    SupportedLanguage.JAVASCRIPT,
                    TreeSitterJavaScript,
                );
            } catch {
                // Keep typescript parser if js parser fails
            }

            // Python
            try {
                const TreeSitterPython = require('tree-sitter-python');
                this.languages.set(SupportedLanguage.PYTHON, TreeSitterPython);
            } catch {}

            // Java
            try {
                const TreeSitterJava = require('tree-sitter-java');
                this.languages.set(SupportedLanguage.JAVA, TreeSitterJava);
            } catch {}

            // Go
            try {
                const TreeSitterGo = require('tree-sitter-go');
                this.languages.set(SupportedLanguage.GO, TreeSitterGo);
            } catch {}

            // Ruby
            try {
                const TreeSitterRuby = require('tree-sitter-ruby');
                this.languages.set(SupportedLanguage.RUBY, TreeSitterRuby);
            } catch {}

            // PHP
            try {
                const TreeSitterPhp = require('tree-sitter-php');
                this.languages.set(SupportedLanguage.PHP, TreeSitterPhp);
            } catch {}

            // C#
            try {
                const TreeSitterCSharp = require('tree-sitter-c-sharp');
                this.languages.set(SupportedLanguage.CSHARP, TreeSitterCSharp);
            } catch {}

            // Rust
            try {
                const TreeSitterRust = require('tree-sitter-rust');
                this.languages.set(SupportedLanguage.RUST, TreeSitterRust);
            } catch {}
        } catch (error) {
            this.logger.warn({
                message: 'Failed to load some tree-sitter languages',
                error,
                context: ValidateCodeUseCase.name,
            });
        }
    }

    async execute(params: ValidateCodeRequest): Promise<ValidateCodeResponse> {
        const { files } = params;
        const results: ValidateCodeResult[] = [];

        for (const file of files) {
            results.push(this.validateFile(file));
        }

        return { results };
    }

    private validateFile(file: ValidateCodeItem): ValidateCodeResult {
        const { id, encodedData, language, filePath } = file;

        try {
            const decodedData = Buffer.from(encodedData, 'base64').toString(
                'utf-8',
            );

            let langName = language;

            if (!langName) {
                const config = getLanguageConfigForFilePath(filePath);
                if (config) {
                    langName = config.name;
                }
            }

            if (!langName) {
                return {
                    id,
                    isValid: false,
                    status: ValidationStatus.UNSUPPORTED_LANGUAGE,
                    error: `Could not determine language for file: ${filePath}`,
                    filePath,
                };
            }

            const lang = this.languages.get(langName);
            if (!lang) {
                return {
                    id,
                    isValid: false,
                    status: ValidationStatus.UNSUPPORTED_LANGUAGE,
                    error: `Unsupported or unloaded language: ${langName}`,
                    filePath,
                };
            }

            this.parser.setLanguage(lang);
            const tree = this.parser.parse(decodedData);
            const hasError = tree.rootNode.hasError;

            return {
                id,
                isValid: !hasError,
                status: hasError
                    ? ValidationStatus.INVALID_SYNTAX
                    : ValidationStatus.VALID,
                filePath,
            };
        } catch (error) {
            const message = `Failed to validate code: ${(error as Error).message}`;
            this.logger.error({
                message,
                context: ValidateCodeUseCase.name,
                metadata: {
                    language,
                    filePath,
                },
                error,
            });

            return {
                id,
                isValid: false,
                status: ValidationStatus.ERROR,
                error: message,
                filePath,
            };
        }
    }
}
