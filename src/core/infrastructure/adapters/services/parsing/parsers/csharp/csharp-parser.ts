import { Language, SyntaxNode } from 'tree-sitter';
import { BaseParser } from '../base-parser';
import * as CSharpLang from 'tree-sitter-c-sharp';
import { cSharpQueries } from './csharp-queries';
import { ParserQuery, QueryType } from '../query';
import { findNamedChildByType } from '@/shared/utils/ast-helpers';
import { ChainType, CallChain } from '@/core/domain/parsing/types/parser';
import { NodeType, Scope } from '@kodus/kodus-proto/ast/v2';

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

    private static readonly SCOPE_TYPES: Record<string, NodeType> = {
        class_declaration: NodeType.NODE_TYPE_CLASS,
        record_declaration: NodeType.NODE_TYPE_CLASS,
        struct_declaration: NodeType.NODE_TYPE_CLASS,
        interface_declaration: NodeType.NODE_TYPE_INTERFACE,
        enum_declaration: NodeType.NODE_TYPE_ENUM,
        constructor_declaration: NodeType.NODE_TYPE_FUNCTION,
        method_declaration: NodeType.NODE_TYPE_FUNCTION,
        variable_declarator: NodeType.NODE_TYPE_FUNCTION,
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
