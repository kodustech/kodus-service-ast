import { BaseParser } from './base-parser.js';
import * as Path from 'path';
import { TypeScriptParser } from './typescript/typescript-parser.js';
import { PythonParser } from './python/python-parser.js';
import { ParseContext } from '../../../../../domain/parsing/types/parser.js';
import { RubyParser } from './ruby/ruby-parser.js';
import {
    SUPPORTED_LANGUAGES,
    SupportedLanguage,
} from '@/core/domain/parsing/types/supported-languages.js';
import { PhpParser } from './php/php-parser.js';
import { CSharpParser } from './csharp/csharp-parser.js';
import { JavaParser } from './java/java-parser.js';
import { RustParser } from './rust/rust-parser.js';
import { LanguageResolver } from '@/core/domain/parsing/contracts/language-resolver.contract.js';

type ParserFactory = (
    resolver: LanguageResolver,
    context: ParseContext,
) => BaseParser;

const parserFactories: Record<SupportedLanguage, ParserFactory> = {
    typescript: (r, c) => new TypeScriptParser(r, c),
    javascript: (r, c) => new TypeScriptParser(r, c),
    python: (r, c) => new PythonParser(r, c),
    ruby: (r, c) => new RubyParser(r, c),
    php: (r, c) => new PhpParser(r, c),
    csharp: (r, c) => new CSharpParser(r, c),
    java: (r, c) => new JavaParser(r, c),
    rust: (r, c) => new RustParser(r, c),
    go: () => {
        throw new Error('Go parser not implemented yet');
    },
};

export function getParserByFilePath(
    filePath: string,
    importPathResolver: LanguageResolver,
    context: ParseContext,
): BaseParser {
    if (!filePath || filePath.length === 0) {
        throw new Error('Invalid file path');
    }

    const extension = Path.extname(filePath).toLowerCase();
    const language = Object.values(SUPPORTED_LANGUAGES).find((lang) =>
        lang.extensions.includes(extension),
    );

    if (!language) {
        throw new Error(`Language not supported: ${extension}`);
    }

    const factory = parserFactories[language.name];
    if (!factory) {
        throw new Error(`Parser not implemented for: ${language.name}`);
    }

    return factory(importPathResolver, context);
}
