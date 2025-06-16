import { BaseParser } from '../base-parser';
import { Language, SyntaxNode } from 'tree-sitter';
import * as PythonLang from 'tree-sitter-python';
import { pythonQueries } from './python-queries';
import { ParserQuery, QueryType } from '../query';
import { ChainType, CallChain } from '@/core/domain/ast/types/parser';
import { NodeType, Scope } from '@kodus/kodus-proto/v2';

export class PythonParser extends BaseParser {
    private static readonly language = PythonLang as Language;
    private static readonly rawQueries = pythonQueries;
    private static readonly constructorName = '__init__';
    private static readonly selfAccessReference = 'self';
    private static readonly validMemberTypes = new Set(['identifier'] as const);
    private static readonly validFunctionTypes = new Set([
        'identifier',
    ] as const);

    protected getLanguage(): Language {
        return PythonParser.language;
    }
    protected getRawQueries(): Map<QueryType, ParserQuery> {
        return PythonParser.rawQueries;
    }
    protected getConstructorName(): string {
        return PythonParser.constructorName;
    }
    protected getSelfAccessReference(): string {
        return PythonParser.selfAccessReference;
    }
    protected getValidMemberTypes(): Set<string> {
        return PythonParser.validMemberTypes;
    }
    protected getValidFunctionTypes(): Set<string> {
        return PythonParser.validFunctionTypes;
    }

    private static readonly SCOPE_TYPES: Record<string, NodeType> = {
        class_definition: NodeType.NODE_TYPE_CLASS,
        function_definition: NodeType.NODE_TYPE_FUNCTION,
        assignment: NodeType.NODE_TYPE_FUNCTION,
    };

    protected override processChainNode(
        node: SyntaxNode,
        chain: CallChain[],
    ): boolean {
        switch (node.type) {
            case 'call': {
                const func = node.childForFieldName('function');

                if (func?.type === 'identifier') {
                    this.addToChain(func, ChainType.FUNCTION, chain, node.id);
                } else if (chain.length > 0) {
                    chain[chain.length - 1].type = ChainType.FUNCTION;
                }

                return true;
            }
            case 'attribute': {
                const object = node.childForFieldName('object');
                const attr = node.childForFieldName('attribute');

                this.addToChain(object, ChainType.MEMBER, chain, node.id);
                this.addToChain(attr, ChainType.MEMBER, chain, node.id);

                return true;
            }
            default:
                return false;
        }
    }

    protected override getScopeTypeForNode(node: SyntaxNode): Scope | null {
        const scopeType = PythonParser.SCOPE_TYPES[node.type];
        if (!scopeType) {
            return null;
        }

        let nameNode: SyntaxNode | null = null;
        switch (node.type) {
            case 'assignment': {
                const rightNode = node.childForFieldName('right');
                if (rightNode?.type !== 'lambda') {
                    return null;
                }
                nameNode = node.childForFieldName('left');
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
