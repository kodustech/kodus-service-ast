import { BaseParser } from '../base-parser';
import * as RubyLang from 'tree-sitter-ruby';
import { rubyQueries } from './ruby-queries';
import { Language } from 'tree-sitter';
import { ScopeType } from '@/core/domain/ast/contracts/CodeGraph';
import { QueryType, ParserQuery } from '../query';

export class RubyParser extends BaseParser {
    protected language: Language = RubyLang as Language;
    protected queries: Map<QueryType, ParserQuery> = rubyQueries;
    protected scopes: Map<string, ScopeType> = new Map<string, ScopeType>([
        ['class', ScopeType.CLASS],
        ['module', ScopeType.CLASS],

        ['function', ScopeType.FUNCTION],
        ['method', ScopeType.METHOD],
        ['singleton_method', ScopeType.METHOD],
        ['assignment', ScopeType.FUNCTION],
    ] as const);
    protected constructorName: string = 'initialize';
    protected selfAccessReference: string = '@self';
    protected rootNodeType: string = 'program';
    protected memberChainNodeTypes = {
        mainNodes: ['call'],
        functionNameType: 'method',
        instanceNameTypes: ['identifier', 'self'],
        functionNodeType: 'receiver',
    };

    protected setupLanguage(): void {
        this.language = RubyLang as Language;
    }
}
