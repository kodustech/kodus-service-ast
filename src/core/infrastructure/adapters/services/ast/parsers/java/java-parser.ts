import { Language, SyntaxNode } from 'tree-sitter';
import { BaseParser } from '../base-parser';
import { javaQueries } from './java-queries';
import * as JavaLang from 'tree-sitter-java';
import { Scope, ScopeType } from '@/core/domain/ast/types/parser';
import { QueryType, ParserQuery } from '../query';
import { ChainType, CallChain } from '@/core/domain/ast/types/parser';

export class JavaParser extends BaseParser {
    private static readonly language = JavaLang as Language;
    private static readonly rawQueries = javaQueries;
    private static readonly constructorName = '';
    private static readonly selfAccessReference = 'this';
    private static readonly validMemberTypes = new Set(['identifier'] as const);
    private static readonly validFunctionTypes = new Set([
        'identifier',
    ] as const);

    protected getLanguage(): Language {
        return JavaParser.language;
    }
    protected getRawQueries(): Map<QueryType, ParserQuery> {
        return JavaParser.rawQueries;
    }
    protected getConstructorName(): string {
        return JavaParser.constructorName;
    }
    protected getSelfAccessReference(): string {
        return JavaParser.selfAccessReference;
    }
    protected getValidMemberTypes(): Set<string> {
        return JavaParser.validMemberTypes;
    }
    protected getValidFunctionTypes(): Set<string> {
        return JavaParser.validFunctionTypes;
    }

    private static readonly SCOPE_TYPES: Record<string, ScopeType> = {
        class_declaration: ScopeType.CLASS,
        interface_declaration: ScopeType.INTERFACE,
        enum_declaration: ScopeType.ENUM,
        method_declaration: ScopeType.METHOD,
        constructor_declaration: ScopeType.METHOD,
        variable_declarator: ScopeType.FUNCTION,
    };

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

    protected override getScopeTypeForNode(node: SyntaxNode): Scope | null {
        const scopeType = JavaParser.SCOPE_TYPES[node.type];
        if (!scopeType) {
            return null;
        }

        let nameNode: SyntaxNode | null = null;
        switch (node.type) {
            case 'variable_declarator': {
                const valueNode = node.childForFieldName('value');
                if (valueNode?.type !== 'lambda_expression') {
                    return null;
                }
                nameNode = node.childForFieldName('name');
                break;
            }
            default: {
                nameNode = node.childForFieldName('name');
                break;
            }
        }
        if (!nameNode) {
            return null;
        }

        return {
            type: scopeType,
            name: nameNode.text,
        };
    }
}
