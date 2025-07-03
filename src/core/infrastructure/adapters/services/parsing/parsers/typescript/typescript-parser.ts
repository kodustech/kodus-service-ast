import { BaseParser } from '../base-parser';
import * as TypeScriptLang from 'tree-sitter-typescript/typescript';
import { typeScriptQueries } from './typescript-queries';
import { Language, SyntaxNode } from 'tree-sitter';
import { ParserQuery, QueryType } from '../query';
import { CallChain, ChainType } from '@/core/domain/parsing/types/parser';
import { NodeType, Scope } from '@kodus/kodus-proto/ast/v2';
import { SUPPORTED_LANGUAGES } from '@/core/domain/parsing/types/supported-languages';

export class TypeScriptParser extends BaseParser {
    private static readonly language = TypeScriptLang as Language;
    private static readonly rawQueries = typeScriptQueries;
    private static readonly constructorName =
        SUPPORTED_LANGUAGES.typescript.properties.constructorName;
    private static readonly selfAccessReference =
        SUPPORTED_LANGUAGES.typescript.properties.selfAccessReference;
    private static readonly validMemberTypes = new Set([
        'identifier',
        'property_identifier',
        'private_property_identifier',
    ] as const);
    private static readonly validFunctionTypes = new Set([
        'identifier',
    ] as const);

    protected override getLanguage(): Language {
        return TypeScriptParser.language;
    }
    protected override getRawQueries(): Map<QueryType, ParserQuery> {
        return TypeScriptParser.rawQueries;
    }
    protected override getConstructorName(): string {
        return TypeScriptParser.constructorName;
    }
    protected override getSelfAccessReference(): string {
        return TypeScriptParser.selfAccessReference;
    }
    protected override getValidMemberTypes(): Set<string> {
        return TypeScriptParser.validMemberTypes;
    }
    protected override getValidFunctionTypes(): Set<string> {
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
                const nodeId = this.mapNodeId(node);

                if (func?.type === 'identifier') {
                    this.addToChain(func, ChainType.FUNCTION, chain, nodeId);
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
        const nodeId = this.mapNodeId(node);

        if (object?.type === 'member_expression') {
            this.processMemberExpression(object, chain, depth + 1);
        }

        this.addToChain(object, ChainType.MEMBER, chain, nodeId);
        this.addToChain(property, ChainType.MEMBER, chain, nodeId);
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
