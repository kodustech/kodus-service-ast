import { BaseParser, CallChain, ChainType } from '../base-parser';
import * as TypeScriptLang from 'tree-sitter-typescript/typescript';
import { typeScriptQueries } from './typescript-queries';
import { Language, Query, SyntaxNode } from 'tree-sitter';
import { ScopeType } from '@/core/domain/ast/contracts/CodeGraph';

export class TypeScriptParser extends BaseParser {
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

    protected override setupQueries(): void {
        for (const [key, value] of typeScriptQueries.entries()) {
            const query = new Query(this.language, value.query);
            this.queries.set(key, query);
        }
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
                this.processMemberExpression(node, chain);

                return true;
            }
            default:
                return false;
        }
    }

    private processMemberExpression(
        node: SyntaxNode,
        chain: CallChain[],
        depth: number = 0,
    ): void {
        if (depth > 1) {
            return;
        }

        const object = node.childForFieldName('object');
        const property = node.childForFieldName('property');

        if (object?.type === 'member_expression') {
            this.processMemberExpression(object, chain, depth + 1);
        }

        this.addToChain(object, ChainType.MEMBER, chain, node.id);
        this.addToChain(property, ChainType.MEMBER, chain, node.id);
    }
}
