import { Language, SyntaxNode } from 'tree-sitter';
import { BaseParser, CallChain, ChainType } from '../base-parser';
import { phpQueries } from './php-queries';
import * as PhpLang from 'tree-sitter-php/php';
import { ScopeType } from '@/core/domain/ast/contracts/CodeGraph';
import { QueryType, ParserQuery } from '../query';

export class PhpParser extends BaseParser {
    protected queries: Map<QueryType, ParserQuery> = phpQueries;
    protected scopes: Map<string, ScopeType> = new Map<string, ScopeType>([
        ['class_declaration', ScopeType.CLASS],
        ['interface_declaration', ScopeType.INTERFACE],
        ['enum_declaration', ScopeType.ENUM],

        ['function_definition', ScopeType.FUNCTION],
        ['method_declaration', ScopeType.METHOD],
        ['assignment_expression', ScopeType.FUNCTION],
    ] as const);
    protected constructorName: string = '__construct';
    protected selfAccessReference: string = '$this';
    protected rootNodeType: string = 'program';
    protected memberChainNodeTypes = {
        callNodeTypes: [
            'function_call_expression',

            'member_call_expression',
            'nullsafe_member_call_expression',
            'scoped_call_expression',
        ],
        memberNodeTypes: [
            'member_access_expression',
            'nullsafe_member_access_expression',
        ],
        functionNameFields: ['name'],
        instanceNameTypes: ['variable_name', 'name'],
        functionChildFields: ['object'],
    };

    protected setupLanguage(): void {
        this.language = PhpLang as Language;
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
        const isNameType = (n: SyntaxNode | null): n is SyntaxNode =>
            n?.type === 'variable_name' || n?.type === 'name';

        const addToChain = (field: SyntaxNode | null, type: ChainType) => {
            if (isNameType(field)) {
                chain.push({ name: field.text, type, id: node.id });
            }
        };

        switch (node.type) {
            case 'nullsafe_member_access_expression':
            case 'member_access_expression': {
                addToChain(node.childForFieldName('object'), ChainType.MEMBER);
                addToChain(node.childForFieldName('name'), ChainType.MEMBER);
                return true;
            }

            case 'nullsafe_member_call_expression':
            case 'member_call_expression': {
                addToChain(node.childForFieldName('object'), ChainType.MEMBER);
                addToChain(node.childForFieldName('name'), ChainType.FUNCTION);
                return true;
            }

            case 'function_call_expression': {
                addToChain(
                    node.childForFieldName('function'),
                    ChainType.FUNCTION,
                );
                return true;
            }

            case 'scoped_property_access_expression':
            case 'class_constant_access_expression': {
                addToChain(node.childForFieldName('scope'), ChainType.MEMBER);
                addToChain(node.childForFieldName('name'), ChainType.MEMBER);
                return true;
            }

            case 'scoped_call_expression': {
                addToChain(node.childForFieldName('scope'), ChainType.MEMBER);
                addToChain(node.childForFieldName('name'), ChainType.FUNCTION);
                return true;
            }

            default:
                return false;
        }
    }
}
