import { Language, SyntaxNode } from 'tree-sitter';
import { BaseParser } from '../base-parser';
import * as RustLang from 'tree-sitter-rust';
import { rustQueries } from './rust-queries';
import { ParserQuery, QueryType } from '../query';
import { CallChain, ChainType } from '@/core/domain/parsing/types/parser';
import { NodeType, Scope } from '@kodus/kodus-proto/ast/v2';
import { SUPPORTED_LANGUAGES } from '@/core/domain/parsing/types/supported-languages';

export class RustParser extends BaseParser {
    private static readonly language = RustLang as Language;
    private static readonly rawQueries = rustQueries;
    private static readonly constructorName =
        SUPPORTED_LANGUAGES.rust.properties.constructorName;
    private static readonly selfAccessReference =
        SUPPORTED_LANGUAGES.rust.properties.selfAccessReference;
    private static readonly validMemberTypes = new Set([
        'identifier',
        'scoped_identifier',
        'field_identifier',
        'self',
    ] as const);
    private static readonly validFunctionTypes = new Set([
        'identifier',
    ] as const);

    protected override getLanguage(): Language {
        return RustParser.language;
    }
    protected override getRawQueries(): Map<QueryType, ParserQuery> {
        return RustParser.rawQueries;
    }
    protected override getConstructorName(): string {
        return RustParser.constructorName;
    }
    protected override getSelfAccessReference(): string {
        return RustParser.selfAccessReference;
    }
    protected override getValidMemberTypes(): Set<string> {
        return RustParser.validMemberTypes;
    }
    protected override getValidFunctionTypes(): Set<string> {
        return RustParser.validFunctionTypes;
    }

    private static readonly SCOPE_TYPES: Record<string, NodeType> = {
        struct_item: NodeType.NODE_TYPE_CLASS,
        impl_item: NodeType.NODE_TYPE_CLASS,
        trait_item: NodeType.NODE_TYPE_INTERFACE,
        enum_item: NodeType.NODE_TYPE_ENUM,
        function_item: NodeType.NODE_TYPE_FUNCTION,
    };

    protected override processChainNode(
        node: SyntaxNode,
        chain: CallChain[],
    ): boolean {
        switch (node.type) {
            case 'call_expression': {
                const func = node.childForFieldName('function');
                const nodeId = this.mapNodeId(node);

                if (func?.type === 'identifier') {
                    this.addToChain(func, ChainType.FUNCTION, chain, nodeId);
                } else if (chain.length > 0) {
                    chain[chain.length - 1].type = ChainType.FUNCTION;
                }

                return true;
            }
            case 'field_expression': {
                const value = node.childForFieldName('value');
                const field = node.childForFieldName('field');
                const nodeId = this.mapNodeId(node);

                this.addToChain(value, ChainType.MEMBER, chain, nodeId);
                this.addToChain(field, ChainType.MEMBER, chain, nodeId);

                return true;
            }
            case 'macro_invocation': {
                const macro = node.childForFieldName('macro');
                const nodeId = this.mapNodeId(node);

                if (macro?.type === 'identifier') {
                    this.addToChain(macro, ChainType.FUNCTION, chain, nodeId);
                } else if (chain.length > 0) {
                    chain[chain.length - 1].type = ChainType.FUNCTION;
                }

                return true;
            }
            case 'scoped_identifier': {
                const path = node.childForFieldName('path');
                const name = node.childForFieldName('name');
                const nodeId = this.mapNodeId(node);

                this.addToChain(path, ChainType.MEMBER, chain, nodeId);
                this.addToChain(name, ChainType.MEMBER, chain, nodeId);

                return true;
            }
            default:
                return false;
        }
    }

    protected override getScopeTypeForNode(node: SyntaxNode): Scope | null {
        const scopeType = RustParser.SCOPE_TYPES[node.type];
        if (!scopeType) {
            return null;
        }

        let nameNode: SyntaxNode | null = null;
        switch (node.type) {
            case 'impl_item': {
                nameNode = node.childForFieldName('type');
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
            name: nameNode.text,
            type: scopeType,
        };
    }
}
