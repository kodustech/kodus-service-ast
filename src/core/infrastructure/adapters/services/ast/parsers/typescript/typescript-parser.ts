import { BaseParser } from '../base-parser';
import * as TypeScriptLang from 'tree-sitter-typescript/typescript';
import { typeScriptQueries } from './typescript-queries';
import { Language, SyntaxNode } from 'tree-sitter';
import { QueryType, ParserQuery } from '../query';
import { CallChain, ChainType } from '@/core/domain/ast/types/parser';
import { Scope, ScopeType } from '@/core/domain/ast/types/parser';

export class TypeScriptParser extends BaseParser {
    private static readonly language = TypeScriptLang as Language;
    private static readonly rawQueries = typeScriptQueries;
    private static readonly constructorName = 'constructor';
    private static readonly selfAccessReference = 'this';
    private static readonly validMemberTypes = new Set([
        'identifier',
        'property_identifier',
        'private_property_identifier',
    ] as const);
    private static readonly validFunctionTypes = new Set([
        'identifier',
    ] as const);

    protected getLanguage(): Language {
        return TypeScriptParser.language;
    }
    protected getRawQueries(): Map<QueryType, ParserQuery> {
        return TypeScriptParser.rawQueries;
    }
    protected getConstructorName(): string {
        return TypeScriptParser.constructorName;
    }
    protected getSelfAccessReference(): string {
        return TypeScriptParser.selfAccessReference;
    }
    protected getValidMemberTypes(): Set<string> {
        return TypeScriptParser.validMemberTypes;
    }
    protected getValidFunctionTypes(): Set<string> {
        return TypeScriptParser.validFunctionTypes;
    }

    private static readonly SCOPE_TYPES: Record<string, ScopeType> = {
        class_declaration: ScopeType.CLASS,
        abstract_class_declaration: ScopeType.CLASS,
        interface_declaration: ScopeType.INTERFACE,
        enum_declaration: ScopeType.ENUM,
        function_declaration: ScopeType.FUNCTION,
        method_definition: ScopeType.METHOD,
        variable_declarator: ScopeType.FUNCTION,
    };

    protected override processChainNode(
        node: SyntaxNode,
        chain: CallChain[],
    ): boolean {
        switch (node.type) {
            case 'call_expression': {
                const func = node.childForFieldName('function');

                if (func?.type === 'identifier') {
                    this.addToChain(func, ChainType.FUNCTION, chain, node.id);
                } else if (chain.length > 0) {
                    chain[chain.length - 1].type = ChainType.FUNCTION;
                }

                return true;
            }
            case 'member_expression': {
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

        const object = node.childForFieldName('object');
        const property = node.childForFieldName('property');

        if (object?.type === 'member_expression') {
            this.processMemberExpression(object, chain, depth + 1);
        }

        this.addToChain(object, ChainType.MEMBER, chain, node.id);
        this.addToChain(property, ChainType.MEMBER, chain, node.id);
    }

    protected override getScopeTypeForNode(node: SyntaxNode): Scope | null {
        const scopeType = TypeScriptParser.SCOPE_TYPES[node.type];
        if (!scopeType) {
            return null;
        }

        let nameNode: SyntaxNode | null = null;
        switch (node.type) {
            case 'variable_declarator': {
                const valueNode = node.childForFieldName('value');
                if (valueNode?.type !== 'arrow_function') {
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
            name: nameNode.text,
            type: scopeType,
        };
    }
}
