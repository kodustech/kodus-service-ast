import { BaseParser, CallChain, ChainType } from '../base-parser';
import * as TypeScriptLang from 'tree-sitter-typescript/typescript';
import { typeScriptQueries } from './typescript-queries';
import { Language, SyntaxNode } from 'tree-sitter';
import { ScopeType } from '@/core/domain/ast/contracts/CodeGraph';
import { QueryType, ParserQuery } from '../query';

export class TypeScriptParser extends BaseParser {
    protected override queries: Map<QueryType, ParserQuery> = typeScriptQueries;
    protected override scopes: Map<string, ScopeType> = new Map<
        string,
        ScopeType
    >([
        ['class_declaration', ScopeType.CLASS],
        ['abstract_class_declaration', ScopeType.CLASS],
        ['interface_declaration', ScopeType.INTERFACE],
        ['enum_declaration', ScopeType.ENUM],

        ['function_declaration', ScopeType.FUNCTION],
        ['method_definition', ScopeType.METHOD],
        ['variable_declarator', ScopeType.FUNCTION],
    ] as const);
    protected override constructorName: string = 'constructor';
    protected override selfAccessReference: string = 'this';

    protected override validMemberTypes: Set<string> = new Set([
        'identifier',
        'property_identifier',
        'private_property_identifier',
    ]);
    protected override validFunctionTypes: Set<string> = new Set([
        'identifier',
    ]);

    protected override setupLanguage(): void {
        this.language = TypeScriptLang as Language;
    }

    protected override processChainNode(
        node: SyntaxNode,
        chain: CallChain[],
    ): boolean {
        switch (node.type) {
            case 'call_expression': {
                const func = node.childForFieldName('function');

                if (func?.type === 'identifier') {
                    this.addToChain(func, ChainType.FUNCTION, chain, node.id);
                } else if (chain.length > 0) {
                    chain[chain.length - 1].type = ChainType.FUNCTION;
                }

                return true;
            }
            case 'member_expression': {
                const object = node.childForFieldName('object');
                const property = node.childForFieldName('property');

                this.addToChain(object, ChainType.MEMBER, chain, node.id);
                this.addToChain(property, ChainType.MEMBER, chain, node.id);

                return true;
            }
            default:
                return false;
        }
    }
}
