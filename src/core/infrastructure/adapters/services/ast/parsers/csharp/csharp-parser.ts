import { Language, SyntaxNode } from 'tree-sitter';
import { BaseParser } from '../base-parser';
import * as CSharpLang from 'tree-sitter-c-sharp';
import { cSharpQueries } from './csharp-queries';
import { Scope, ScopeType } from '@/core/domain/ast/types/parser';
import { ParserQuery, QueryType } from '../query';
import { findNamedChildByType } from '@/shared/utils/ast-helpers';
import { ChainType, CallChain } from '@/core/domain/ast/types/parser';

export class CSharpParser extends BaseParser {
    private static readonly language = CSharpLang as Language;
    private static readonly rawQueries = cSharpQueries;
    private static readonly constructorName = 'constructor';
    private static readonly selfAccessReference = 'this';
    private static readonly validMemberTypes = new Set(['identifier'] as const);
    private static readonly validFunctionTypes = new Set([
        'identifier',
    ] as const);

    protected getLanguage(): Language {
        return CSharpParser.language;
    }
    protected getRawQueries(): Map<QueryType, ParserQuery> {
        return CSharpParser.rawQueries;
    }
    protected getConstructorName(): string {
        return CSharpParser.constructorName;
    }
    protected getSelfAccessReference(): string {
        return CSharpParser.selfAccessReference;
    }
    protected getValidMemberTypes(): Set<string> {
        return CSharpParser.validMemberTypes;
    }
    protected getValidFunctionTypes(): Set<string> {
        return CSharpParser.validFunctionTypes;
    }

    private static readonly SCOPE_TYPES: Record<string, ScopeType> = {
        class_declaration: ScopeType.CLASS,
        record_declaration: ScopeType.CLASS,
        struct_declaration: ScopeType.CLASS,
        interface_declaration: ScopeType.INTERFACE,
        enum_declaration: ScopeType.ENUM,
        constructor_declaration: ScopeType.METHOD,
        method_declaration: ScopeType.METHOD,
        variable_declarator: ScopeType.FUNCTION,
    };

    protected override processChainNode(
        node: SyntaxNode,
        chain: CallChain[],
    ): boolean {
        switch (node.type) {
            case 'invocation_expression': {
                const func = node.childForFieldName('function');

                if (func?.type === 'identifier') {
                    this.addToChain(func, ChainType.FUNCTION, chain, node.id);
                } else if (chain.length > 0) {
                    chain[chain.length - 1].type = ChainType.FUNCTION;
                }

                return true;
            }
            case 'member_access_expression': {
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

        const expression = node.childForFieldName('expression');
        const name = node.childForFieldName('name');

        if (expression?.type === 'member_access_expression') {
            this.processMemberExpression(expression, chain, depth + 1);
        }

        this.addToChain(expression, ChainType.MEMBER, chain, node.id);
        this.addToChain(name, ChainType.MEMBER, chain, node.id);
    }

    protected override getScopeTypeForNode(node: SyntaxNode): Scope | null {
        const scopeType = CSharpParser.SCOPE_TYPES[node.type];
        if (!scopeType) {
            return null;
        }

        let nameNode: SyntaxNode | null = null;
        switch (node.type) {
            case 'variable_declarator': {
                const anonymous = findNamedChildByType(
                    node,
                    'anonymous_method_expression',
                );
                if (!anonymous) {
                    return null;
                }
                nameNode = node.childForFieldName('name');
                break;
            }
            default: {
                nameNode = node.childForFieldName('name');
                break;
            }
        }
        if (!nameNode) {
            return null;
        }

        return {
            type: scopeType,
            name: nameNode.text,
        };
    }
}
