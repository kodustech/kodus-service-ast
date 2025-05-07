import { BaseParser } from '../base-parser';
import * as TypeScriptLang from 'tree-sitter-typescript/typescript';
import { typeScriptQueries } from './typescript-queries';
import { Language, SyntaxNode } from 'tree-sitter';
import { ScopeType } from '@/core/domain/ast/contracts/CodeGraph';

export class TypeScriptParser extends BaseParser {
    protected constructorName: string = 'constructor';
    protected selfAccessReference: string = 'this';
    protected rootNodeType: string = 'program';

    protected setupLanguage(): void {
        this.language = TypeScriptLang as Language;
    }

    protected setupQueries(): void {
        this.queries = typeScriptQueries;
    }

    protected setupScopes(): void {
        this.scopes = new Map<string, ScopeType>([
            ['class_declaration', ScopeType.CLASS],
            ['abstract_class_declaration', ScopeType.CLASS],
            ['interface_declaration', ScopeType.INTERFACE],
            ['enum_declaration', ScopeType.ENUM],

            ['function_declaration', ScopeType.FUNCTION],
            ['method_declaration', ScopeType.METHOD],
            ['variable_declarator', ScopeType.FUNCTION],
        ] as const);
    }

    protected getMemberChain(node: SyntaxNode): string[] {
        const chain: string[] = [];
        let current: SyntaxNode | null = node;
        while (current && current.type === 'member_expression') {
            const prop = current.childForFieldName('property');
            if (prop) {
                chain.unshift(prop.text);
            }
            current = current.childForFieldName('object');
        }
        if (current) {
            chain.unshift(current.text);
        }
        return chain;
    }
}
