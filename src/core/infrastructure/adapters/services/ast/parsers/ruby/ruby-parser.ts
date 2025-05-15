import {
    BaseParser,
    CallChain,
    ChainType,
    Method,
    ObjectProperties,
} from '../base-parser';
import * as RubyLang from 'tree-sitter-ruby';
import { rubyQueries } from './ruby-queries';
import { Language, Query, QueryCapture, SyntaxNode } from 'tree-sitter';
import { ScopeType, TypeAnalysis } from '@/core/domain/ast/contracts/CodeGraph';

export class RubyParser extends BaseParser {
    protected override scopes: Map<string, ScopeType> = new Map<
        string,
        ScopeType
    >([
        ['class', ScopeType.CLASS],
        ['module', ScopeType.CLASS],

        ['function', ScopeType.FUNCTION],
        ['method', ScopeType.METHOD],
        ['singleton_method', ScopeType.METHOD],
        ['assignment', ScopeType.FUNCTION],
    ] as const);
    protected override constructorName: string = 'initialize';
    protected override selfAccessReference: string = 'self';

    protected override validMemberTypes: Set<string> = new Set([
        'self',
        'identifier',
        'constant',
        'instance_variable',
        'class_variable',
    ]);
    protected override validFunctionTypes: Set<string> = new Set([
        'identifier',
    ]);

    protected override setupLanguage(): void {
        this.language = RubyLang as Language;
    }

    protected override setupQueries(): void {
        for (const [key, value] of rubyQueries.entries()) {
            const query = new Query(this.language, value.query);
            this.queries.set(key, query);
        }
    }

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
                this.addObjProperty(objProps.properties, { name: arg });
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
}
