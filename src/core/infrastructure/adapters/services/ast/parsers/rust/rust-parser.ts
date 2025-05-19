import { Language, SyntaxNode } from 'tree-sitter';
import { BaseParser, CallChain, ChainType } from '../base-parser';
import * as RustLang from 'tree-sitter-rust';
import { rustQueries } from './rust-queries';

export class RustParser extends BaseParser {
    protected override readonly constructorName: string = '';
    protected override readonly selfAccessReference: string = 'self';

    protected override readonly validMemberTypes: Set<string> = new Set([
        'identifier',
        'scoped_identifier',
        'field_identifier',
    ] as const);
    protected override readonly validFunctionTypes: Set<string> = new Set([
        'identifier',
    ] as const);

    protected override setupLanguage(): void {
        this.language = RustLang as Language;
    }

    protected override setupQueries(): void {
        this.rawQueries = rustQueries;
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
            case 'field_expression': {
                const value = node.childForFieldName('value');
                const field = node.childForFieldName('field');

                this.addToChain(value, ChainType.MEMBER, chain, node.id);
                this.addToChain(field, ChainType.MEMBER, chain, node.id);

                return true;
            }
            case 'macro_invocation': {
                const macro = node.childForFieldName('macro');

                if (macro?.type === 'identifier') {
                    this.addToChain(macro, ChainType.FUNCTION, chain, node.id);
                } else if (chain.length > 0) {
                    chain[chain.length - 1].type = ChainType.FUNCTION;
                }

                return true;
            }
            case 'scoped_identifier': {
                const path = node.childForFieldName('path');
                const name = node.childForFieldName('name');

                this.addToChain(path, ChainType.MEMBER, chain, node.id);
                this.addToChain(name, ChainType.MEMBER, chain, node.id);

                return true;
            }
            default:
                return false;
        }
    }
}
