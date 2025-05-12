import { BaseParser, Method, ObjectProperties } from '../base-parser';
import * as RubyLang from 'tree-sitter-ruby';
import { rubyQueries } from './ruby-queries';
import { Language, QueryCapture } from 'tree-sitter';
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
    protected selfAccessReference: string = '@self';
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
}
