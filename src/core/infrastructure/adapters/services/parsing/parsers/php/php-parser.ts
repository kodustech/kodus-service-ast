import { type Language, type QueryMatch, type SyntaxNode } from 'tree-sitter';
import { BaseParser } from '../base-parser.js';
import { phpQueries } from './php-queries.js';
import * as PhpLang from 'tree-sitter-php/php';
import { type ParserQuery, type QueryType } from '../query.js';
import {
    ChainType,
    type CallChain,
} from '@/core/domain/parsing/types/parser.js';
import { NodeType, type Scope } from '@/shared/types/ast.js';
import { SUPPORTED_LANGUAGES } from '@/core/domain/parsing/types/supported-languages.js';

export class PhpParser extends BaseParser {
    private static readonly language = PhpLang as Language;
    private static readonly rawQueries = phpQueries;
    private static readonly constructorName =
        SUPPORTED_LANGUAGES.php.properties.constructorName;
    private static readonly selfAccessReference =
        SUPPORTED_LANGUAGES.php.properties.selfAccessReference;
    private static readonly validMemberTypes = new Set([
        'variable_name',
        'name',
    ] as const);
    private static readonly validFunctionTypes = new Set([
        'variable_name',
        'name',
    ] as const);

    protected override getLanguage(): Language {
        return PhpParser.language;
    }
    protected override getRawQueries(): Map<QueryType, ParserQuery> {
        return PhpParser.rawQueries;
    }
    protected override getConstructorName(): string {
        return PhpParser.constructorName;
    }
    protected override getSelfAccessReference(): string {
        return PhpParser.selfAccessReference;
    }
    protected override getValidMemberTypes(): Set<string> {
        return PhpParser.validMemberTypes;
    }
    protected override getValidFunctionTypes(): Set<string> {
        return PhpParser.validFunctionTypes;
    }

    private static readonly scopeTypes: Record<string, NodeType> = {
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
            const properties = match['properties'];
            if (
                properties['leadingSlash'] &&
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
                const nodeId = this.mapNodeId(node);

                this.addToChain(object, ChainType.MEMBER, chain, nodeId);
                this.addToChain(name, ChainType.MEMBER, chain, nodeId);

                return true;
            }
            case 'nullsafe_member_call_expression':
            case 'member_call_expression': {
                const object = node.childForFieldName('object');
                const name = node.childForFieldName('name');
                const nodeId = this.mapNodeId(node);

                this.addToChain(object, ChainType.MEMBER, chain, nodeId);
                this.addToChain(name, ChainType.FUNCTION, chain, nodeId);

                return true;
            }
            case 'function_call_expression': {
                const func = node.childForFieldName('function');
                const nodeId = this.mapNodeId(node);

                this.addToChain(func, ChainType.FUNCTION, chain, nodeId);

                return true;
            }
            case 'scoped_property_access_expression':
            case 'class_constant_access_expression': {
                const scope = node.childForFieldName('scope');
                const name = node.childForFieldName('name');
                const nodeId = this.mapNodeId(node);

                this.addToChain(scope, ChainType.MEMBER, chain, nodeId);
                this.addToChain(name, ChainType.MEMBER, chain, nodeId);

                return true;
            }
            case 'scoped_call_expression': {
                const scope = node.childForFieldName('scope');
                const name = node.childForFieldName('name');
                const nodeId = this.mapNodeId(node);

                this.addToChain(scope, ChainType.MEMBER, chain, nodeId);
                this.addToChain(name, ChainType.FUNCTION, chain, nodeId);

                return true;
            }
            default:
                return false;
        }
    }

    protected override getScopeTypeForNode(node: SyntaxNode): Scope | null {
        const scopeType = PhpParser.scopeTypes[node.type];
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
