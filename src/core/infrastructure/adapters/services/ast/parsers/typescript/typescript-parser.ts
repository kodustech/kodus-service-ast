import { BaseParser } from '../base-parser';
import * as TypeScriptLang from 'tree-sitter-typescript/typescript';
import { typeScriptQueries } from './typescript-queries';
import { Language, SyntaxNode } from 'tree-sitter';
import { ParserQuery, QueryType } from '../query';
import { CallChain, ChainType } from '@/core/domain/ast/types/parser';
import { NodeType, Scope } from '@kodus/kodus-proto/v2';

export class TypeScriptParser extends BaseParser {
    private static readonly language = TypeScriptLang as Language;
    private static readonly rawQueries = typeScriptQueries;
    private static readonly constructorName = 'constructor';
    private static readonly selfAccessReference = 'this';
    private static readonly validMemberTypes = new Set([
        'identifier',
        'property_identifier',
        'private_property_identifier',
    ] as const);
    private static readonly validFunctionTypes = new Set([
        'identifier',
    ] as const);

    protected getLanguage(): Language {
        return TypeScriptParser.language;
    }
    protected getRawQueries(): Map<QueryType, ParserQuery> {
        return TypeScriptParser.rawQueries;
    }
    protected getConstructorName(): string {
        return TypeScriptParser.constructorName;
    }
    protected getSelfAccessReference(): string {
        return TypeScriptParser.selfAccessReference;
    }
    protected getValidMemberTypes(): Set<string> {
        return TypeScriptParser.validMemberTypes;
    }
    protected getValidFunctionTypes(): Set<string> {
        return TypeScriptParser.validFunctionTypes;
    }

    private static readonly SCOPE_TYPES: Record<string, NodeType> = {
        class_declaration: NodeType.NODE_TYPE_CLASS,
        abstract_class_declaration: NodeType.NODE_TYPE_CLASS,
        interface_declaration: NodeType.NODE_TYPE_INTERFACE,
        enum_declaration: NodeType.NODE_TYPE_ENUM,
        function_declaration: NodeType.NODE_TYPE_FUNCTION,
        method_definition: NodeType.NODE_TYPE_FUNCTION,
        variable_declarator: NodeType.NODE_TYPE_FUNCTION,
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

    protected override getScopeTypeForNode(node: SyntaxNode): Scope | null {
        const scopeType = TypeScriptParser.SCOPE_TYPES[node.type];
        if (!scopeType) {
            return null;
        }

        let nameNode: SyntaxNode | null = null;
        switch (node.type) {
            case 'variable_declarator': {
                const valueNode = node.childForFieldName('value');
                if (valueNode?.type !== 'arrow_function') {
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
            name: nameNode.text,
            type: scopeType,
        };
    }
}
