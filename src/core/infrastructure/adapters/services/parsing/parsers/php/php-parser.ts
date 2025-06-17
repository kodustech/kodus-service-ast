import { Language, QueryMatch, SyntaxNode } from 'tree-sitter';
import { BaseParser } from '../base-parser';
import { phpQueries } from './php-queries';
import * as PhpLang from 'tree-sitter-php/php';
import { ParserQuery, QueryType } from '../query';
import { ChainType, CallChain } from '@/core/domain/parsing/types/parser';
import { NodeType, Scope } from '@kodus/kodus-proto/v2';

export class PhpParser extends BaseParser {
    private static readonly language = PhpLang as Language;
    private static readonly rawQueries = phpQueries;
    private static readonly constructorName = '__construct';
    private static readonly selfAccessReference = '$this';
    private static readonly validMemberTypes = new Set([
        'variable_name',
        'name',
    ] as const);
    private static readonly validFunctionTypes = new Set([
        'variable_name',
        'name',
    ] as const);

    protected getLanguage(): Language {
        return PhpParser.language;
    }
    protected getRawQueries(): Map<QueryType, ParserQuery> {
        return PhpParser.rawQueries;
    }
    protected getConstructorName(): string {
        return PhpParser.constructorName;
    }
    protected getSelfAccessReference(): string {
        return PhpParser.selfAccessReference;
    }
    protected getValidMemberTypes(): Set<string> {
        return PhpParser.validMemberTypes;
    }
    protected getValidFunctionTypes(): Set<string> {
        return PhpParser.validFunctionTypes;
    }

    private static readonly SCOPE_TYPES: Record<string, NodeType> = {
        class_declaration: NodeType.NODE_TYPE_CLASS,
        interface_declaration: NodeType.NODE_TYPE_INTERFACE,
        enum_declaration: NodeType.NODE_TYPE_ENUM,
        function_definition: NodeType.NODE_TYPE_FUNCTION,
        method_declaration: NodeType.NODE_TYPE_FUNCTION,
        assignment_expression: NodeType.NODE_TYPE_FUNCTION,
    };

    protected override getImportOriginName(
        node: SyntaxNode,
        match?: QueryMatch | null,
    ): string | null {
        if (!node) {
            return null;
        }

        let originName = node.text;
        if (match && match['properties']) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            const properties = match['properties'];
            if (
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                properties['leadingSlash'] &&
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                properties['leadingSlash'] === 'true'
            ) {
                originName = originName.replace(/^\//, '');
            }
        }

        return originName;
    }

    protected override processChainNode(
        node: SyntaxNode,
        chain: CallChain[],
    ): boolean {
        switch (node.type) {
            case 'nullsafe_member_access_expression':
            case 'member_access_expression': {
                const object = node.childForFieldName('object');
                const name = node.childForFieldName('name');

                this.addToChain(object, ChainType.MEMBER, chain, node.id);
                this.addToChain(name, ChainType.MEMBER, chain, node.id);

                return true;
            }
            case 'nullsafe_member_call_expression':
            case 'member_call_expression': {
                const object = node.childForFieldName('object');
                const name = node.childForFieldName('name');

                this.addToChain(object, ChainType.MEMBER, chain, node.id);
                this.addToChain(name, ChainType.FUNCTION, chain, node.id);

                return true;
            }
            case 'function_call_expression': {
                const func = node.childForFieldName('function');

                this.addToChain(func, ChainType.FUNCTION, chain, node.id);

                return true;
            }
            case 'scoped_property_access_expression':
            case 'class_constant_access_expression': {
                const scope = node.childForFieldName('scope');
                const name = node.childForFieldName('name');

                this.addToChain(scope, ChainType.MEMBER, chain, node.id);
                this.addToChain(name, ChainType.MEMBER, chain, node.id);

                return true;
            }
            case 'scoped_call_expression': {
                const scope = node.childForFieldName('scope');
                const name = node.childForFieldName('name');

                this.addToChain(scope, ChainType.MEMBER, chain, node.id);
                this.addToChain(name, ChainType.FUNCTION, chain, node.id);

                return true;
            }
            default:
                return false;
        }
    }

    protected override getScopeTypeForNode(node: SyntaxNode): Scope | null {
        const scopeType = PhpParser.SCOPE_TYPES[node.type];
        if (!scopeType) {
            return null;
        }

        let nameNode: SyntaxNode | null = null;
        switch (node.type) {
            case 'assignment_expression': {
                const rightNode = node.childForFieldName('right');
                if (rightNode?.type !== 'arrow_function') {
                    return null;
                }
                nameNode = node.childForFieldName('left');
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
