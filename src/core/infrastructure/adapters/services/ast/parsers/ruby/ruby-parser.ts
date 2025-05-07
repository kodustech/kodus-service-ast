import { BaseParser } from '../base-parser';
import * as RubyLang from 'tree-sitter-ruby';
import { rubyQueries } from './ruby-queries';
import { Language, SyntaxNode } from 'tree-sitter';
import { ScopeType } from '@/core/domain/ast/contracts/CodeGraph';

export class RubyParser extends BaseParser {
    protected constructorName: string = 'initialize';
    protected selfAccessReference: string = '@self';
    protected rootNodeType: string = 'program';

    protected setupLanguage(): void {
        this.language = RubyLang as Language;
    }

    protected setupQueries(): void {
        this.queries = rubyQueries;
    }

    protected setupScopes(): void {
        this.scopes = new Map<string, ScopeType>([
            ['class', ScopeType.CLASS],
            ['module', ScopeType.CLASS],

            ['function', ScopeType.FUNCTION],
            ['method', ScopeType.METHOD],
            ['singleton_method', ScopeType.METHOD],
            ['assignment', ScopeType.FUNCTION],
        ] as const);
    }

    protected getMemberChain(node: SyntaxNode): string[] {
        const chain: string[] = [];
        let current: SyntaxNode | null = node;

        while (current && current.type === 'call') {
            const rec = current.childForFieldName('method');
            if (rec) {
                chain.unshift(rec.text);
            }
            current = current.childForFieldName('receiver');
        }

        if (current) {
            chain.unshift(current.text);
        }

        return chain;
    }
}
