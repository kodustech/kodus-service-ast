import { Language, SyntaxNode } from 'tree-sitter';
import { BaseParser } from '../base-parser';
import * as CSharpLang from 'tree-sitter-c-sharp';
import { cSharpQueries } from './csharp-queries';
import { ParserQuery, QueryType } from '../query';
import { findNamedChildByType } from '@/shared/utils/ast-helpers';
import { ChainType, CallChain } from '@/core/domain/parsing/types/parser';
import { NodeType, Scope } from '@kodus/kodus-proto/ast/v2';
import { SUPPORTED_LANGUAGES } from '@/core/domain/parsing/types/supported-languages';

export class CSharpParser extends BaseParser {
    private static readonly language = CSharpLang as Language;
    private static readonly rawQueries = cSharpQueries;
    private static readonly constructorName =
        SUPPORTED_LANGUAGES.csharp.properties.constructorName;
    private static readonly selfAccessReference =
        SUPPORTED_LANGUAGES.csharp.properties.selfAccessReference;
    private static readonly validMemberTypes = new Set(['identifier'] as const);
    private static readonly validFunctionTypes = new Set([
        'identifier',
    ] as const);

    protected override getLanguage(): Language {
        return CSharpParser.language;
    }
    protected override getRawQueries(): Map<QueryType, ParserQuery> {
        return CSharpParser.rawQueries;
    }
    protected override getConstructorName(): string {
        return CSharpParser.constructorName;
    }
    protected override getSelfAccessReference(): string {
        return CSharpParser.selfAccessReference;
    }
    protected override getValidMemberTypes(): Set<string> {
        return CSharpParser.validMemberTypes;
    }
    protected override getValidFunctionTypes(): Set<string> {
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
                const nodeId = this.mapNodeId(node);

                if (func?.type === 'identifier') {
                    this.addToChain(func, ChainType.FUNCTION, chain, nodeId);
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

        const nodeId = this.mapNodeId(node);

        this.addToChain(expression, ChainType.MEMBER, chain, nodeId);
        this.addToChain(name, ChainType.MEMBER, chain, nodeId);
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
