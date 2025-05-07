import { BaseParser } from '../base-parser';
import * as RubyLang from 'tree-sitter-ruby';
import { rubyQueries } from './ruby-queries';
import { Language, SyntaxNode } from 'tree-sitter';
import { Scope, ScopeType } from '@/core/domain/ast/contracts/CodeGraph';

export class RubyParser extends BaseParser {
    protected constructorName: string = 'initialize';
    protected selfAccessReference: string = '@self';

    protected setupLanguage(): void {
        this.language = RubyLang as Language;
    }

    protected setupQueries(): void {
        this.queries = rubyQueries;
    }

    protected getScopeChain(node: SyntaxNode): Scope[] {
        const chain: Scope[] = [];
        let currentNode: SyntaxNode | null = node;

        const scopes = new Map<string, ScopeType>([
            ['class', ScopeType.CLASS],
            ['module', ScopeType.CLASS],

            ['function', ScopeType.FUNCTION],
            ['method', ScopeType.METHOD],
            ['singleton_method', ScopeType.METHOD],
            ['assignment', ScopeType.FUNCTION],
        ] as const);

        while (currentNode && currentNode.type !== 'program') {
            const scopeType = scopes.get(currentNode.type);
            if (scopeType) {
                const nameNode = currentNode.childForFieldName('name');
                if (nameNode) {
                    const name = nameNode.text;
                    chain.unshift({
                        type: scopeType,
                        name: name,
                    });
                } else {
                    const assignment = currentNode.childForFieldName('left');
                    if (assignment) {
                        const name = assignment.text;
                        chain.unshift({
                            type: scopeType,
                            name: name,
                        });
                    }
                }
            }
            currentNode = currentNode.parent;
        }

        return chain;
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
