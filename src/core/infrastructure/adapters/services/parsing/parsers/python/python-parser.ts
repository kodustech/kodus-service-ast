import { BaseParser } from '../base-parser.js';
import { Language, SyntaxNode } from 'tree-sitter';
import * as PythonLang from 'tree-sitter-python';
import { pythonQueries } from './python-queries.js';
import { ParserQuery, QueryType } from '../query.js';
import { ChainType, CallChain } from '@/core/domain/parsing/types/parser.js';
import { NodeType, Scope } from '@/shared/types/ast.js';
import { SUPPORTED_LANGUAGES } from '@/core/domain/parsing/types/supported-languages.js';

export class PythonParser extends BaseParser {
    private static readonly language = PythonLang as unknown as Language;
    private static readonly rawQueries = pythonQueries;
    private static readonly constructorName =
        SUPPORTED_LANGUAGES.python.properties.constructorName;
    private static readonly selfAccessReference =
        SUPPORTED_LANGUAGES.python.properties.selfAccessReference;
    private static readonly validMemberTypes = new Set(['identifier'] as const);
    private static readonly validFunctionTypes = new Set([
        'identifier',
    ] as const);

    protected override getLanguage(): Language {
        return PythonParser.language;
    }
    protected override getRawQueries(): Map<QueryType, ParserQuery> {
        return PythonParser.rawQueries;
    }
    protected override getConstructorName(): string {
        return PythonParser.constructorName;
    }
    protected override getSelfAccessReference(): string {
        return PythonParser.selfAccessReference;
    }
    protected override getValidMemberTypes(): Set<string> {
        return PythonParser.validMemberTypes;
    }
    protected override getValidFunctionTypes(): Set<string> {
        return PythonParser.validFunctionTypes;
    }

    private static readonly scopeTypes: Record<string, NodeType> = {
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
                const nodeId = this.mapNodeId(node);

                if (func?.type === 'identifier') {
                    this.addToChain(func, ChainType.FUNCTION, chain, nodeId);
                } else if (chain.length > 0) {
                    chain[chain.length - 1].type = ChainType.FUNCTION;
                }

                return true;
            }
            case 'attribute': {
                const object = node.childForFieldName('object');
                const attr = node.childForFieldName('attribute');
                const nodeId = this.mapNodeId(node);

                this.addToChain(object, ChainType.MEMBER, chain, nodeId);
                this.addToChain(attr, ChainType.MEMBER, chain, nodeId);

                return true;
            }
            default:
                return false;
        }
    }

    protected override getScopeTypeForNode(node: SyntaxNode): Scope | null {
        const scopeType = PythonParser.scopeTypes[node.type];
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
