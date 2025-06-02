import { BaseParser } from '../base-parser';
import * as RubyLang from 'tree-sitter-ruby';
import { rubyQueries } from './ruby-queries';
import { Language, QueryCapture, SyntaxNode } from 'tree-sitter';
import { TypeAnalysis } from '@/core/domain/ast/contracts/CodeGraph';
import { QueryType, ParserQuery } from '../query';
import {
    Method,
    ObjectProperties,
    ChainType,
    CallChain,
    Scope,
    ScopeType,
} from '@/core/domain/ast/contracts/Parser';

export class RubyParser extends BaseParser {
    private static readonly language = RubyLang as Language;
    private static readonly rawQueries = rubyQueries;
    private static readonly constructorName = 'initialize';
    private static readonly selfAccessReference = 'self';
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

    protected getLanguage(): Language {
        return RubyParser.language;
    }
    protected getRawQueries(): Map<QueryType, ParserQuery> {
        return RubyParser.rawQueries;
    }
    protected getConstructorName(): string {
        return RubyParser.constructorName;
    }
    protected getSelfAccessReference(): string {
        return RubyParser.selfAccessReference;
    }
    protected getValidMemberTypes(): Set<string> {
        return RubyParser.validMemberTypes;
    }
    protected getValidFunctionTypes(): Set<string> {
        return RubyParser.validFunctionTypes;
    }

    private static readonly SCOPE_TYPES: Record<string, ScopeType> = {
        class: ScopeType.CLASS,
        module: ScopeType.CLASS,
        method: ScopeType.METHOD,
        singleton_method: ScopeType.METHOD,
        assignment: ScopeType.FUNCTION,
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
                this.appendOrUpdateElement(objProps.properties, { name: arg });
            });
        }
    }

    protected override processChainNode(
        node: SyntaxNode,
        chain: CallChain[],
    ): boolean {
        if (node.type !== 'call') return false;

        const receiver = node.childForFieldName('receiver');
        const method = node.childForFieldName('method');

        this.addToChain(receiver, ChainType.MEMBER, chain, node.id);
        this.addToChain(method, ChainType.FUNCTION, chain, node.id);

        return true;
    }

    protected override getScopeTypeForNode(node: SyntaxNode): Scope | null {
        const scopeType = RubyParser.SCOPE_TYPES[node.type];
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
