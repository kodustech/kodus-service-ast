import { Language } from 'tree-sitter';
import { BaseParser } from '../base-parser';
import { phpQueries } from './php-queries';
import * as PhpLang from 'tree-sitter-php/php';
import { ScopeType } from '@/core/domain/ast/contracts/CodeGraph';
import { QueryType, ParserQuery } from '../query';

export class PhpParser extends BaseParser {
    protected queries: Map<QueryType, ParserQuery> = phpQueries;
    protected scopes: Map<string, ScopeType> = new Map<string, ScopeType>([
        ['class_declaration', ScopeType.CLASS],
        ['interface_declaration', ScopeType.INTERFACE],
        ['enum_declaration', ScopeType.ENUM],

        ['function_definition', ScopeType.FUNCTION],
        ['method_declaration', ScopeType.METHOD],
        ['assignment_expression', ScopeType.FUNCTION],
    ] as const);
    protected constructorName: string = '__construct';
    protected selfAccessReference: string = '$this';
    protected rootNodeType: string = 'program';
    protected memberChainNodeTypes = {
        callNodeTypes: [
            'function_call_expression',

            'member_call_expression',
            'nullsafe_member_call_expression',
            'scoped_call_expression',
        ],
        memberNodeTypes: [
            'member_access_expression',
            'nullsafe_member_access_expression',
        ],
        functionNameFields: ['name'],
        instanceNameTypes: ['variable_name', 'name'],
        functionChildFields: ['object'],
    };

    protected setupLanguage(): void {
        this.language = PhpLang as Language;
    }
}
