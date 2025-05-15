import { Language, Query, SyntaxNode } from 'tree-sitter';
import { BaseParser, CallChain, ChainType } from '../base-parser';
import { phpQueries } from './php-queries';
import * as PhpLang from 'tree-sitter-php/php';
import { ScopeType } from '@/core/domain/ast/contracts/CodeGraph';

export class PhpParser extends BaseParser {
    protected override scopes: Map<string, ScopeType> = new Map<
        string,
        ScopeType
    >([
        ['class_declaration', ScopeType.CLASS],
        ['interface_declaration', ScopeType.INTERFACE],
        ['enum_declaration', ScopeType.ENUM],

        ['function_definition', ScopeType.FUNCTION],
        ['method_declaration', ScopeType.METHOD],
        ['assignment_expression', ScopeType.FUNCTION],
    ] as const);
    protected override constructorName: string = '__construct';
    protected override selfAccessReference: string = '$this';

    protected override validMemberTypes: Set<string> = new Set([
        'variable_name',
        'name',
    ]);
    protected override validFunctionTypes: Set<string> = new Set([
        'variable_name',
        'name',
    ]);

    protected override setupLanguage(): void {
        this.language = PhpLang as Language;
    }

    protected override setupQueries(): void {
        for (const [key, value] of phpQueries.entries()) {
            const query = new Query(this.language, value.query);
            this.queries.set(key, query);
        }
    }

    protected override processChainNode(
        node: SyntaxNode,
        chain: CallChain[],
    ): boolean {
        switch (node.type) {
            case 'nullsafe_member_access_expression':
            case 'member_access_expression': {
                const object = node.childForFieldName('object');
                const name = node.childForFieldName('name');

                this.addToChain(object, ChainType.MEMBER, chain, node.id);
                this.addToChain(name, ChainType.MEMBER, chain, node.id);

                return true;
            }
            case 'nullsafe_member_call_expression':
            case 'member_call_expression': {
                const object = node.childForFieldName('object');
                const name = node.childForFieldName('name');

                this.addToChain(object, ChainType.MEMBER, chain, node.id);
                this.addToChain(name, ChainType.FUNCTION, chain, node.id);

                return true;
            }
            case 'function_call_expression': {
                const func = node.childForFieldName('function');

                this.addToChain(func, ChainType.FUNCTION, chain, node.id);

                return true;
            }
            case 'scoped_property_access_expression':
            case 'class_constant_access_expression': {
                const scope = node.childForFieldName('scope');
                const name = node.childForFieldName('name');

                this.addToChain(scope, ChainType.MEMBER, chain, node.id);
                this.addToChain(name, ChainType.MEMBER, chain, node.id);

                return true;
            }
            case 'scoped_call_expression': {
                const scope = node.childForFieldName('scope');
                const name = node.childForFieldName('name');

                this.addToChain(scope, ChainType.MEMBER, chain, node.id);
                this.addToChain(name, ChainType.FUNCTION, chain, node.id);

                return true;
            }
            default:
                return false;
        }
    }
}
