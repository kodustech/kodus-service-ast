import {
    Language,
    Query,
    QueryCapture,
    QueryMatch,
    SyntaxNode,
} from 'tree-sitter';
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

type ClassMethod = {
    name: string;
    params: {
        name: string;
        type: string | null;
    }[];
    returnType: string | null;
};

type ClassProperty = {
    name: string;
    type: string | null;
};

export class PhpParser extends BaseParser {
    protected constructorName: string = '__construct';

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
        throw new Error('Method not implemented.');
    }

    public collectAllInOnePass(
        rootNode: SyntaxNode,
        filePath: string,
        absolutePath: string,
    ): Promise<void> {
        this.collectImports(rootNode, filePath);
        this.collectDeclarations(rootNode, absolutePath);

        // legacy, original typescript was async
        return Promise.resolve();
    }

    private matchCapturesToRecord<
        T extends Record<string, SyntaxNode | SyntaxNode[]>,
    >(match: QueryMatch): T {
        const result = {} as T;

        for (const capture of match.captures) {
            const name = capture.name;
            const node = capture.node;

            if (!name) continue;

            const key = name as keyof T;
            const current = result[key];

            if (Array.isArray(current)) {
                // If it's already an array, just push
                current.push(node);
            } else if (current !== undefined) {
                // If already exists and not an array, convert to array
                result[key] = [current, node] as T[typeof key];
            } else {
                // First time assigning
                result[key] = node as T[typeof key];
            }
        }
        return result;
    }

    public collectImports(rootNode: SyntaxNode, filePath: string): void {
        const [query, auxQuery] = this.newQueryFromType(QueryType.IMPORT_QUERY);
        const matches = query.matches(rootNode);
        if (matches.length === 0) return;

        for (const match of matches) {
            const captures = match.captures;
            // captures come in order so we can safely assume the first one is the origin
            const origin = captures[0];
            if (!origin) continue;

            const originName = this.getOriginName(origin, auxQuery);
            if (!originName) continue;

            const imported = this.parseImportedSymbols(captures);
            const resolvedImport = this.resolveImportWithCache(
                originName,
                filePath,
            );
            if (!resolvedImport) continue;

            const normalizedPath = resolvedImport.normalizedPath || originName;
            this.context.fileImports.add(normalizedPath);

            this.registerImportedSymbols(imported, normalizedPath);
        }
    }

    private getOriginName(
        origin: QueryCapture,
        auxQuery: Query,
    ): string | null {
        switch (origin.name) {
            case 'auxiliary':
                return this.processImportAuxiliary(origin.node, auxQuery);
            case 'origin':
                return origin.node.text;
            default:
                return null;
        }
    }

    private parseImportedSymbols(
        captures: QueryCapture[],
    ): { symbol: string; alias: string | null }[] {
        const imported: { symbol: string; alias: string | null }[] = [];

        for (const capture of captures) {
            const captureName = capture.name;
            const nodeText = capture.node.text;

            if (captureName === 'symbol') {
                imported.push({ symbol: nodeText, alias: null });
            }

            if (captureName === 'alias' && imported.length > 0) {
                imported[imported.length - 1].alias = nodeText;
            }
        }

        if (imported.length === 0) {
            imported.push({ symbol: '*', alias: null });
        }

        return imported;
    }

    private registerImportedSymbols(
        imported: { symbol: string; alias: string | null }[],
        normalizedPath: string,
    ): void {
        for (const { symbol: name, alias } of imported) {
            this.context.importedMapping.set(name, normalizedPath);
            if (alias) {
                this.context.importedMapping.set(alias, name);
            }
        }
    }

    protected processImportAuxiliary(
        aux: SyntaxNode,
        query: Query,
    ): string | null {
        const matches = query.matches(aux);
        if (matches.length === 0) return null;

        // queries are ordered by priority, so we can take the first one
        // even if there are multiple matches
        const captures = matches[0].captures;
        if (captures.length === 0) return null;

        const origin = captures.find((capture) => capture.name === 'origin');
        const isBinaryExpr = captures.find(
            (capture) => capture.name === 'fname' || capture.name === 'dir',
        );

        if (!origin) return null;
        const path = isBinaryExpr
            ? origin.node.text.slice(1) // remove leading slash
            : origin.node.text;

        return path;
    }

    public collectDeclarations(
        rootNode: SyntaxNode,
        absolutePath: string,
    ): void {
        const [query] = this.newQueryFromType(QueryType.CLASS_QUERY);
        const matches = query.matches(rootNode);
        if (matches.length === 0) return;

        for (const match of matches) {
            const classAnalysis = this.processClassMatch(match, absolutePath);

            const key = `${absolutePath}:${classAnalysis.name}`;
            const existingClass = this.context.types.get(key);
            if (existingClass) {
                // Merge existing class with new one
                existingClass.extends = [
                    ...(existingClass.extends || []),
                    ...(classAnalysis.extends || []),
                ];
                existingClass.implements = [
                    ...(existingClass.implements || []),
                    ...(classAnalysis.implements || []),
                ];
                existingClass.fields = {
                    ...existingClass.fields,
                    ...classAnalysis.fields,
                };
            }

            this.context.types.set(key, classAnalysis);
            this.context.fileClassNames.add(classAnalysis.name);
            this.context.fileDefines.add(classAnalysis.name);
        }

        return;
    }

    private processClassMatch(
        match: QueryMatch,
        absolutePath: string,
    ): TypeAnalysis {
        const classAnalysis: TypeAnalysis = {
            name: '',
            extends: [],
            implements: [],
            fields: {},
            file: absolutePath,
            type: 'class',
        };

        const methods: ClassMethod[] = [];
        const properties: ClassProperty[] = [];

        for (const capture of match.captures) {
            this.processClassCapture(
                capture,
                classAnalysis,
                methods,
                properties,
            );
        }

        this.addMethodsToType(classAnalysis, methods);
        this.addPropertiesToType(classAnalysis, properties);
        this.processConstructorParameters(methods);

        return classAnalysis;
    }

    private processClassCapture(
        capture: QueryCapture,
        classAnalysis: TypeAnalysis,
        methods: ClassMethod[],
        properties: ClassProperty[],
    ): void {
        const text = capture.node?.text;
        if (!text) {
            return;
        }

        switch (capture.name) {
            case 'className':
                classAnalysis.name = text;
                break;
            case 'classExtends':
                classAnalysis.extends = [text];
                break;
            case 'classImplements':
                this.addClassImplementation(classAnalysis, text);
                break;
            case 'classMethod':
                this.addNewMethod(methods, text);
                break;
            case 'classMethodParamName':
                this.addMethodParameter(methods, text, null);
                break;
            case 'classMethodParamType':
                this.addMethodParameter(methods, null, text);
                break;
            case 'classMethodReturnType':
                this.setMethodReturnType(methods, text);
                break;
            case 'classProperty':
                this.addClassProperty(properties, text, null);
                break;
            case 'classPropertyType':
                this.addClassProperty(properties, null, text);
                break;
        }
    }

    private addClassImplementation(
        classAnalysis: TypeAnalysis,
        implementation: string,
    ): void {
        if (!classAnalysis.implements) {
            classAnalysis.implements = [];
        }
        classAnalysis.implements.push(implementation);
    }

    private addNewMethod(methods: ClassMethod[], methodName: string): void {
        methods.push({
            name: methodName,
            params: [],
            returnType: null,
        });
    }

    private addMethodParameter(
        methods: ClassMethod[],
        paramName: string | null,
        paramType: string | null,
    ): void {
        if (methods.length === 0) return;

        const currentMethod = methods[methods.length - 1];
        const lastParam = currentMethod.params[currentMethod.params.length - 1];
        if (lastParam) {
            if (paramName && !lastParam.name) {
                lastParam.name = paramName;
            }
            if (paramType && !lastParam.type) {
                lastParam.type = paramType;
            }
        } else {
            currentMethod.params.push({
                name: paramName,
                type: paramType,
            });
        }
    }

    private setMethodReturnType(
        methods: ClassMethod[],
        returnType: string,
    ): void {
        if (methods.length === 0) return;

        const currentMethod = methods[methods.length - 1];
        currentMethod.returnType = returnType;
    }

    private addClassProperty(
        properties: ClassProperty[],
        name: string | null,
        type: string | null,
    ): void {
        const lastProperty = properties[properties.length - 1];

        if (name !== null) {
            if (lastProperty && !lastProperty.name) {
                lastProperty.name = name;
            } else {
                properties.push({ name, type: null });
            }
        } else if (type !== null) {
            if (lastProperty && !lastProperty.type) {
                lastProperty.type = type;
            } else {
                properties.push({ name: null, type });
            }
        }
    }

    private addMethodsToType(
        classAnalysis: TypeAnalysis,
        methods: ClassMethod[],
    ): void {
        if (!classAnalysis.fields) {
            classAnalysis.fields = {};
        }

        for (const method of methods) {
            const filteredParams = method.params.filter((param) => param.name);
            const params = `(${filteredParams
                .map((param) => param.name)
                .join(', ')})`;
            const methodSignature = `${params}:${method.returnType || 'unknown'}`;
            classAnalysis.fields[method.name] = methodSignature;
        }
    }

    private addPropertiesToType(
        classAnalysis: TypeAnalysis,
        properties: ClassProperty[],
    ): void {
        if (!classAnalysis.fields) {
            classAnalysis.fields = {};
        }

        for (const property of properties) {
            if (!property.name) continue;
            classAnalysis.fields[property.name] = property.type || 'unknown';
        }
    }

    private processConstructorParameters(methods: ClassMethod[]): void {
        const constructor = methods.find(
            (method) => method.name === this.constructorName,
        );
        if (!constructor) return;

        for (const param of constructor.params) {
            if (param.name && param.type) {
                this.context.instanceMapping.set(param.name, param.type);
                this.context.instanceMapping.set(param.type, param.name);
            }
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

        // const implementsClause = findNamedChildByType(
        //     node,
        //     'class_interface_clause',
        // );
        // if (implementsClause) {
        //     this.addImplementedToType(
        //         classAnalysis,
        //         implementsClause,
        //         absolutePath,
        //     );
        // }

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
        const [funcQuery] = this.newQueryFromType(QueryType.FUNCTION_QUERY);
        const [callQuery] = this.newQueryFromType(
            QueryType.FUNCTION_CALL_QUERY,
        );

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
        const [query] = this.newQueryFromType(QueryType.TYPE_QUERY);
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
        // this.addImplementedToType(classObj, classImplements, absolutePath);
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

        // this.addImplementedToType(enumObj, enumImplements, absolutePath);
        this.addFieldsToType(enumObj, enumBody);

        this.context.types.set(key, enumObj);
    }

    private addExtendedToType(
        classObj: TypeAnalysis,
        node: SyntaxNode,
        absolutePath: string,
    ): void {
        if (!node) {
            return;
        }

        const baseClass = node.text;

        let key = `${absolutePath}:${baseClass}`;
        const mapped = this.context.importedMapping.get(baseClass);
        if (mapped) {
            key = `${mapped}:${baseClass}`;
        }

        const existingExtends = new Set(classObj.extends || []);
        existingExtends.add(key);
        classObj.extends = Array.from(existingExtends);
    }

    private addImplementedToType(
        classObj: TypeAnalysis,
        nodes: SyntaxNode[],
        absolutePath: string,
    ): void {
        if (!nodes || nodes.length === 0) {
            return;
        }

        const keys = nodes.map((node) => {
            const interfaceName = node.text;

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
