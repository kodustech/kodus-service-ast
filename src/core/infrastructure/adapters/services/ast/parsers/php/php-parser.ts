import { Language, QueryCapture, QueryMatch, SyntaxNode } from 'tree-sitter';
import { BaseParser } from '../base-parser';
import { phpQueries } from './php-queries';
import * as PhpLang from 'tree-sitter-php/php';
import {
    findNamedChildByType,
    findNamedChildrenByType,
    normalizeAST,
    normalizeSignature,
} from '@/shared/utils/ast-helpers';
import { Call, TypeAnalysis } from '@/core/domain/ast/contracts/CodeGraph';
import { QueryType } from '../query';

export class PhpParser extends BaseParser {
    protected setupLanguage(): void {
        this.language = PhpLang as Language;
    }

    protected setupQueries(): void {
        this.queries = phpQueries;
    }

    protected processImportCapture(
        capture: QueryCapture,
        filePath: string,
    ): void {
        const parentNode = capture.node;
        if (!parentNode) {
            return;
        }

        const imported: {
            name: string;
            alias: string | null;
            imports: {
                name: string;
                alias: string | null;
            }[];
        }[] = [];

        for (const node of parentNode.namedChildren) {
            const newImport = {
                name: '',
                alias: null,
                imports: [],
            };

            switch (node.type) {
                case 'namespace_use_clause': {
                    const qualifiedName = findNamedChildByType(
                        node,
                        'qualified_name',
                    );
                    if (!qualifiedName) {
                        return;
                    }

                    const namespaceName = findNamedChildByType(
                        qualifiedName,
                        'namespace_name',
                    );

                    newImport.name = namespaceName ? namespaceName.text : '';

                    const imports = findNamedChildByType(qualifiedName, 'name');
                    if (!imports) {
                        return null;
                    }

                    const importName = imports.text;

                    const aliasingClause = findNamedChildByType(node, 'name');
                    const alias = aliasingClause ? aliasingClause.text : null;

                    newImport.imports.push({
                        name: importName,
                        alias,
                    });

                    break;
                }
                case 'namespace_use_group': {
                    const namespaceName = findNamedChildByType(
                        parentNode,
                        'namespace_name',
                    );
                    if (!namespaceName) {
                        return;
                    }

                    newImport.name = namespaceName.text;

                    const namespaceClauses = findNamedChildrenByType(
                        node,
                        'namespace_use_clause',
                    );
                    if (namespaceClauses.length === 0) {
                        return;
                    }

                    for (const clause of namespaceClauses) {
                        const imports = findNamedChildrenByType(clause, 'name');
                        if (imports.length === 0) {
                            return null;
                        }

                        const importName = imports[0].text;
                        const alias = imports[1] ? imports[1].text : null;

                        newImport.imports.push({
                            name: importName,
                            alias,
                        });
                    }
                    break;
                }
                case 'require_expression':
                case 'require_once_expression':
                case 'include_expression':
                case 'include_once_expression': {
                    let parent = node;
                    let trailingSlash = false;
                    const binaryExpression = findNamedChildByType(
                        parent,
                        'binary_expression',
                    );
                    if (binaryExpression) {
                        parent = binaryExpression;

                        const left = binaryExpression.childForFieldName('left');
                        if (
                            left &&
                            (left.text === '__DIR__' ||
                                left.text === 'dirname(__FILE__)')
                        ) {
                            trailingSlash = true;
                        }
                    }

                    const path = findNamedChildByType(parent, 'string');
                    if (path) {
                        const importPath = path.text
                            .replace(/['"]/g, '')
                            .replace(/\\/g, '/');
                        newImport.name = trailingSlash
                            ? importPath.slice(1) // Remove the leading '/' when concatenating with __DIR__ or dirname(__FILE__)
                            : importPath;
                        newImport.imports.push({
                            name: '*',
                            alias: null,
                        });
                    }
                    break;
                }
                default:
                    continue;
            }

            imported.push(newImport);
        }

        for (const importedItem of imported) {
            const resolvedImport = this.resolveImportWithCache(
                importedItem.name,
                filePath,
            );

            const normalizedPath =
                resolvedImport?.normalizedPath || importedItem.name;
            this.context.fileImports.add(normalizedPath);

            if (importedItem.alias) {
                this.context.importedMapping.set(
                    importedItem.alias,
                    normalizedPath,
                );
            }

            importedItem.imports.forEach((importDetail) => {
                this.context.importedMapping.set(
                    importDetail.name,
                    normalizedPath,
                );
                if (importDetail.alias) {
                    this.context.importedMapping.set(
                        importDetail.alias,
                        importDetail.name,
                    );
                }
            });
        }
    }

    protected processDefinitionCapture(
        capture: QueryCapture,
        absolutePath: string,
    ): void {
        switch (capture.name) {
            case 'definition.class':
                this.processClassDefinition(capture, absolutePath);
                break;
            case 'definition.interface':
                this.processInterfaceDefinition(capture);
                break;
            case 'definition.enum':
            case 'definition.function':
            case 'definition.method':
                this.processSimpleDefinition(capture);
                break;
            default:
                return;
        }
    }

    private processClassDefinition(
        capture: QueryCapture,
        absolutePath: string,
    ): void {
        const node = capture.node;
        if (!node) {
            return;
        }
        const classNameNode = node.childForFieldName('name');
        if (!classNameNode) {
            return;
        }

        const className = classNameNode.text;
        this.context.fileClassNames.add(className);

        const key = `${absolutePath}:${className}`;

        const classAnalysis = this.context.types.get(key) || {
            name: className,
            type: 'class',
            file: absolutePath,
            fields: {},
        };

        classAnalysis.file = absolutePath;
        classAnalysis.name = className;

        const baseClause = findNamedChildByType(node, 'base_clause');
        if (baseClause) {
            const baseClassNameNode = findNamedChildByType(baseClause, 'name');
            if (baseClassNameNode) {
                const existingExtends = new Set(classAnalysis.extends || []);
                existingExtends.add(baseClassNameNode.text);
                classAnalysis.extends = Array.from(existingExtends);
            }
        }

        const implementsClause = findNamedChildByType(
            node,
            'class_interface_clause',
        );
        if (implementsClause) {
            this.addImplementedToType(
                classAnalysis,
                implementsClause,
                absolutePath,
            );
        }

        const classBody = node.childForFieldName('body');
        if (classBody) {
            const methods = findNamedChildrenByType(
                classBody,
                'method_declaration',
            );
            const constructor = methods.find((method) => {
                const methodNameNode = method.childForFieldName('name');
                return methodNameNode && methodNameNode.text === '__construct';
            });

            if (constructor) {
                const parameters = constructor.childForFieldName('parameters');
                if (parameters) {
                    const parameterDetails = this.processParameters(parameters);
                    parameterDetails.forEach((param) => {
                        if (param.name && param.type) {
                            this.context.instanceMapping.set(
                                param.name,
                                param.type,
                            );
                            this.context.instanceMapping.set(
                                param.type,
                                param.name,
                            );
                        }
                    });
                }
            }
        }
    }

    private processParameters(parameters: SyntaxNode): {
        name: string;
        type: string;
        defaultValue: string | null;
    }[] {
        const params = [] as {
            name: string;
            type: string;
            defaultValue: string | null;
        }[];

        const parameterNodes = parameters.namedChildren;

        parameterNodes.forEach((paramNode) => {
            const paramNameNode = paramNode.childForFieldName('name');
            if (!paramNameNode) {
                return;
            }

            const paramTypeNode = paramNode.childForFieldName('type');
            const paramDefaultValueNode =
                paramNode.childForFieldName('default_value');

            const paramType = paramTypeNode ? paramTypeNode.text : null;
            const paramDefaultValue = paramDefaultValueNode
                ? paramDefaultValueNode.text
                : null;

            params.push({
                name: paramNameNode.text,
                type: paramType,
                defaultValue: paramDefaultValue,
            });
        });

        return params;
    }

    private processInterfaceDefinition(capture: QueryCapture): void {
        const node = capture.node;
        if (!node) {
            return;
        }
        const interfaceNameNode = node.childForFieldName('name');
        if (!interfaceNameNode) {
            return;
        }

        const interfaceName = interfaceNameNode.text;
        this.context.fileClassNames.add(interfaceName);

        const body = node.childForFieldName('body');
        if (!body) {
            return;
        }

        const methods = findNamedChildrenByType(body, 'method_declaration');
        for (const method of methods) {
            const methodNameNode = method.childForFieldName('name');
            if (!methodNameNode) {
                continue;
            }
            this.context.fileDefines.add(methodNameNode.text);
        }
    }

    private processSimpleDefinition(capture: QueryCapture): void {
        const node = capture.node;
        if (!node) {
            return;
        }
        const nameNode = node.childForFieldName('name');
        if (!nameNode) {
            return;
        }

        const name = nameNode.text;
        this.context.fileDefines.add(name);
    }

    protected processCallCapture(
        capture: QueryCapture,
        absolutePath: string,
    ): void {
        const node = capture.node;
        if (!node) {
            return;
        }

        const methodNode = node.childForFieldName('name');
        if (!methodNode) {
            return;
        }

        const instance = node.childForFieldName('object');
        if (!instance) {
            return;
        }
        const instanceNameNode = instance.childForFieldName('name');
        if (!instanceNameNode) {
            return;
        }

        const instanceName = instanceNameNode.text;
        const methodName = methodNode.text;
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
            if (!node) {
                continue;
            }

            let funcNode = node;
            let funcNameNode: SyntaxNode | null = null;
            if (name === 'arrow') {
                const expression = findNamedChildByType(
                    node,
                    'assignment_expression',
                );
                if (!expression) {
                    continue;
                }
                funcNameNode = expression.childForFieldName('left');
                funcNode = expression.childForFieldName('right');
            } else {
                funcNameNode = node.childForFieldName('name');
            }

            if (!funcNameNode || !funcNode) {
                continue;
            }

            const funcName = funcNameNode.text;

            const bodyNode = funcNode.childForFieldName('body');

            let calledFunctions: Call[] = [];
            let className: string | null = null;
            let current = funcNode.parent;

            while (current) {
                if (current.type === 'class_declaration') {
                    const classNameNode = current.childForFieldName('name');
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
                    if (!callNode) {
                        return null;
                    }
                    let targetFile = absolutePath;

                    const chain = this.getMemberChain(callNode);
                    let instanceName: string | undefined;

                    if (chain.length >= 3 && chain[0] === '$this') {
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

                    return {
                        function: chain.pop() || '',
                        file: targetFile,
                        caller: funcName,
                    };
                });
            }

            const paramsNode = funcNode.childForFieldName('parameters');
            const params = this.processParameters(paramsNode);
            const paramsName = params.map((param) => param.name);
            const returnTypeNode = funcNode.childForFieldName('return_type');

            const returnType = returnTypeNode ? returnTypeNode.text : null;
            const normalizedBody = normalizeAST(bodyNode);
            const signatureHash = normalizeSignature(paramsName, returnType);

            const key = `${absolutePath}:${funcName}`;

            this.context.functions.set(key, {
                file: absolutePath,
                name: funcName,
                params: paramsName,
                lines:
                    funcNode.endPosition.row - funcNode.startPosition.row + 1,
                returnType: returnType,
                calls: calledFunctions,
                className,
                startLine: node.startPosition.row + 1,
                endLine: node.endPosition.row + 1,
                functionHash: normalizedBody,
                signatureHash: signatureHash,
                fullText: funcNode.text,
            });
        }
    }

    private getMemberChain(node: SyntaxNode): string[] {
        const chain: string[] = [];
        let currentNode: SyntaxNode | null = node;

        const nodeTypes = [
            'member_call_expression',
            'function_call_expression',
            'member_access_expression',
        ];

        while (currentNode) {
            if (nodeTypes.includes(currentNode.type)) {
                const memberNameNode = currentNode.childForFieldName('name');
                if (memberNameNode) {
                    chain.unshift(memberNameNode.text);
                }
            }
            if (
                currentNode.type === 'variable_name' &&
                currentNode.text === '$this'
            ) {
                chain.unshift('$this');
            }
            currentNode = currentNode.childForFieldName('object');
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

    private processTypeMatch(match: QueryMatch, absolutePath: string): void {
        const captures = match.captures.reduce(
            (acc, capture) => {
                acc[capture.name] = capture.node;
                return acc;
            },
            {} as Record<string, SyntaxNode>,
        );

        const { classDecl, interfaceDecl, enumDecl } = captures;

        if (classDecl) {
            this.processClassTypeMatch(captures, absolutePath);
        } else if (interfaceDecl) {
            this.processInterfaceTypeMatch(captures, absolutePath);
        } else if (enumDecl) {
            this.processEnumTypeMatch(captures, absolutePath);
        }
    }

    private processClassTypeMatch(
        captures: Record<string, SyntaxNode>,
        absolutePath: string,
    ): void {
        const {
            classDecl,
            className,
            classExtends,
            classImplements,
            classBody,
        } = captures;

        if (!classDecl || !className || !classBody) {
            return;
        }

        const key = `${absolutePath}:${className.text}`;
        const classObj: TypeAnalysis = this.context.types.get(key) || {
            file: absolutePath,
            type: 'class',
            name: className.text,
            fields: {},
        };

        this.addExtendedToType(classObj, classExtends, absolutePath);
        this.addImplementedToType(classObj, classImplements, absolutePath);
        this.addFieldsToType(classObj, classBody);

        this.context.types.set(key, classObj);
    }

    private processInterfaceTypeMatch(
        captures: Record<string, SyntaxNode>,
        absolutePath: string,
    ): void {
        const {
            interfaceDecl,
            interfaceName,
            interfaceExtends,
            interfaceBody,
        } = captures;

        if (!interfaceDecl || !interfaceName || !interfaceBody) {
            return;
        }

        const key = `${absolutePath}:${interfaceName.text}`;
        const interfaceObj: TypeAnalysis = this.context.types.get(key) || {
            file: absolutePath,
            type: 'interface',
            name: interfaceName.text,
            fields: {},
        };

        this.addExtendedToType(interfaceObj, interfaceExtends, absolutePath);
        this.addFieldsToType(interfaceObj, interfaceBody);

        this.context.types.set(key, interfaceObj);
    }

    private processEnumTypeMatch(
        captures: Record<string, SyntaxNode>,
        absolutePath: string,
    ): void {
        const { enumDecl, enumName, enumBody, enumImplements } = captures;

        if (!enumDecl || !enumName || !enumBody) {
            return;
        }

        const key = `${absolutePath}:${enumName.text}`;
        const enumObj: TypeAnalysis = this.context.types.get(key) || {
            file: absolutePath,
            type: 'enum',
            name: enumName.text,
            fields: {},
        };

        this.addImplementedToType(enumObj, enumImplements, absolutePath);
        this.addFieldsToType(enumObj, enumBody);

        this.context.types.set(key, enumObj);
    }

    private addExtendedToType(
        classObj: TypeAnalysis,
        baseClause: SyntaxNode,
        absolutePath: string,
    ): void {
        if (!baseClause) {
            return;
        }

        const baseClass = this.getExtendedClass(baseClause);

        if (baseClass) {
            let key = `${absolutePath}:${baseClass}`;
            const mapped = this.context.importedMapping.get(baseClass);
            if (mapped) {
                key = `${mapped}:${baseClass}`;
            }

            const existingExtends = new Set(classObj.extends || []);
            existingExtends.add(key);
            classObj.extends = Array.from(existingExtends);
        }
    }

    private getExtendedClass(baseClause: SyntaxNode): string | null {
        const baseClassNameNode = findNamedChildByType(baseClause, 'name');
        if (baseClassNameNode) {
            return baseClassNameNode.text;
        }
        return null;
    }

    private addImplementedToType(
        classObj: TypeAnalysis,
        implementsClause: SyntaxNode,
        absolutePath: string,
    ): void {
        if (!implementsClause) {
            return;
        }

        const interfacesNames = this.getImplementsInterfaces(implementsClause);
        if (interfacesNames.length > 0) {
            const keys = interfacesNames.map((interfaceName) => {
                let key = `${absolutePath}:${interfaceName}`;
                const mapped = this.context.importedMapping.get(interfaceName);
                if (mapped) {
                    key = `${mapped}:${interfaceName}`;
                }
                return key;
            });

            const existingImplements = new Set(classObj.implements || []);
            keys.forEach((key) => {
                existingImplements.add(key);
            });

            classObj.implements = Array.from(existingImplements);
        }
    }

    private getImplementsInterfaces(implementsClause: SyntaxNode): string[] {
        const interfacesNames = findNamedChildrenByType(
            implementsClause,
            'name',
        );
        return interfacesNames.map(
            (interfaceNameNode) => interfaceNameNode.text,
        );
    }

    private addFieldsToType(typeObj: TypeAnalysis, bodyNode: SyntaxNode): void {
        if (!bodyNode) {
            return;
        }

        const fields = this.parseDeclarationList(bodyNode);
        typeObj.fields = {
            ...typeObj.fields,
            ...fields,
        };
    }

    private parseDeclarationList(
        declarationList: SyntaxNode,
    ): Record<string, string> {
        const fields: Record<string, string> = {};

        const constants = findNamedChildrenByType(
            declarationList,
            'const_declaration',
        );
        const methods = findNamedChildrenByType(
            declarationList,
            'method_declaration',
        );
        const enumCases = findNamedChildrenByType(declarationList, 'enum_case');

        constants.forEach((constant) =>
            this.processConstantDeclaration(constant, fields),
        );
        methods.forEach((method) =>
            this.processMethodDeclaration(method, fields),
        );
        enumCases.forEach((enumCase) =>
            this.processEnumCaseDeclaration(enumCase, fields),
        );

        return fields;
    }

    private processConstantDeclaration(
        constant: SyntaxNode,
        fields: Record<string, string>,
    ): void {
        const constElement = findNamedChildByType(constant, 'const_element');
        if (!constElement) {
            return;
        }
        const nameNode = findNamedChildByType(constElement, 'name');
        const typeNode = constant.childForFieldName('type');

        if (nameNode) {
            const name = nameNode.text;
            const type = typeNode ? typeNode.text : 'unknown';
            fields[name] = type;
        }
    }

    private processMethodDeclaration(
        method: SyntaxNode,
        fields: Record<string, string>,
    ): void {
        const nameNode = method.childForFieldName('name');
        const typeNode = method.childForFieldName('return_type');
        const paramsNode = method.childForFieldName('parameters');

        if (nameNode) {
            const name = nameNode.text;
            const type = typeNode ? typeNode.text : 'unknown';
            const params = paramsNode ? paramsNode.text : '()';
            const methodSignature = `${params}:${type}`;
            fields[name] = methodSignature;
        }
    }

    private processEnumCaseDeclaration(
        enumCase: SyntaxNode,
        fields: Record<string, string>,
    ): void {
        const nameNode = enumCase.childForFieldName('name');
        const valueNode = enumCase.childForFieldName('value');

        if (nameNode) {
            const name = nameNode.text;
            const value = valueNode ? valueNode.text : 'unknown';
            fields[name] = value;
        }
    }
}
