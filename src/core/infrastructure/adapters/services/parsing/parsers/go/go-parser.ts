import { Language, SyntaxNode } from 'tree-sitter';
import { BaseParser } from '../base-parser';
import * as GoLang from 'tree-sitter-go';
import { goQueries } from './go-queries';
import { ParserQuery, QueryType } from '../query';
import { CallChain } from '@/core/domain/parsing/types/parser';
import { NodeType, Scope } from '@kodus/kodus-proto/ast/v2';
import { SUPPORTED_LANGUAGES } from '@/core/domain/parsing/types/supported-languages';

export class GoParser extends BaseParser {
    private static readonly language = GoLang as Language;
    private static readonly rawQueries = goQueries;
    private static readonly constructorName =
        SUPPORTED_LANGUAGES.go.properties.constructorName;
    private static readonly selfAccessReference =
        SUPPORTED_LANGUAGES.go.properties.selfAccessReference;
    private static readonly validMemberTypes = new Set([''] as const);
    private static readonly validFunctionTypes = new Set([''] as const);

    protected override getLanguage(): Language {
        return GoParser.language;
    }
    protected override getRawQueries(): Map<QueryType, ParserQuery> {
        return GoParser.rawQueries;
    }
    protected override getConstructorName(): string {
        return GoParser.constructorName;
    }
    protected override getSelfAccessReference(): string {
        return GoParser.selfAccessReference;
    }
    protected override getValidMemberTypes(): Set<string> {
        return GoParser.validMemberTypes;
    }
    protected override getValidFunctionTypes(): Set<string> {
        return GoParser.validFunctionTypes;
    }

    private static readonly SCOPE_TYPES: Record<string, NodeType> = {};

    protected override processChainNode(
        node: SyntaxNode,
        chain: CallChain[],
    ): boolean {
        throw new Error('Method not implemented.');
    }

    protected override getScopeTypeForNode(node: SyntaxNode): Scope | null {
        throw new Error('Method not implemented.');
    }
}
