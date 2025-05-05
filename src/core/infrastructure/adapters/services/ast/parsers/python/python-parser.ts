import { BaseParser } from '../base-parser';
import { Language, SyntaxNode, QueryMatch, QueryCapture } from 'tree-sitter';
import * as PythonLang from 'tree-sitter-python';
import { pythonQueries } from './python-queries';
import { Call, TypeAnalysis } from '@/core/domain/ast/contracts/CodeGraph';
import { normalizeAST, normalizeSignature } from '@/shared/utils/ast-helpers';
import { QueryType } from '../query';

export class PythonParser extends BaseParser {
    protected setupLanguage(): void {
        this.language = PythonLang as Language;
    }

    protected setupQueries(): void {
        this.queries = pythonQueries;
    }

    protected processImportCapture(
        capture: QueryCapture,
        filePath: string,
    ): void {
        const node = capture.node;

        const modules: {
            module: string;
            alias: string;
            identifiers: {
                identifier: string;
                alias: string;
            }[];
        }[] = [];

        const children = node.namedChildren;
        switch (node.type) {
            case 'import_statement': {
                children.forEach((child) => {
                    const [module, alias] = this.getNameAliasImport(child);
                    modules.push({ module, alias, identifiers: [] });
                });
                break;
            }
            case 'import_from_statement': {
                const [module, alias] = this.getNameAliasImport(
                    node.firstNamedChild,
                );
                const identifierChildren = children.slice(1);
                const identifiers: { identifier: string; alias: string }[] = [];
                identifierChildren.forEach((child) => {
                    const [identifier, alias] = this.getNameAliasImport(child);
                    identifiers.push({ identifier, alias });
                });
                modules.push({ module, alias, identifiers });
                break;
            }
            default:
                break;
        }

        for (const { module, alias, identifiers } of modules) {
            const resolvedImport = this.resolveImportWithCache(
                module,
                filePath,
            );

            const normalizedPath = resolvedImport?.normalizedPath || module;
            this.context.fileImports.add(normalizedPath);

            if (alias) {
                this.context.importedMapping.set(alias, normalizedPath);
            }

            for (const { identifier, alias } of identifiers) {
                this.context.importedMapping.set(identifier, normalizedPath);

                if (alias) {
                    this.context.importedMapping.set(alias, identifier);
                }
            }
        }
    }

    private getNameAliasImport(node: SyntaxNode): [string, string] {
        switch (node.grammarType) {
            case 'relative_import':
            case 'dotted_name':
                return [node.text, ''];
            case 'aliased_import':
                return [
                    node.firstNamedChild?.text || '',
                    node.lastNamedChild?.text || '',
                ];
            case 'wildcard_import':
                return ['*', ''];
            default:
                return ['', ''];
        }
    }

