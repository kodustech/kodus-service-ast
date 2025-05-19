import { ScopeType } from '@/core/domain/ast/contracts/CodeGraph';
import { Language, SyntaxNode } from 'tree-sitter';
import { BaseParser, CallChain } from '../base-parser';
import * as GoLang from 'tree-sitter-go';
import { goQueries } from './go-queries';

export class GoParser extends BaseParser {
    protected override readonly constructorName: string = '';
    protected override readonly selfAccessReference: string = '';

    protected override readonly scopes: Map<string, ScopeType> = new Map<
        string,
        ScopeType
    >([] as const);

    protected override readonly validMemberTypes: Set<string> = new Set(
        [] as const,
    );
    protected override readonly validFunctionTypes: Set<string> = new Set(
        [] as const,
    );

    protected override setupLanguage(): void {
        this.language = GoLang as Language;
    }

    protected override setupQueries(): void {
        this.rawQueries = goQueries;
        super.setupQueries();
    }

    protected override processChainNode(
        node: SyntaxNode,
        chain: CallChain[],
    ): boolean {
        throw new Error('Method not implemented.');
    }
}
