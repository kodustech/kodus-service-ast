import { BaseParser } from '../base-parser';
import * as TypeScriptLang from 'tree-sitter-typescript/typescript';
import { typeScriptQueries } from './typescript-queries';
import { Language } from 'tree-sitter';
import { ScopeType } from '@/core/domain/ast/contracts/CodeGraph';
import { QueryType, ParserQuery } from '../query';

export class TypeScriptParser extends BaseParser {
    protected language: Language = TypeScriptLang as Language;
    protected queries: Map<QueryType, ParserQuery> = typeScriptQueries;
    protected scopes: Map<string, ScopeType> = new Map<string, ScopeType>([
        ['class_declaration', ScopeType.CLASS],
        ['abstract_class_declaration', ScopeType.CLASS],
        ['interface_declaration', ScopeType.INTERFACE],
        ['enum_declaration', ScopeType.ENUM],

        ['function_declaration', ScopeType.FUNCTION],
        ['method_declaration', ScopeType.METHOD],
        ['variable_declarator', ScopeType.FUNCTION],
    ] as const);
    protected constructorName: string = 'constructor';
    protected selfAccessReference: string = 'this';
    protected rootNodeType: string = 'program';
    protected memberChainNodeTypes = {
        mainNodes: ['member_expression', 'call_expression'],
        functionNameType: 'property',
        instanceNameTypes: ['identifier', 'this'],
        functionNodeType: 'object',
    };

    protected setupLanguage(): void {
        this.language = TypeScriptLang as Language;
    }
}
