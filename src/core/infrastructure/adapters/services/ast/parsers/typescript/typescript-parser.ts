import { BaseParser } from '../base-parser';
import * as TypeScriptLang from 'tree-sitter-typescript/typescript';
import { typeScriptQueries } from './typescript-queries';
import { Language, SyntaxNode } from 'tree-sitter';
import { ScopeType } from '@/core/domain/ast/contracts/CodeGraph';
import { QueryType, ParserQuery } from '../query';

export class TypeScriptParser extends BaseParser {
    protected queries: Map<QueryType, ParserQuery> = typeScriptQueries;
    protected scopes: Map<string, ScopeType> = new Map<string, ScopeType>([
        ['class_declaration', ScopeType.CLASS],
        ['abstract_class_declaration', ScopeType.CLASS],
        ['interface_declaration', ScopeType.INTERFACE],
        ['enum_declaration', ScopeType.ENUM],

        ['function_declaration', ScopeType.FUNCTION],
        ['method_declaration', ScopeType.METHOD],
        ['variable_declarator', ScopeType.FUNCTION],
    ] as const);
    protected constructorName: string = 'constructor';
    protected selfAccessReference: string = 'this';
    protected rootNodeType: string = 'program';
    protected memberChainNodeTypes = {
        callNodeTypes: ['call_expression'],
        memberNodeTypes: ['member_expression'],
        functionNameFields: ['property'],
        instanceNameTypes: ['identifier', 'this'],
        functionChildFields: ['object', 'function'],
    };

    protected setupLanguage(): void {
        this.language = TypeScriptLang as Language;
    }

    protected override getMemberChain(node: SyntaxNode): {
        name: string;
        type: 'member' | 'function';
    }[] {
        const chain = [] as {
            name: string;
            type: 'member' | 'function';
        }[];

        let currentNode: SyntaxNode | null = node;

        const {
            callNodeTypes,
            memberNodeTypes,
            functionNameFields,
            instanceNameTypes,
            functionChildFields,
        } = this.memberChainNodeTypes;

        while (currentNode) {
            if (memberNodeTypes.includes(currentNode.type)) {
                for (const functionNameField of functionNameFields) {
                    const memberNameNode =
                        currentNode.childForFieldName(functionNameField);
                    if (memberNameNode) {
                        if (callNodeTypes.includes(currentNode.parent.type)) {
                            chain.unshift({
                                name: memberNameNode.text,
                                type: 'function',
                            });
                            break;
                        }

                        chain.unshift({
                            name: memberNameNode.text,
                            type: 'member',
                        });
                        break;
                    }
                }
            }
            if (instanceNameTypes.includes(currentNode.type)) {
                chain.unshift({
                    name: currentNode.text,
                    type: 'member',
                });
            }
            if (currentNode.text === this.selfAccessReference) {
                chain.unshift({
                    name: this.selfAccessReference,
                    type: 'member',
                });
            }
            let childNodeFound = false;
            for (const functionChildField of functionChildFields) {
                const childNode =
                    currentNode.childForFieldName(functionChildField);
                if (childNode) {
                    currentNode = childNode;
                    childNodeFound = true;
                    break;
                }
            }
            if (!childNodeFound) {
                break; // Exit the loop if no child node is found
            }
        }

        return chain;
    }
}
