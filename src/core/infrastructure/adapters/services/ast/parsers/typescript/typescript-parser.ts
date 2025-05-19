import { BaseParser, CallChain, ChainType } from '../base-parser';
import * as TypeScriptLang from 'tree-sitter-typescript/typescript';
import { typeScriptQueries } from './typescript-queries';
import { Language, SyntaxNode } from 'tree-sitter';

export class TypeScriptParser extends BaseParser {
    protected override readonly constructorName: string = 'constructor';
    protected override readonly selfAccessReference: string = 'this';

    protected override readonly validMemberTypes: Set<string> = new Set([
        'identifier',
        'property_identifier',
        'private_property_identifier',
    ] as const);
    protected override readonly validFunctionTypes: Set<string> = new Set([
        'identifier',
    ] as const);

    protected override setupLanguage(): void {
        this.language = TypeScriptLang as Language;
    }

    protected override setupQueries(): void {
        this.rawQueries = typeScriptQueries;
        super.setupQueries();
    }

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
}
