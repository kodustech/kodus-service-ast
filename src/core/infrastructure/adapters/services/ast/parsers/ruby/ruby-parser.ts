import { BaseParser } from '../base-parser';
import * as RubyLang from 'tree-sitter-ruby';
import { rubyQueries } from './ruby-queries';
import { Language, QueryCapture, QueryMatch, SyntaxNode } from 'tree-sitter';
import { Call, TypeAnalysis } from '@/core/domain/ast/contracts/CodeGraph';
import { normalizeAST, normalizeSignature } from '@/shared/utils/ast-helpers';
import { QueryType } from '../query';

export class RubyParser extends BaseParser {
    protected setupLanguage(): void {
        this.language = RubyLang as Language;
    }

    protected setupQueries(): void {
        this.queries = rubyQueries;
    }

    protected processImportCapture(
        capture: QueryCapture,
        filePath: string,
    ): void {
        const node = capture.node;
        const argumentListNode = node.lastNamedChild;
        if (!argumentListNode) {
            return;
        }
        const args = this.processArguments(node.lastNamedChild);
        if (args.length === 0) {
            return;
        }

        let importPath: string | undefined;
        switch (node.firstNamedChild?.text) {
            case 'require':
            case 'require_relative':
            case 'load':
                importPath = args[0];
                break;
            case 'autoload':
                importPath = args[1];
                break;
            default:
                break;
        }
        if (!importPath) {
            return;
        }

        const resolvedImport = this.resolveImportWithCache(
            importPath,
            filePath,
        );

        const normalizedPath = resolvedImport?.normalizedPath || importPath;
        this.context.fileImports.add(normalizedPath);
    }

    private processArguments(node: SyntaxNode) {
        if (!node) {
            return [];
        }

        const args: string[] = [];

        node.namedChildren.forEach((child) => {
            let arg: string | undefined;
            switch (child.type) {
                case 'string':
                    arg = child.firstNamedChild?.text;
                    break;
                default:
                    arg = child.text;
                    break;
            }
            if (arg) {
                args.push(arg);
            }
        });

        return args;
    }

    protected processDefinitionCapture(
        capture: QueryCapture,
        absolutePath: string,
    ): void {
        switch (capture.name) {
            case 'definition.class':
                this.processClassDefinition(capture.node, absolutePath);
                break;
            case 'definition.module':
                this.processModuleDefinition(capture.node);
                break;
            case 'definition.function':
                this.processFunctionDefinition(capture.node);
                break;
            default:
                break;
        }
    }

    private processClassDefinition(
        node: SyntaxNode,
        absolutePath: string,
    ): void {
        const identifierNode = node.childForFieldName('name');
        if (!identifierNode) {
            return;
        }

        const className = identifierNode.text;
        this.context.fileClassNames.add(className);

        const key = `${absolutePath}:${className}`;

        const classAnalysis: TypeAnalysis = this.context.types.get(key) || {
            file: absolutePath,
            type: 'class',
            name: className,
            fields: {},
        };
        classAnalysis.file = absolutePath;
        classAnalysis.name = className;

        const superclassNode = node.childForFieldName('superclass');
        if (superclassNode) {
            const superclassName = superclassNode.firstNamedChild?.text;

            let key = `${absolutePath}:${superclassName}`;

            const mapped = this.context.instanceMapping.get(superclassName);
            if (mapped) {
                key = `${mapped}:${superclassName}`;
            }

            const existingExtends = new Set(classAnalysis.implements || []);
            existingExtends.add(key);
            classAnalysis.implements = Array.from(existingExtends);
        }

        const bodyNode = node.namedChildren.find(
            (child) => child.type === 'body_statement',
        );
        if (bodyNode) {
            const init = bodyNode.namedChildren.find(
                (child) =>
                    child.type === 'method' &&
                    child.childForFieldName('name')?.text === 'initialize',
            );

            if (init) {
                this.processClassInitializer(init);
            }

            const instanceVars = node.childrenForFieldName('instance_variable');
            instanceVars.forEach((varNode) => {
                const varName = varNode.text;
                const mappedName = varName.replace('@', '');
                this.context.instanceMapping.set(varName, mappedName);
                this.context.instanceMapping.set(mappedName, mappedName);
                this.context.instanceMapping.set(varName, varName);
            });

            const classVars = node.childrenForFieldName('class_variable');
            classVars.forEach((varNode) => {
                const varName = varNode.text;
                const mappedName = varName.replace('@@', '');
                this.context.instanceMapping.set(varName, mappedName);
                this.context.instanceMapping.set(mappedName, mappedName);
                this.context.instanceMapping.set(varName, varName);
            });
        }

        this.context.types.set(key, classAnalysis);
    }

