import { BaseParser } from './base-parser';
import * as Path from 'path';
import { TypeScriptParser } from './typescript/typescript-parser';
import { PythonParser } from './python/python-parser';
import { ParseContext } from '../../../../../domain/ast/contracts/Parser';
import { RubyParser } from './ruby/ruby-parser';
import { SUPPORTED_LANGUAGES } from '@/core/domain/ast/contracts/SupportedLanguages';
import { PhpParser } from './php/php-parser';
import { CSharpParser } from './csharp/csharp-parser';
import { JavaParser } from './java/java-parser';
import { RustParser } from './rust/rust-parser';
import { LanguageResolver } from '@/core/domain/ast/contracts/LanguageResolver';

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

    switch (language.name) {
        case SUPPORTED_LANGUAGES.typescript.name:
            return new TypeScriptParser(importPathResolver, context);
        case SUPPORTED_LANGUAGES.javascript.name:
            return new TypeScriptParser(importPathResolver, context);
        case SUPPORTED_LANGUAGES.python.name:
            return new PythonParser(importPathResolver, context);
        case SUPPORTED_LANGUAGES.ruby.name:
            return new RubyParser(importPathResolver, context);
        case SUPPORTED_LANGUAGES.php.name:
            return new PhpParser(importPathResolver, context);
        case SUPPORTED_LANGUAGES.csharp.name:
            return new CSharpParser(importPathResolver, context);
        case SUPPORTED_LANGUAGES.java.name:
            return new JavaParser(importPathResolver, context);
        case SUPPORTED_LANGUAGES.rust.name:
            return new RustParser(importPathResolver, context);
        case SUPPORTED_LANGUAGES.go.name:
            throw new Error('Go parser not implemented yet');
        default:
            throw new Error(`Language not supported: ${language.name}`);
    }
}
