import { BaseParser } from '../base-parser';
import { Language } from 'tree-sitter';
import * as PythonLang from 'tree-sitter-python';
import { pythonQueries } from './python-queries';
import { ScopeType } from '@/core/domain/ast/contracts/CodeGraph';
import { QueryType, ParserQuery } from '../query';

export class PythonParser extends BaseParser {
    protected queries: Map<QueryType, ParserQuery> = pythonQueries;
    protected scopes: Map<string, ScopeType> = new Map<string, ScopeType>([
        ['class_definition', ScopeType.CLASS],

        ['function_definition', ScopeType.FUNCTION],
        ['assignment', ScopeType.FUNCTION],
    ] as const);
    protected constructorName: string = '__init__';
    protected selfAccessReference: string = 'self';
    protected rootNodeType: string = 'module';
    protected memberChainNodeTypes = {
        callNodeTypes: ['call', 'attribute'],
        memberNodeTypes: [],
        functionNameFields: ['attribute'],
        instanceNameTypes: ['identifier', 'self'],
        functionChildFields: ['object'],
    };

    protected setupLanguage(): void {
        this.language = PythonLang as Language;
    }
}
