import { Language, SyntaxNode } from 'tree-sitter';
import { BaseParser } from '../base-parser';
import * as GoLang from 'tree-sitter-go';
import { goQueries } from './go-queries';
import { ParserQuery, QueryType } from '../query';
import { CallChain } from '@/core/domain/parsing/types/parser';
import { NodeType, Scope } from '@kodus/kodus-proto/v2';

export class GoParser extends BaseParser {
    private static readonly language = GoLang as Language;
    private static readonly rawQueries = goQueries;
    private static readonly constructorName = '';
    private static readonly selfAccessReference = '';
    private static readonly validMemberTypes = new Set([''] as const);
    private static readonly validFunctionTypes = new Set([''] as const);

    protected getLanguage(): Language {
        return GoParser.language;
    }
    protected getRawQueries(): Map<QueryType, ParserQuery> {
        return GoParser.rawQueries;
    }
    protected getConstructorName(): string {
        return GoParser.constructorName;
    }
    protected getSelfAccessReference(): string {
        return GoParser.selfAccessReference;
    }
    protected getValidMemberTypes(): Set<string> {
        return GoParser.validMemberTypes;
    }
    protected getValidFunctionTypes(): Set<string> {
        return GoParser.validFunctionTypes;
    }

    private static readonly SCOPE_TYPES: Record<string, NodeType> = {};

    protected processChainNode(node: SyntaxNode, chain: CallChain[]): boolean {
        throw new Error('Method not implemented.');
    }

    protected getScopeTypeForNode(node: SyntaxNode): Scope | null {
        throw new Error('Method not implemented.');
    }
}
