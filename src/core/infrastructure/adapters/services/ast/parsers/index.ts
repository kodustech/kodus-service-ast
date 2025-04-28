import { BaseParser } from './base-parser';
import * as Path from 'path';
import { TypeScriptParser } from './typescript/typescript-parser';
import { PythonParser } from './python/python-parser';
import { ImportPathResolverService } from '../import-path-resolver.service';
import { ParseContext } from '../../../../../domain/ast/contracts/Parser';
import { RubyParser } from './ruby/ruby-parser';
import { SUPPORTED_LANGUAGES } from '@/core/domain/ast/contracts/SupportedLanguages';
import { PhpParser } from './php/php-parser';

export function getParserByFilePath(
    filePath: string,
    importPathResolver: ImportPathResolverService,
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
        default:
            throw new Error(`Language not supported: ${language.name}`);
    }
}
