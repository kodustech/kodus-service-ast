import { Language } from 'tree-sitter';
import { BaseParser } from '../base-parser';
import { phpQueries } from './php-queries';
import * as PhpLang from 'tree-sitter-php/php';
import { ScopeType } from '@/core/domain/ast/contracts/CodeGraph';
import { QueryType, ParserQuery } from '../query';

export class PhpParser extends BaseParser {
    protected language: Language = PhpLang as Language;
    protected queries: Map<QueryType, ParserQuery> = phpQueries;
    protected scopes: Map<string, ScopeType> = new Map<string, ScopeType>([
        ['class_declaration', ScopeType.CLASS],
        ['interface_declaration', ScopeType.INTERFACE],
        ['enum_declaration', ScopeType.ENUM],

        ['function_declaration', ScopeType.FUNCTION],
        ['method_declaration', ScopeType.METHOD],
        ['assignment_expression', ScopeType.FUNCTION],
    ] as const);
    protected constructorName: string = '__construct';
    protected selfAccessReference: string = '$this';
    protected rootNodeType: string = 'program';
    protected memberChainNodeTypes = {
        mainNodes: [
            'member_call_expression',
            'function_call_expression',
            'member_access_expression',
        ],
        functionNameType: 'name',
        instanceNameTypes: ['variable_name'],
        functionNodeType: 'object',
    };

    protected setupLanguage(): void {
        this.language = PhpLang as Language;
    }
}