    protected processDefinitionCapture(
        capture: QueryCapture,
        absolutePath: string,
    ): void {
        switch (capture.name) {
            case 'definition.class': {
                this.processClassDefinition(capture.node, absolutePath);
                break;
            }
            case 'definition.function': {
                const functionName = capture.node.childForFieldName('name');
                this.context.fileDefines.add(
                    functionName.text ?? capture.node.text,
                );
                break;
            }
            default: {
                break;
            }
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

        const argumentListNode = node.childForFieldName('superclasses');
        if (argumentListNode && argumentListNode.namedChildCount > 0) {
            const keys: string[] = [];
            const superClasses = argumentListNode.namedChildren.map(
                (child) => child.text,
            );

            superClasses.forEach((superClass) => {
                const mapped = this.context.importedMapping.get(superClass);
                if (mapped) {
                    keys.push(`${mapped}:${superClass}`);
                } else {
                    keys.push(`${absolutePath}:${superClass}`);
                }
            });

            if (keys.length > 0) {
                const existing = new Set(classAnalysis.implements || []);
                keys.forEach((key) => existing.add(key));
                classAnalysis.implements = Array.from(existing);
            }
        }

        const bodyBlockNode = node.childForFieldName('body');
        if (bodyBlockNode) {
            const init = bodyBlockNode.namedChildren.find(
                (child) =>
                    child.type === 'function_definition' &&
                    child.childForFieldName('name')?.text === '__init__',
            );

            if (init) {
                this.processClassInitializer(init);
            }
        }

        this.context.types.set(key, classAnalysis);
    }

    private processClassInitializer(node: SyntaxNode) {
        const parametersNode = node.childForFieldName('parameters');
        if (!parametersNode) {
            return;
        }

        const params = this.processParametersDeclaration(parametersNode);
        params.forEach(({ name, type }) => {
            this.context.instanceMapping.set(name, type);
            this.context.instanceMapping.set(type, type);
        });
    }

    private processParametersDeclaration(node: SyntaxNode) {
        const children = node.namedChildren;
        const params: {
            name: string;
            type: string;
        }[] = [];

        children.forEach((child) => {
            let name: string;
            let type: string;

            switch (child.type) {
                case 'identifier':
                    name = child.text;
                    break;
                case 'typed_parameter':
                case 'typed_default_parameter':
                    type = child.childForFieldName('type')?.text || '';
                // fallthrough
                case 'default_parameter':
                    name =
                        child.childForFieldName('name')?.text ||
                        child.firstNamedChild?.text ||
                        '';
                    break;
                case 'list_splat_pattern':
                case 'dict_splat_pattern':
                    name = child.firstChild?.text || '';
                    break;
                default:
                    break;
            }

            if (name && type) {
                params.push({ name, type });
            }
        });

        return params;
    }

    protected processCallCapture(
        capture: QueryCapture,
        absolutePath: string,
    ): void {
        const attributes = capture.node.firstNamedChild;
        const method = attributes.lastNamedChild;
        const instanceAtrributes = attributes.firstNamedChild;
        const instance = instanceAtrributes.lastNamedChild;
        const instanceName = instance.text;
        const methodName = method.text;

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
            const returnTypeNode =
                funcDeclNode.childForFieldName('return_type');
            const params = this.processParametersDeclaration(paramsNode);
            const paramsName = params.map(({ name }) => name);
            const funcName = node.text;

            const key = `${absolutePath}:${funcName}`;

            const bodyNode = funcDeclNode.childForFieldName('body');

            let calledFunctions: Call[] = [];
            let className: string | undefined;
            let current = funcDeclNode.parent;

            while (current) {
                if (current.type === 'class_definition') {
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

            if (bodyNode) {
                const callCaptures = callQuery.captures(bodyNode);

                calledFunctions = callCaptures.map((capture) => {
                    const callNode = capture.node;
                    let targetFile = absolutePath;

                    if (callNode.parent && callNode.parent.type === 'call') {
                        const chain = this.getMemberChain(callNode.parent);
                        let instanceName: string | undefined;

                        if (chain.length >= 3 && chain[0] === 'self') {
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

            const returnType = returnTypeNode?.text ?? '';
            const normalizedBody = normalizeAST(bodyNode);
            const signatureHash = normalizeSignature(paramsName, returnType);

            this.context.functions.set(key, {
                file: absolutePath,
                name: funcName,
                params: paramsName,
                lines:
                    funcDeclNode.endPosition.row -
                    funcDeclNode.startPosition.row +
                    1,
                returnType: returnType,
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

    private getMemberChain(node: SyntaxNode) {
        const chain: string[] = [];
        let current: SyntaxNode | null = node;
        while (current && current.type === 'call') {
            const attr = current.childForFieldName('attribute');
            if (attr) {
                chain.unshift(attr.text);
            }
            current = current.childForFieldName('object');
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
        const query = this.newQueryFromType(QueryType.TYPE_QUERY);
        const matches = query.matches(rootNode);

        matches.forEach((match) => this.processTypeMatch(match, absolutePath));
    }

    private processTypeMatch(match: QueryMatch, absolutePath: string) {
        const matches = match.captures.reduce(
            (acc, capture) => {
                acc[capture.name] = capture;
                return acc;
            },
            {} as Record<string, QueryCapture>,
        );

        const { classDecl, className, classHeritage } = matches;

        if (classDecl) {
            const nameNode = className?.node;
            const heritageNode = classHeritage?.node;
            if (nameNode) {
                const classNameStr = nameNode.text;
                const key = `${absolutePath}:${classNameStr}`;

                const classObj = this.context.types.get(key) || {
                    file: absolutePath,
                    type: 'class',
                    name: classNameStr,
                    fields: {},
                };

                if (heritageNode && heritageNode.namedChildCount > 0) {
                    const keys: string[] = [];
                    const superClasses = heritageNode.namedChildren.map(
                        (child) => child.text,
                    );

                    superClasses.forEach((superClass) => {
                        const mapped =
                            this.context.importedMapping.get(superClass);
                        if (mapped) {
                            keys.push(`${mapped}:${superClass}`);
                        } else {
                            keys.push(`${absolutePath}:${superClass}`);
                        }
                    });

                    if (keys.length > 0) {
                        const existing = new Set(classObj.implements || []);
                        keys.forEach((key) => existing.add(key));
                        classObj.implements = Array.from(existing);
                    }
                }

                this.context.types.set(key, classObj);
            }
        }
    }
}
