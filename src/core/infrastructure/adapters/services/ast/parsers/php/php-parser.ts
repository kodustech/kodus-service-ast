import { Language } from 'tree-sitter';
import { BaseParser } from '../base-parser';
import { phpQueries } from './php-queries';
import * as PhpLang from 'tree-sitter-php/php';

export class PhpParser extends BaseParser {
    protected constructorName: string = '__construct';

    protected setupLanguage(): void {
        this.language = PhpLang as Language;
    }

    protected setupQueries(): void {
        this.queries = phpQueries;
    }
}
