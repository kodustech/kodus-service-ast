import { Language, SyntaxNode } from 'tree-sitter';
import { BaseParser } from '../base-parser';
import * as RustLang from 'tree-sitter-rust';
import { rustQueries } from './rust-queries';
import { Scope, ScopeType } from '@/core/domain/ast/contracts/Parser';
import { QueryType, ParserQuery } from '../query';
import { CallChain, ChainType } from '@/core/domain/ast/contracts/Parser';

export class RustParser extends BaseParser {
    private static readonly language = RustLang as Language;
    private static readonly rawQueries = rustQueries;
    private static readonly constructorName = '';
    private static readonly selfAccessReference = 'self';
    private static readonly validMemberTypes = new Set([
        'identifier',
        'scoped_identifier',
        'field_identifier',
    ] as const);
    private static readonly validFunctionTypes = new Set([
        'identifier',
    ] as const);

    protected getLanguage(): Language {
        return RustParser.language;
    }
    protected getRawQueries(): Map<QueryType, ParserQuery> {
        return RustParser.rawQueries;
    }
    protected getConstructorName(): string {
        return RustParser.constructorName;
    }
    protected getSelfAccessReference(): string {
        return RustParser.selfAccessReference;
    }
    protected getValidMemberTypes(): Set<string> {
        return RustParser.validMemberTypes;
    }
    protected getValidFunctionTypes(): Set<string> {
        return RustParser.validFunctionTypes;
    }

    private static readonly SCOPE_TYPES: Record<string, ScopeType> = {
        struct_item: ScopeType.CLASS,
        impl_item: ScopeType.CLASS,
        trait_item: ScopeType.INTERFACE,
        enum_item: ScopeType.ENUM,
        function_item: ScopeType.FUNCTION,
    };

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
            case 'field_expression': {
                const value = node.childForFieldName('value');
                const field = node.childForFieldName('field');

                this.addToChain(value, ChainType.MEMBER, chain, node.id);
                this.addToChain(field, ChainType.MEMBER, chain, node.id);

                return true;
            }
            case 'macro_invocation': {
                const macro = node.childForFieldName('macro');

                if (macro?.type === 'identifier') {
                    this.addToChain(macro, ChainType.FUNCTION, chain, node.id);
                } else if (chain.length > 0) {
                    chain[chain.length - 1].type = ChainType.FUNCTION;
                }

                return true;
            }
            case 'scoped_identifier': {
                const path = node.childForFieldName('path');
                const name = node.childForFieldName('name');

                this.addToChain(path, ChainType.MEMBER, chain, node.id);
                this.addToChain(name, ChainType.MEMBER, chain, node.id);

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
