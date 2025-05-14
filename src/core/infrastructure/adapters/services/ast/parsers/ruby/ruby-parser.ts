import {
    BaseParser,
    CallChain,
    ChainType,
    Method,
    ObjectProperties,
} from '../base-parser';
import * as RubyLang from 'tree-sitter-ruby';
import { rubyQueries } from './ruby-queries';
import { Language, QueryCapture, SyntaxNode } from 'tree-sitter';
import { ScopeType, TypeAnalysis } from '@/core/domain/ast/contracts/CodeGraph';
import { QueryType, ParserQuery } from '../query';

export class RubyParser extends BaseParser {
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
    protected selfAccessReference: string = 'self';
    protected rootNodeType: string = 'program';
    protected memberChainNodeTypes = {
        callNodeTypes: ['call'],
        memberNodeTypes: [],
        functionNameFields: ['method'],
        instanceNameTypes: ['identifier', 'self'],
        functionChildFields: ['receiver'],
    };

    protected setupLanguage(): void {
        this.language = RubyLang as Language;
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

        const extendsionCalls = ['extends', 'include'];
        const propertiesCalls = [
            'attr',
            'attr_reader',
            'attr_writer',
            'attr_accessor',
        ];

        const methodName = methodNode.text;
        if (extendsionCalls.includes(methodName)) {
            args.forEach((arg) => {
                this.addObjExtension(objAnalysis, arg);
            });
        }

        if (propertiesCalls.includes(methodName)) {
            args.forEach((arg) => {
                this.addObjProperty(objProps.properties, { name: arg });
            });
        }
    }

    protected override getMemberChain(
        node: SyntaxNode,
        chains: Map<number, CallChain[]>,
    ): CallChain[] {
        if (!node) return [];

        const chain: CallChain[] = [];
        let currentNode: SyntaxNode | null = node;

        while (currentNode) {
            // Check if we've already processed this node
            const cached = chains.get(currentNode.id);
            if (cached) {
                chain.push(...cached);
                break;
            }

            // Exit for unsupported node types
            if (currentNode.type !== 'call') return chain;

            this.processCallNode(currentNode, chain);

            // Cache the current chain
            chains.set(currentNode.id, [...chain]);
            currentNode = currentNode.parent;
        }

        return chain;
    }

    private processCallNode(node: SyntaxNode, chain: CallChain[]) {
        const isMemberType = (n: SyntaxNode | null): boolean =>
            n?.type === 'self' ||
            n?.type === 'identifier' ||
            n?.type === 'constant' ||
            n?.type === 'instance_variable' ||
            n?.type === 'class_variable';

        const receiver = node.childForFieldName('receiver');
        if (isMemberType(receiver)) {
            chain.push({
                name: receiver.text,
                type: ChainType.MEMBER,
                id: node.id,
            });
        }

        const method = node.childForFieldName('method');
        if (method?.type === 'identifier') {
            chain.push({
                name: method.text,
                type: ChainType.FUNCTION,
                id: node.id,
            });
        }
    }
}
