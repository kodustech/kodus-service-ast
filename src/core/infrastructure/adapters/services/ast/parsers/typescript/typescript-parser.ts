import { BaseParser, CallChain, ChainType } from '../base-parser';
import * as TypeScriptLang from 'tree-sitter-typescript/typescript';
import { typeScriptQueries } from './typescript-queries';
import { Language, SyntaxNode } from 'tree-sitter';
import { ScopeType } from '@/core/domain/ast/contracts/CodeGraph';
import { QueryType, ParserQuery } from '../query';

export class TypeScriptParser extends BaseParser {
    protected queries: Map<QueryType, ParserQuery> = typeScriptQueries;
    protected scopes: Map<string, ScopeType> = new Map<string, ScopeType>([
        ['class_declaration', ScopeType.CLASS],
        ['abstract_class_declaration', ScopeType.CLASS],
        ['interface_declaration', ScopeType.INTERFACE],
        ['enum_declaration', ScopeType.ENUM],

        ['function_declaration', ScopeType.FUNCTION],
        ['method_definition', ScopeType.METHOD],
        ['variable_declarator', ScopeType.FUNCTION],
    ] as const);
    protected constructorName: string = 'constructor';
    protected selfAccessReference: string = 'this';
    protected rootNodeType: string = 'program';
    protected memberChainNodeTypes = {
        callNodeTypes: ['call_expression'],
        memberNodeTypes: ['member_expression'],
        functionNameFields: ['property'],
        instanceNameTypes: ['identifier', 'this'],
        functionChildFields: ['object', 'function'],
    };

    protected setupLanguage(): void {
        this.language = TypeScriptLang as Language;
    }

    protected override getMemberChain(
        node: SyntaxNode,
        chains: Map<number, CallChain[]>,
    ): CallChain[] {
        if (!node) return [];

        const chain: CallChain[] = [];
        let currentNode: SyntaxNode | null = node;

        while (currentNode) {
            // Check if we've already processed this node
            const cached = chains.get(currentNode.id);
            if (cached) {
                chain.push(...cached);
                break;
            }

            // Handle different node types
            const processed = this.processNode(currentNode, chain);
            if (!processed) return chain; // Exit for unsupported node types

            // Cache the current chain
            chains.set(currentNode.id, [...chain]);
            currentNode = currentNode.parent;
        }

        return chain;
    }

    private processNode(node: SyntaxNode, chain: CallChain[]): boolean {
        const isProperty = (n: SyntaxNode | null): boolean =>
            n?.type === 'identifier' ||
            n?.type === 'property_identifier' ||
            n?.type === 'private_property_identifier';

        switch (node.type) {
            case 'call_expression': {
                const functionField = node.childForFieldName('function');
                if (functionField?.type === 'identifier') {
                    chain.push({
                        name: functionField.text,
                        type: ChainType.FUNCTION,
                        id: node.id,
                    });
                } else if (chain.length > 0) {
                    chain[chain.length - 1].type = ChainType.FUNCTION;
                }
                return true;
            }
            case 'member_expression': {
                const objectField = node.childForFieldName('object');
                const propertyField = node.childForFieldName('property');

                if (objectField?.type === 'identifier') {
                    chain.push({
                        name: objectField.text,
                        type: ChainType.MEMBER,
                        id: node.id,
                    });
                }

                if (isProperty(propertyField)) {
                    chain.push({
                        name: propertyField.text,
                        type: ChainType.MEMBER,
                        id: node.id,
                    });
                }
                return true;
            }
            default: {
                return false;
            }
        }
    }
}
