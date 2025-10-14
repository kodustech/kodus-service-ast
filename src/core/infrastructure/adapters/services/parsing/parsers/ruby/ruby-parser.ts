import { BaseParser } from '../base-parser.js';
import * as RubyLang from 'tree-sitter-ruby';
import { rubyQueries } from './ruby-queries.js';
import { Language, QueryCapture, SyntaxNode } from 'tree-sitter';
import { ParserQuery, QueryType } from '../query.js';
import {
    Method,
    ObjectProperties,
    ChainType,
    CallChain,
} from '@/core/domain/parsing/types/parser.js';
import { NodeType, Scope, TypeAnalysis } from '@/shared/types/ast.js';
import { appendOrUpdateElement } from '@/shared/utils/arrays.js';
import { SUPPORTED_LANGUAGES } from '@/core/domain/parsing/types/supported-languages.js';

export class RubyParser extends BaseParser {
    private static readonly language = RubyLang as Language;
    private static readonly rawQueries = rubyQueries;
    private static readonly constructorName =
        SUPPORTED_LANGUAGES.ruby.properties.constructorName;
    private static readonly selfAccessReference =
        SUPPORTED_LANGUAGES.ruby.properties.selfAccessReference;
    private static readonly validMemberTypes = new Set([
        'self',
        'identifier',
        'constant',
        'instance_variable',
        'class_variable',
    ] as const);
    private static readonly validFunctionTypes = new Set([
        'identifier',
    ] as const);

    protected override getLanguage(): Language {
        return RubyParser.language;
    }
    protected override getRawQueries(): Map<QueryType, ParserQuery> {
        return RubyParser.rawQueries;
    }
    protected override getConstructorName(): string {
        return RubyParser.constructorName;
    }
    protected override getSelfAccessReference(): string {
        return RubyParser.selfAccessReference;
    }
    protected override getValidMemberTypes(): Set<string> {
        return RubyParser.validMemberTypes;
    }
    protected override getValidFunctionTypes(): Set<string> {
        return RubyParser.validFunctionTypes;
    }

    private static readonly scopeTypes: Record<string, NodeType> = {
        class: NodeType.NODE_TYPE_CLASS,
        module: NodeType.NODE_TYPE_CLASS,
        method: NodeType.NODE_TYPE_FUNCTION,
        singleton_method: NodeType.NODE_TYPE_FUNCTION,
        assignment: NodeType.NODE_TYPE_FUNCTION,
    };

    protected override processExtraObjCapture(
        capture: QueryCapture,
        objAnalysis: TypeAnalysis,
        methods: Method[],
        objProps: ObjectProperties,
    ): void {
        if (capture.name !== 'objCall') {
            return;
        }

        const node = capture.node;
        const methodNode = node.childForFieldName('method');
        if (!methodNode) {
            return;
        }

        const argumentsNode = node.childForFieldName('arguments');
        if (!argumentsNode) {
            return;
        }
        const args = argumentsNode.namedChildren.map((arg) => arg.text);

        const extendsionCalls = new Set<string>(['extends', 'include']);
        const propertiesCalls = new Set<string>([
            'attr',
            'attr_reader',
            'attr_writer',
            'attr_accessor',
        ]);

        const methodName = methodNode.text;
        if (extendsionCalls.has(methodName)) {
            args.forEach((arg) => {
                this.addObjExtension(objAnalysis, arg);
            });
        }

        if (propertiesCalls.has(methodName)) {
            args.forEach((arg) => {
                appendOrUpdateElement(objProps.properties, { name: arg });
            });
        }
    }

    protected override processChainNode(
        node: SyntaxNode,
        chain: CallChain[],
    ): boolean {
        if (node.type !== 'call') {
            return false;
        }

        const receiver = node.childForFieldName('receiver');
        const method = node.childForFieldName('method');
        const nodeId = this.mapNodeId(node);

        this.addToChain(receiver, ChainType.MEMBER, chain, nodeId);
        this.addToChain(method, ChainType.FUNCTION, chain, nodeId);

        return true;
    }

    protected override getScopeTypeForNode(node: SyntaxNode): Scope | null {
        const scopeType = RubyParser.scopeTypes[node.type];
        if (!scopeType) {
            return null;
        }

        let nameNode: SyntaxNode | null = null;
        switch (node.type) {
            case 'assignment': {
                const rightNode = node.childForFieldName('right');
                if (rightNode?.type !== 'lambda') {
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
