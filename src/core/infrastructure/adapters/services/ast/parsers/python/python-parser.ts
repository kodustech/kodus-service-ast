import { BaseParser, CallChain, ChainType } from '../base-parser';
import { Language, SyntaxNode } from 'tree-sitter';
import * as PythonLang from 'tree-sitter-python';
import { ScopeType } from '@/core/domain/ast/contracts/CodeGraph';
import { pythonQueries } from './python-queries';

export class PythonParser extends BaseParser {
    protected override readonly scopes: Map<string, ScopeType> = new Map<
        string,
        ScopeType
    >([
        ['class_definition', ScopeType.CLASS],

        ['function_definition', ScopeType.FUNCTION],
        ['assignment', ScopeType.FUNCTION],
    ] as const);
    protected override readonly constructorName: string = '__init__';
    protected override readonly selfAccessReference: string = 'self';

    protected override readonly validMemberTypes: Set<string> = new Set([
        'identifier',
    ] as const);
    protected override readonly validFunctionTypes: Set<string> = new Set([
        'identifier',
    ] as const);

    protected override setupLanguage(): void {
        this.language = PythonLang as Language;
    }

    protected override setupQueries(): void {
        this.rawQueries = pythonQueries;
        super.setupQueries();
    }

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
}
