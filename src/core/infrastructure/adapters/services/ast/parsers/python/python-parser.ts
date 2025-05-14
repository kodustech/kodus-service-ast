import { BaseParser, CallChain, ChainType } from '../base-parser';
import { Language, SyntaxNode } from 'tree-sitter';
import * as PythonLang from 'tree-sitter-python';
import { pythonQueries } from './python-queries';
import { ScopeType } from '@/core/domain/ast/contracts/CodeGraph';
import { QueryType, ParserQuery } from '../query';

export class PythonParser extends BaseParser {
    protected queries: Map<QueryType, ParserQuery> = pythonQueries;
    protected scopes: Map<string, ScopeType> = new Map<string, ScopeType>([
        ['class_definition', ScopeType.CLASS],

        ['function_definition', ScopeType.FUNCTION],
        ['assignment', ScopeType.FUNCTION],
    ] as const);
    protected constructorName: string = '__init__';
    protected selfAccessReference: string = 'self';
    protected rootNodeType: string = 'module';
    protected memberChainNodeTypes = {
        callNodeTypes: ['call', 'attribute'],
        memberNodeTypes: [],
        functionNameFields: ['attribute'],
        instanceNameTypes: ['identifier', 'self'],
        functionChildFields: ['object'],
    };

    protected setupLanguage(): void {
        this.language = PythonLang as Language;
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
            switch (currentNode.type) {
                case 'call': {
                    const functionField =
                        currentNode.childForFieldName('function');
                    if (!functionField) break;

                    if (functionField.type === 'identifier') {
                        chain.push({
                            name: functionField.text,
                            type: ChainType.FUNCTION,
                            id: currentNode.id,
                        });
                    } else if (chain.length > 0) {
                        chain[chain.length - 1].type = ChainType.FUNCTION;
                    }
                    break;
                }
                case 'attribute': {
                    this.processAttribute(currentNode, chain);
                    break;
                }
                default: {
                    return chain; // Exit for unsupported node types
                }
            }

            // Cache the current chain
            chains.set(currentNode.id, [...chain]);
            currentNode = currentNode.parent;
        }

        return chain;
    }

    private processAttribute(node: SyntaxNode, chain: CallChain[]) {
        const addIdentifier = (fieldName: string) => {
            const field = node.childForFieldName(fieldName);
            if (field?.type === 'identifier') {
                chain.push({
                    name: field.text,
                    type: ChainType.MEMBER,
                    id: node.id,
                });
            }
        };

        addIdentifier('object');
        addIdentifier('attribute');
    }
}
