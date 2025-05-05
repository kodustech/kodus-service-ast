import { Language, SyntaxNode } from 'tree-sitter';
import { BaseParser } from '../base-parser';
import { phpQueries } from './php-queries';
import * as PhpLang from 'tree-sitter-php/php';
import { Scope, ScopeType } from '@/core/domain/ast/contracts/CodeGraph';

export class PhpParser extends BaseParser {
    protected constructorName: string = '__construct';
    protected selfAccessReference: string = '$this';

    protected setupLanguage(): void {
        this.language = PhpLang as Language;
    }

    protected setupQueries(): void {
        this.queries = phpQueries;
    }

    protected getMemberChain(node: SyntaxNode): string[] {
        const chain: string[] = [];
        let currentNode: SyntaxNode | null = node;

        const nodeTypes = [
            'member_call_expression',
            'function_call_expression',
            'member_access_expression',
        ];

        while (currentNode) {
            if (nodeTypes.includes(currentNode.type)) {
                const memberNameNode = currentNode.childForFieldName('name');
                if (memberNameNode) {
                    chain.unshift(memberNameNode.text);
                }
            }
            if (
                currentNode.type === 'variable_name' &&
                currentNode.text === '$this'
            ) {
                chain.unshift('$this');
            }
            currentNode = currentNode.childForFieldName('object');
        }

        return chain;
    }

    protected getScopeChain(node: SyntaxNode): Scope[] {
        const chain: Scope[] = [];
        let currentNode: SyntaxNode | null = node;

        const scopes = new Map<string, ScopeType>([
            ['class_declaration', ScopeType.CLASS],
            ['interface_declaration', ScopeType.INTERFACE],
            ['enum_declaration', ScopeType.ENUM],

            ['function_declaration', ScopeType.FUNCTION],
            ['method_declaration', ScopeType.METHOD],
            ['assignment_expression', ScopeType.FUNCTION],
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
}
