import { BaseParser } from '../base-parser';
import { Language, SyntaxNode } from 'tree-sitter';
import * as PythonLang from 'tree-sitter-python';
import { pythonQueries } from './python-queries';
import { ScopeType } from '@/core/domain/ast/contracts/CodeGraph';

export class PythonParser extends BaseParser {
    protected constructorName: string = '__init__';
    protected selfAccessReference: string = 'self';
    protected rootNodeType: string = 'module';

    protected setupLanguage(): void {
        this.language = PythonLang as Language;
    }

    protected setupQueries(): void {
        this.queries = pythonQueries;
    }

    protected setupScopes(): void {
        this.scopes = new Map<string, ScopeType>([
            ['class_definition', ScopeType.CLASS],

            ['function_definition', ScopeType.FUNCTION],
            ['assignment', ScopeType.FUNCTION],
        ] as const);
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
}
