import { ScopeType } from '@/core/domain/ast/contracts/CodeGraph';
import { Language, SyntaxNode } from 'tree-sitter';
import { BaseParser, CallChain, ChainType } from '../base-parser';
import * as CSharpLang from 'tree-sitter-c-sharp';
import { cSharpQueries } from './csharp-queries';

export class CSharpParser extends BaseParser {
    protected override readonly constructorName: string = 'constructor';
    protected override readonly selfAccessReference: string = 'this';
    protected override readonly scopes: Map<string, ScopeType> = new Map<
        string,
        ScopeType
    >([
        ['namespace_declaration', ScopeType.CLASS],
        ['class_declaration', ScopeType.CLASS],
        ['struct_declaration', ScopeType.CLASS],
        ['record_declaration', ScopeType.CLASS],

        ['interface_declaration', ScopeType.INTERFACE],

        ['enum_declaration', ScopeType.ENUM],

        ['method_declaration', ScopeType.METHOD],
        ['constructor_declaration', ScopeType.METHOD],
        ['variable_declaration', ScopeType.FUNCTION],
    ] as const);
    protected override readonly validMemberTypes: Set<string> = new Set([
        'identifier',
    ] as const);
    protected override readonly validFunctionTypes: Set<string> = new Set([
        'identifier',
    ] as const);

    protected override setupLanguage(): void {
        this.language = CSharpLang as Language;
    }

    protected override setupQueries(): void {
        this.rawQueries = cSharpQueries;
        super.setupQueries();
    }

    protected override processChainNode(
        node: SyntaxNode,
        chain: CallChain[],
    ): boolean {
        switch (node.type) {
            case 'invocation_expression': {
                const func = node.childForFieldName('function');

                if (func?.type === 'identifier') {
                    this.addToChain(func, ChainType.FUNCTION, chain, node.id);
                } else if (chain.length > 0) {
                    chain[chain.length - 1].type = ChainType.FUNCTION;
                }

                return true;
            }
            case 'member_access_expression': {
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

        const expression = node.childForFieldName('expression');
        const name = node.childForFieldName('name');

        if (expression?.type === 'member_access_expression') {
            this.processMemberExpression(expression, chain, depth + 1);
        }

        this.addToChain(expression, ChainType.MEMBER, chain, node.id);
        this.addToChain(name, ChainType.MEMBER, chain, node.id);
    }
}