    private processClassInitializer(node: SyntaxNode): void {
        const instanceVars = node.childrenForFieldName('instance_variable');
        instanceVars.forEach((varNode) => {
            const varName = varNode.text;
            const mappedName = varName.replace('@', '');
            this.context.instanceMapping.set(varName, mappedName);
            this.context.instanceMapping.set(mappedName, mappedName);
            this.context.instanceMapping.set(varName, varName);
        });

        const classVars = node.childrenForFieldName('class_variable');
        classVars.forEach((varNode) => {
            const varName = varNode.text;
            const mappedName = varName.replace('@@', '');
            this.context.instanceMapping.set(varName, mappedName);
            this.context.instanceMapping.set(mappedName, mappedName);
            this.context.instanceMapping.set(varName, varName);
        });

        const paramsNode = node.childForFieldName('parameters');
        if (!paramsNode) {
            return;
        }
        const params = this.processArguments(paramsNode);
        params.forEach((param) => {
            this.context.instanceMapping.set(param, param);
        });
    }

    private processModuleDefinition(node: SyntaxNode): void {
        const identifierNode = node.childForFieldName('name');
        if (!identifierNode) {
            return;
        }

        const moduleName = identifierNode.text;
        this.context.fileClassNames.add(moduleName);

        const bodyNode = node.namedChildren.find(
            (child) => child.type === 'body_statement',
        );
        if (bodyNode) {
            bodyNode.namedChildren.forEach((child) => {
                if (
                    child.type === 'method' ||
                    child.type === 'singleton_method'
                ) {
                    const methodName = child.childForFieldName('name')?.text;
                    if (methodName) {
                        this.context.fileDefines.add(methodName);
                    }
                }
            });

            const instanceVars = node.childrenForFieldName('instance_variable');
            instanceVars.forEach((varNode) => {
                const varName = varNode.text;
                const mappedName = varName.replace('@', '');
                this.context.instanceMapping.set(varName, mappedName);
                this.context.instanceMapping.set(mappedName, mappedName);
                this.context.instanceMapping.set(varName, varName);
            });

            const classVars = node.childrenForFieldName('class_variable');
            classVars.forEach((varNode) => {
                const varName = varNode.text;
                const mappedName = varName.replace('@@', '');
                this.context.instanceMapping.set(varName, mappedName);
                this.context.instanceMapping.set(mappedName, mappedName);
                this.context.instanceMapping.set(varName, varName);
            });
        }
    }

    private processFunctionDefinition(node: SyntaxNode): void {
        const identifierNode = node.childForFieldName('name');
        if (!identifierNode) {
            return;
        }

        const functionName = identifierNode.text;
        this.context.fileDefines.add(functionName);
    }

    protected processCallCapture(
        capture: QueryCapture,
        absolutePath: string,
    ): void {
        const node = capture.node;
        const methodName = node.childForFieldName('method')?.text;
        const instanceName = node
            .childForFieldName('receiver')
            ?.childForFieldName('method')?.text;

        let calledFile = absolutePath;

        const mappedInstance = this.context.instanceMapping.get(instanceName);
        if (mappedInstance) {
            const importedFile =
                this.context.importedMapping.get(mappedInstance);
            if (importedFile) {
                calledFile = importedFile;
            }
        }

        if (calledFile !== absolutePath) {
            this.context.fileCalls.push({
                function: methodName,
                file: calledFile,
                caller: undefined,
            });
        }
    }

