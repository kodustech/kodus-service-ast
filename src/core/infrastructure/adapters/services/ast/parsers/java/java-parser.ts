import { ScopeType } from '@/core/domain/ast/contracts/CodeGraph';
import { Language, Query, SyntaxNode } from 'tree-sitter';
import { BaseParser, CallChain, ChainType } from '../base-parser';
import { javaQueries } from './java-queries';
import * as JavaLang from 'tree-sitter-java';

export class JavaParser extends BaseParser {
    protected override readonly constructorName: string = 'constructor';
    protected override readonly selfAccessReference: string = 'this';
    protected override readonly scopes: Map<string, ScopeType> = new Map<
        string,
        ScopeType
    >([
        ['class_declaration', ScopeType.CLASS],
        ['interface_declaration', ScopeType.INTERFACE],
        ['enum_declaration', ScopeType.ENUM],
        ['method_declaration', ScopeType.METHOD],
        ['constructor_declaration', ScopeType.METHOD],
        ['variable_declarator', ScopeType.FUNCTION],
    ] as const);

    protected override readonly validMemberTypes: Set<string> = new Set([
        'identifier',
    ] as const);
    protected override readonly validFunctionTypes: Set<string> = new Set([
        'identifier',
    ] as const);

    protected override setupLanguage(): void {
        this.language = JavaLang as Language;
    }

    protected override setupQueries(): void {
        for (const [key, value] of javaQueries.entries()) {
            const query = new Query(this.language, value.query);
            this.queries.set(key, query);
        }
    }

    protected override processChainNode(
        node: SyntaxNode,
        chain: CallChain[],
    ): boolean {
        switch (node.type) {
            case 'method_invocation': {
                const name = node.childForFieldName('name');
                const object = node.childForFieldName('object');

                this.addToChain(object, ChainType.MEMBER, chain, node.id);
                this.addToChain(name, ChainType.FUNCTION, chain, node.id);

                return true;
            }
            case 'field_access': {
                const object = node.childForFieldName('object');
                const field = node.childForFieldName('field');

                this.addToChain(object, ChainType.MEMBER, chain, node.id);
                this.addToChain(field, ChainType.MEMBER, chain, node.id);

                return true;
            }
            default:
                return false;
        }
    }
}
