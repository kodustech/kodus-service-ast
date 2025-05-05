import { BaseParser } from '../base-parser';
import { Language, SyntaxNode } from 'tree-sitter';
import * as PythonLang from 'tree-sitter-python';
import { pythonQueries } from './python-queries';
import { Scope, ScopeType } from '@/core/domain/ast/contracts/CodeGraph';

export class PythonParser extends BaseParser {
    protected constructorName: string = '__init__';
    protected selfAccessReference: string = 'self';

    protected setupLanguage(): void {
        this.language = PythonLang as Language;
    }

    protected setupQueries(): void {
        this.queries = pythonQueries;
    }

    protected getMemberChain(node: SyntaxNode) {
        const chain: string[] = [];
        let current: SyntaxNode | null = node;

        while (current && current.type === 'call') {
            const attr = current.childForFieldName('attribute');
            if (attr) {
                chain.unshift(attr.text);
            }
            current = current.childForFieldName('object');
        }
        if (current) {
            chain.unshift(current.text);
        }
        return chain;
    }

    protected getScopeChain(node: SyntaxNode): Scope[] {
        const chain: Scope[] = [];
        let currentNode: SyntaxNode | null = node;

        const scopes = new Map<string, ScopeType>([
            ['class_definition', ScopeType.CLASS],

            ['function_definition', ScopeType.FUNCTION],
            ['assignment', ScopeType.FUNCTION],
        ] as const);

        while (currentNode && currentNode.type !== 'module') {
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
}