    public collectFunctionDetailsWithQuery(
        rootNode: SyntaxNode,
        absolutePath: string,
    ): void {
        const funcQuery = this.newQueryFromType(QueryType.FUNCTION_QUERY);
        const callQuery = this.newQueryFromType(QueryType.FUNCTION_CALL_QUERY);

        const funcCaptures = funcQuery.captures(rootNode);

        for (const { node, name } of funcCaptures) {
            if (name !== 'funcName') {
                continue;
            }
            const funcDeclNode = node.parent;

            if (!funcDeclNode) {
                continue;
            }

            const paramsNode = funcDeclNode.childForFieldName('parameters');
            const params = this.processArguments(paramsNode);
            const funcName = node.text;

            const key = `${absolutePath}:${funcName}`;

            let calledFunctions: Call[] = [];
            let className: string | undefined;
            let current = funcDeclNode.parent;

            while (current) {
                if (current.type === 'class' || current.type === 'module') {
                    const classNameNode =
                        current.childForFieldName('name') ||
                        current.namedChildren.find(
                            (child) => child.type === 'identifier',
                        );
                    if (classNameNode) {
                        className = classNameNode.text;
                    }
                    break;
                }
                current = current.parent;
            }

            const bodyNode = funcDeclNode.namedChildren.find(
                (child) => child.type === 'body_statement',
            );
            if (bodyNode) {
                const callCaptures = callQuery.captures(bodyNode);

                calledFunctions = callCaptures.map((capture) => {
                    const callNode = capture.node;
                    let targetFile = absolutePath;

                    if (callNode.parent && callNode.parent.type === 'call') {
                        const chain = this.getMemberChain(callNode.parent);
                        let instanceName: string | undefined;

                        if (chain.length >= 3 && chain[0].startsWith('@')) {
                            instanceName = chain[1];
                        } else if (chain.length >= 2) {
                            instanceName = chain[0];
                        } else if (chain.length === 1) {
                            instanceName = chain[0];
                        }

                        if (instanceName) {
                            let typeName =
                                this.context.instanceMapping.get(instanceName);
                            if (!typeName) {
                                typeName = instanceName;
                            }

                            const importedFile =
                                this.context.importedMapping.get(typeName);
                            if (importedFile) {
                                targetFile = importedFile;
                            }
                        }
                    }

                    return {
                        function: callNode.text,
                        file: targetFile,
                        caller: funcName,
                    };
                });
            }

            const normalizedBody = normalizeAST(bodyNode);
            const signatureHash = normalizeSignature(params, null);

            this.context.functions.set(key, {
                file: absolutePath,
                name: funcName,
                params,
                lines:
                    funcDeclNode.endPosition.row -
                    funcDeclNode.startPosition.row +
                    1,
                returnType: undefined,
                calls: calledFunctions,
                className,
                startLine: funcDeclNode.startPosition.row + 1,
                endLine: funcDeclNode.endPosition.row + 1,
                functionHash: normalizedBody,
                signatureHash: signatureHash,
                fullText: funcDeclNode.text,
            });
        }
    }

    private getMemberChain(node: SyntaxNode): string[] {
        const chain: string[] = [];
        let current: SyntaxNode | null = node;

        while (current && current.type === 'call') {
            const rec = current.childForFieldName('method');
            if (rec) {
                chain.unshift(rec.text);
            }
            current = current.childForFieldName('receiver');
        }

        if (current) {
            chain.unshift(current.text);
        }

        return chain;
    }

    public collectTypeDetailsUsingQuery(
        rootNode: SyntaxNode,
        absolutePath: string,
    ): void {
        const typeQuery = this.newQueryFromType(QueryType.TYPE_QUERY);
        const matches = typeQuery.matches(rootNode);

        matches.forEach((match) => this.processTypeMatch(match, absolutePath));
    }

    private processTypeMatch(match: QueryMatch, absolutePath: string): void {
        const matches = match.captures.reduce(
            (acc, capture) => {
                acc[capture.name] = capture;
                return acc;
            },
            {} as Record<string, QueryCapture>,
        );

        const { classDecl, className, classHeritage } = matches;
        const { moduleDecl, moduleName } = matches;

        if (classDecl) {
            const classNameNode = className?.node;
            const classHeritageNode = classHeritage?.node;

            if (classNameNode) {
                const classNameText = classNameNode.text;
                const key = `${absolutePath}:${classNameText}`;

                const classObj = this.context.types.get(key) || {
                    file: absolutePath,
                    type: 'class',
                    name: classNameText,
                    fields: {},
                };

                if (classHeritageNode) {
                    let key = `${absolutePath}:${classHeritageNode.text}`;
                    const mapped = this.context.instanceMapping.get(
                        classHeritageNode.text,
                    );
                    if (mapped) {
                        key = `${mapped}:${classHeritageNode.text}`;
                    }

                    const existingExtends = new Set(classObj.implements || []);
                    existingExtends.add(key);
                    classObj.implements = Array.from(existingExtends);
                }

                this.context.types.set(key, classObj);
            }
        }

        if (moduleDecl) {
            const moduleNameNode = moduleName?.node;

            if (moduleNameNode) {
                const moduleNameText = moduleNameNode.text;
                const key = `${absolutePath}:${moduleNameText}`;

                const moduleObj = this.context.types.get(key) || {
                    file: absolutePath,
                    type: 'module',
                    name: moduleNameText,
                    fields: {},
                };

                this.context.types.set(key, moduleObj);
            }
        }
    }
}
