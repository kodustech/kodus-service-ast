import { Language, SyntaxNode } from 'tree-sitter';
import { BaseParser } from '../base-parser';
import { javaQueries } from './java-queries';
import * as JavaLang from 'tree-sitter-java';
import { ParserQuery, QueryType } from '../query';
import { ChainType, CallChain } from '@/core/domain/parsing/types/parser';
import { NodeType, Scope } from '@kodus/kodus-proto/ast/v2';
import { SUPPORTED_LANGUAGES } from '@/core/domain/parsing/types/supported-languages';

export class JavaParser extends BaseParser {
    private static readonly language = JavaLang as Language;
    private static readonly rawQueries = javaQueries;
    private static readonly constructorName =
        SUPPORTED_LANGUAGES.java.properties.constructorName;
    private static readonly selfAccessReference =
        SUPPORTED_LANGUAGES.java.properties.selfAccessReference;
    private static readonly validMemberTypes = new Set([
        'identifier',
        'this',
    ] as const);
    private static readonly validFunctionTypes = new Set([
        'identifier',
    ] as const);

    protected override getLanguage(): Language {
        return JavaParser.language;
    }
    protected override getRawQueries(): Map<QueryType, ParserQuery> {
        return JavaParser.rawQueries;
    }
    protected override getConstructorName(): string {
        return JavaParser.constructorName;
    }
    protected override getSelfAccessReference(): string {
        return JavaParser.selfAccessReference;
    }
    protected override getValidMemberTypes(): Set<string> {
        return JavaParser.validMemberTypes;
    }
    protected override getValidFunctionTypes(): Set<string> {
        return JavaParser.validFunctionTypes;
    }

    private static readonly SCOPE_TYPES: Record<string, NodeType> = {
        class_declaration: NodeType.NODE_TYPE_CLASS,
        interface_declaration: NodeType.NODE_TYPE_INTERFACE,
        enum_declaration: NodeType.NODE_TYPE_ENUM,
        method_declaration: NodeType.NODE_TYPE_FUNCTION,
        constructor_declaration: NodeType.NODE_TYPE_FUNCTION,
        variable_declarator: NodeType.NODE_TYPE_FUNCTION,
    };

    protected override processChainNode(
        node: SyntaxNode,
        chain: CallChain[],
    ): boolean {
        switch (node.type) {
            case 'method_invocation': {
                const name = node.childForFieldName('name');
                const object = node.childForFieldName('object');
                const nodeId = this.mapNodeId(node);

                this.addToChain(object, ChainType.MEMBER, chain, nodeId);
                this.addToChain(name, ChainType.FUNCTION, chain, nodeId);

                return true;
            }
            case 'field_access': {
                const object = node.childForFieldName('object');
                const field = node.childForFieldName('field');
                const nodeId = this.mapNodeId(node);

                this.addToChain(object, ChainType.MEMBER, chain, nodeId);
                this.addToChain(field, ChainType.MEMBER, chain, nodeId);

                return true;
            }
            default:
                return false;
        }
    }

    protected override getScopeTypeForNode(node: SyntaxNode): Scope | null {
        const scopeType = JavaParser.SCOPE_TYPES[node.type];
        if (!scopeType) {
            return null;
        }

        let nameNode: SyntaxNode | null = null;
        switch (node.type) {
            case 'variable_declarator': {
                const valueNode = node.childForFieldName('value');
                if (valueNode?.type !== 'lambda_expression') {
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
