import { BaseParser } from '../base-parser';
import * as TypeScriptLang from 'tree-sitter-typescript/typescript';
import { typeScriptQueries } from './typescript-queries';
import { Language, QueryCapture, QueryMatch, SyntaxNode } from 'tree-sitter';
import { Call } from '@/core/domain/ast/contracts/CodeGraph';
import { normalizeAST, normalizeSignature } from '@/shared/utils/ast-helpers';
import { QueryType } from '../query';

export class TypeScriptParser extends BaseParser {
    protected setupLanguage(): void {
        this.language = TypeScriptLang as Language;
    }

    protected setupQueries(): void {
        this.queries = typeScriptQueries;
    }

    public async collectAllInOnePass(
        rootNode: SyntaxNode,
        filePath: string,
        absolutePath: string,
    ): Promise<void> {
        const [query] = this.newQueryFromType(QueryType.MAIN_QUERY);
        const matches = query.matches(rootNode);

        const importNodes: SyntaxNode[] = [];
        const definitionMatches: Array<{
            match: QueryMatch;
            captureName: string;
        }> = [];
        const callMatches: Array<{
            match: QueryMatch;
            buildCallCapture: QueryCapture;
        }> = [];

        for (const match of matches) {
            const importCapture = match.captures.find(
                (c) => c.name === 'import',
            );
            const buildCallCapture = match.captures.find(
                (c) => c.name === 'buildCall',
            );

            const defClassCapture = match.captures.find(
                (c) => c.name === 'definition.class',
            );
            const defInterfaceCapture = match.captures.find(
                (c) => c.name === 'definition.interface',
            );
            const defEnumCapture = match.captures.find(
                (c) => c.name === 'definition.enum',
            );
            const defTypeCapture = match.captures.find(
                (c) => c.name === 'definition.type',
            );
            const defFunctionCapture = match.captures.find(
                (c) => c.name === 'definition.function',
            );
            const defMethodCapture = match.captures.find(
                (c) => c.name === 'definition.method',
            );

            if (importCapture) {
                importNodes.push(importCapture.node);
            }

            if (defClassCapture) {
                definitionMatches.push({
                    match,
                    captureName: 'definition.class',
                });
            }
            if (defInterfaceCapture) {
                definitionMatches.push({
                    match,
                    captureName: 'definition.interface',
                });
            }
            if (defEnumCapture) {
                definitionMatches.push({
                    match,
                    captureName: 'definition.enum',
                });
            }
            if (defTypeCapture) {
                definitionMatches.push({
                    match,
                    captureName: 'definition.type',
                });
            }
            if (defFunctionCapture) {
                definitionMatches.push({
                    match,
                    captureName: 'definition.function',
                });
            }
            if (defMethodCapture) {
                definitionMatches.push({
                    match,
                    captureName: 'definition.method',
                });
            }

            if (buildCallCapture) {
                callMatches.push({ match, buildCallCapture });
            }
        }

        for (const importNode of importNodes) {
            await this.processImportStatement(importNode, filePath);
        }

        const tasks: Promise<void>[] = [];
        for (const { match, captureName } of definitionMatches) {
            const captured = match.captures.find((c) => c.name === captureName);
            if (!captured) continue;

            switch (captureName) {
                case 'definition.class': {
                    const nameNode = captured.node.childForFieldName('name');
                    if (nameNode) {
                        this.context.fileClassNames.add(nameNode.text);
                    }
                    tasks.push(
                        this.processClassDeclaration(
                            captured.node,
                            absolutePath,
                        ),
                    );
                    break;
                }

                case 'definition.interface': {
                    const nameNode = captured.node.childForFieldName('name');
                    if (nameNode) {
                        this.context.fileClassNames.add(nameNode.text);
                    }
                    const bodyNode =
                        captured.node.childForFieldName('body') ||
                        captured.node.namedChildren.find(
                            (c) => c.type === 'object_type',
                        );

                    if (bodyNode) {
                        for (const member of bodyNode.namedChildren) {
                            if (member.type === 'method_signature') {
                                const methodNameNode =
                                    member.childForFieldName('name');
                                if (methodNameNode) {
                                    this.context.fileDefines.add(
                                        methodNameNode.text,
                                    );
                                }
                            }
                        }
                    }
                    break;
                }

                case 'definition.enum':
                case 'definition.type':
                case 'definition.function':
                case 'definition.method': {
                    const nameNode = captured.node.childForFieldName('name');
                    this.context.fileDefines.add(
                        nameNode ? nameNode.text : captured.node.text,
                    );
                    break;
                }

                default:
                    break;
            }
        }

        await Promise.all(tasks);

        for (const { match } of callMatches) {
            const instanceCapture = match.captures.find(
                (c) => c.name === 'instance',
            );
            const methodCapture = match.captures.find(
                (c) => c.name === 'method',
            );
            if (!instanceCapture || !methodCapture) {
                continue;
            }

            const instanceName = instanceCapture.node.text;
            const methodName = methodCapture.node.text;

            let calledFile = absolutePath;

            if (this.context.instanceMapping.get(instanceName)) {
                const typeName = this.context.instanceMapping.get(instanceName);
                const importedFile = this.context.importedMapping.get(typeName);
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
    }

    private async processImportStatement(
        node: SyntaxNode,
        filePath: string,
    ): Promise<void> {
        const tasks: Promise<void>[] = [];

        const stringNode = node.children.find(
            (child) => child.type === 'string',
        );

        if (!stringNode) {
            return;
        }

        const moduleName = stringNode.text.replace(/['"]/g, '');
        const resolvedImport = this.resolveImportWithCache(
            moduleName,
            filePath,
        );

        const normalizedPath = resolvedImport?.normalizedPath || moduleName;
        this.context.fileImports.add(normalizedPath);

        for (const child of node.namedChildren) {
            if (child.type === 'identifier') {
                this.context.importedMapping.set(child.text, normalizedPath);
            } else if (
                ['import_clause', 'named_imports', 'namespace_import'].includes(
                    child.type,
                )
            ) {
                if (child.type === 'named_imports') {
                    const tokens = this.extractTokensFromNode(child);
                    tokens.forEach((token) => {
                        this.context.importedMapping.set(token, normalizedPath);
                    });
                } else if (
                    child.namedChildren &&
                    child.namedChildren.length > 0
                ) {
                    for (const spec of child.namedChildren) {
                        tasks.push(
                            Promise.resolve(
                                this.processImportSpecifier(
                                    spec,
                                    normalizedPath,
                                ),
                            ),
                        );
                    }
                } else {
                    const tokens = this.extractTokensFromNode(child);
                    tokens.forEach((token) => {
                        this.context.importedMapping.set(token, normalizedPath);
                    });
                }
            }
        }

        await Promise.all(tasks);
    }

    private processImportSpecifier(spec: SyntaxNode, modulePath: string): void {
        const addMapping = (alias: string | undefined) => {
            if (alias) {
                this.context.importedMapping.set(alias, modulePath);
            }
        };

        switch (spec.type) {
            case 'import_specifier':
            case 'namespace_import': {
                const nameNode = spec.childForFieldName('name') || spec;
                const aliasNode = spec.childForFieldName('alias');
                let alias = aliasNode ? aliasNode.text : nameNode.text;

                if (!alias && spec.text) {
                    alias = spec.text;
                }

                if (alias) {
                    addMapping(alias);
                }

                break;
            }
            case 'identifier': {
                addMapping(spec.text);
                break;
            }
            case 'named_imports': {
                const tokens = this.extractTokensFromNode(spec);

                tokens.forEach((token) => addMapping(token));
                break;
            }
            default:
                console.warn(`Tipo de spec não tratado: ${spec.type}`);
        }
    }

    private processClassDeclaration(
        node: SyntaxNode,
        absolutePath: string,
    ): Promise<void> {
        const nameNode = node.childForFieldName('name');

        if (!nameNode) {
            return;
        }

        const className = nameNode.text;
        this.context.fileClassNames.add(className);

        const key = `${absolutePath}:${className}`;

        const classAnalysis = this.context.types.get(key) || {
            file: absolutePath,
            type: 'class',
            name: className,
            fields: {},
        };

        classAnalysis.file = absolutePath;
        classAnalysis.name = className;

        const heritageClause = node.namedChildren.find(
            (child) => child.type === 'class_heritage',
        );
        if (heritageClause) {
            const implementedKeys: string[] = [];
            let extendedClass: string | undefined;

            heritageClause.namedChildren.forEach((clauseNode) => {
                if (clauseNode.type === 'extends_clause') {
                    clauseNode.namedChildren.forEach((typeNode) => {
                        if (typeNode.type === 'type_identifier') {
                            extendedClass = typeNode.text;
                        } else if (typeNode.type === 'generic_type') {
                            const baseNameNode =
                                typeNode.childForFieldName('name');
                            if (baseNameNode) {
                                extendedClass = baseNameNode.text;
                            }
                        }
                    });
                }
                if (clauseNode.type === 'implements_clause') {
                    clauseNode.namedChildren.forEach((typeNode) => {
                        if (typeNode.type === 'type_identifier') {
                            const rawIfaceName = typeNode.text;
                            const mapped =
                                this.context.importedMapping.get(rawIfaceName);
                            if (mapped) {
                                implementedKeys.push(
                                    `${mapped}:${rawIfaceName}`,
                                );
                            } else {
                                implementedKeys.push(
                                    `${absolutePath}:${rawIfaceName}`,
                                );
                            }
                        } else if (typeNode.type === 'generic_type') {
                            const baseNameNode =
                                typeNode.childForFieldName('name');
                            if (baseNameNode) {
                                const rawIfaceName = baseNameNode.text;
                                const mapped =
                                    this.context.importedMapping.get(
                                        rawIfaceName,
                                    );
                                if (mapped) {
                                    implementedKeys.push(
                                        `${mapped}:${rawIfaceName}`,
                                    );
                                } else {
                                    implementedKeys.push(
                                        `${absolutePath}:${rawIfaceName}`,
                                    );
                                }
                            }
                        }
                    });
                }
            });

            if (extendedClass) {
                const existingExtends = new Set(classAnalysis.extends || []);
                existingExtends.add(extendedClass);
                classAnalysis.extends = Array.from(existingExtends);
            }

            if (implementedKeys?.length > 0) {
                const existingImpl = new Set(classAnalysis.implements || []);
                implementedKeys.forEach((key) => existingImpl.add(key));
                classAnalysis.implements = Array.from(existingImpl);
            }
        }

        const classBody =
            node.childForFieldName('body') ||
            node.namedChildren.find((n) => n.type === 'class_body');
        if (classBody) {
            classBody.namedChildren.forEach((child) => {
                if (
                    child.type === 'constructor' ||
                    (child.type === 'method_definition' &&
                        child.childForFieldName('name')?.text === 'constructor')
                ) {
                    this.processConstructor(child);
                }
            });
        }

        this.context.types.set(key, classAnalysis);
    }

    private processConstructor(node: SyntaxNode): void {
        const paramsNode = node.childForFieldName('parameters');

        if (!paramsNode) {
            return;
        }

        paramsNode.namedChildren.forEach((param) => {
            const paramName = this.extractParamName(param);
            const typeNode = param.childForFieldName('type');
            if (paramName && typeNode) {
                const typeText = typeNode.text.replace(/^:/, '').trim();
                this.context.instanceMapping.set(paramName, typeText);
                this.context.instanceMapping.set(typeText, typeText);
            }
        });
    }

    private extractParamName(param: SyntaxNode): string | null {
        const modifiers = new Set([
            'private',
            'public',
            'protected',
            'readonly',
        ]);

        for (let i = 0; i < param.childCount; i++) {
            const child = param.child(i);
            if (child.type === 'identifier' && !modifiers.has(child.text)) {
                return child.text;
            }
        }
        return null;
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
            const params = paramsNode
                ? paramsNode.namedChildren.map((p) => p.text)
                : [];
            const funcNameText = node.text;
            const key = `${absolutePath}:${funcNameText}`;
            const bodyNode = funcDeclNode.childForFieldName('body');

            let calledFunctions: Call[] = [];
            let className: string | undefined = undefined;
            let current = funcDeclNode.parent;

            while (current) {
                if (current.type === 'class_declaration') {
                    const classNameNode =
                        current.childForFieldName('name') ||
                        current.namedChildren.find(
                            (child) => child.type === 'identifier',
                        );
                    if (classNameNode) {
                        className = classNameNode.text;
                        break;
                    }
                }
                current = current.parent;
            }

            if (bodyNode) {
                const callCaptures = callQuery.captures(bodyNode);

                calledFunctions = callCaptures.map((capture) => {
                    const callNode = capture.node;
                    let targetFile = absolutePath;

                    if (
                        callNode.parent &&
                        callNode.parent.type === 'member_expression'
                    ) {
                        const chain = this.getMemberChain(callNode.parent);
                        let instanceName: string | undefined;

                        if (chain.length >= 3 && chain[0] === 'this') {
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
                        caller: funcNameText,
                    };
                });
            }

            const returnType = returnTypeNode
                ? returnTypeNode.text.replace(/^:/, '').trim()
                : '';

            const normalizedBody = normalizeAST(bodyNode);
            const signatureHash = normalizeSignature(params, returnType);

            this.context.functions.set(key, {
                file: absolutePath,
                name: funcNameText,
                params,
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

    private getMemberChain(node: SyntaxNode): string[] {
        const chain: string[] = [];
        let current: SyntaxNode | null = node;
        while (current && current.type === 'member_expression') {
            const prop = current.childForFieldName('property');
            if (prop) {
                chain.unshift(prop.text);
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
        const [query] = this.newQueryFromType(QueryType.TYPE_QUERY);
        const matches = query.matches(rootNode);

        for (const match of matches) {
            this.processTypeMatch(match, absolutePath);
        }
    }

    private processTypeMatch(match: QueryMatch, absolutePath: string) {
        const captures = match.captures.reduce(
            (acc, capture) => {
                acc[capture.name] = capture;
                return acc;
            },
            {} as Record<string, QueryCapture>,
        );

        const {
            ifaceDecl,
            ifaceName,
            ifaceBody,
            ifaceExt,
            classDecl,
            className,
            classHeritage,
            typeAliasDecl,
            typeName,
            aliasType,
            enumDecl,
            enumName,
            enumBody,
        } = captures;

        if (ifaceDecl) {
            const nameNode = ifaceName?.node;
            const extendsNode = ifaceExt?.node;
            const bodyNode = ifaceBody?.node;

            if (nameNode) {
                const interfaceName = nameNode.text;
                const key = `${absolutePath}:${interfaceName}`;

                const ifaceObj = this.context.types.get(key) || {
                    file: absolutePath,
                    type: 'interface',
                    name: interfaceName,
                    fields: {},
                };

                if (extendsNode) {
                    const extended = this.collectInterfaceExtends(
                        extendsNode,
                        absolutePath,
                    );
                    if (extended.length > 0) {
                        const existingExtends = new Set(ifaceObj.extends || []);
                        extended.forEach((ext) => existingExtends.add(ext));
                        ifaceObj.extends = [...existingExtends];
                    }
                }

                if (bodyNode && bodyNode.type === 'object_type') {
                    const fields = this.parseObjectType(bodyNode);
                    ifaceObj.fields = { ...ifaceObj.fields, ...fields };
                }

                this.context.types.set(key, ifaceObj);
            }
        }

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

                if (heritageNode) {
                    const { extendedClass, implemented } =
                        this.collectClassHeritage(heritageNode, absolutePath);

                    if (extendedClass) {
                        const existingExtends = new Set(classObj.extends || []);
                        existingExtends.add(extendedClass);
                        classObj.extends = [...existingExtends];
                    }

                    if (implemented.length > 0) {
                        const existingImpl = new Set(classObj.implements || []);
                        implemented.forEach((impl) => existingImpl.add(impl));
                        classObj.implements = [...existingImpl];
                    }
                }

                this.context.types.set(key, classObj);
            }
        }

        if (typeAliasDecl) {
            const nameNode = typeName?.node;
            const aliasNode = aliasType?.node;

            if (nameNode) {
                const typeNameStr = nameNode.text;
                const key = `${absolutePath}:${typeNameStr}`;

                const typeObj = this.context.types.get(key) || {
                    file: absolutePath,
                    type: 'type',
                    name: typeNameStr,
                    fields: {},
                };

                if (aliasNode) {
                    switch (aliasNode.type) {
                        case 'object_type': {
                            const fields = this.parseObjectType(aliasNode);
                            typeObj.fields = { ...typeObj.fields, ...fields };
                            break;
                        }
                        case 'union_type': {
                            const unionMembers: Record<string, string> = {};
                            for (
                                let i = 0;
                                i < aliasNode.namedChildCount;
                                i++
                            ) {
                                const child = aliasNode.namedChild(i);
                                if (child) unionMembers[child.text] = '';
                            }
                            typeObj.fields = {
                                ...typeObj.fields,
                                ...unionMembers,
                            };
                            break;
                        }
                        default: {
                            typeObj.fields = {
                                ...typeObj.fields,
                                raw: aliasNode.text,
                            };
                        }
                    }
                }

                this.context.types.set(key, typeObj);
            }
        }

        if (enumDecl) {
            const nameNode = enumName?.node;
            const bodyNode = enumBody?.node;

            if (nameNode) {
                const enumNameStr = nameNode.text;
                const key = `${absolutePath}:${enumNameStr}`;

                const enumObj = this.context.types.get(key) || {
                    file: absolutePath,
                    type: 'enum',
                    name: enumNameStr,
                    fields: {},
                };

                if (bodyNode && bodyNode.type === 'enum_body') {
                    const newFields: Record<string, string> = {};
                    for (let i = 0; i < bodyNode.namedChildCount; i++) {
                        const member = bodyNode.namedChild(i);
                        if (!member) continue;

                        if (
                            member.type === 'enum_assignment' ||
                            member.type === 'enum_member'
                        ) {
                            const keyNode =
                                member.childForFieldName('name') ||
                                member.firstChild;
                            const valueNode = member.childForFieldName('value');
                            if (keyNode) {
                                const key = keyNode.text;
                                const value = valueNode
                                    ? valueNode.text.trim()
                                    : '';
                                newFields[key] = value;
                            }
                        }
                    }
                    enumObj.fields = { ...enumObj.fields, ...newFields };
                }

                this.context.types.set(key, enumObj);
            }
        }
    }

    private collectInterfaceExtends(
        extendsNode: SyntaxNode,
        absolutePath: string,
    ): string[] {
        const extendedIfaces: string[] = [];
        extendsNode.namedChildren.forEach((extNode) => {
            if (extNode.type === 'type_identifier') {
                const rawName = extNode.text;
                const mapped = this.context.importedMapping.get(rawName);
                if (mapped) {
                    extendedIfaces.push(`${mapped}:${rawName}`);
                } else {
                    extendedIfaces.push(`${absolutePath}:${rawName}`);
                }
            } else if (extNode.type === 'generic_type') {
                const baseNameNode = extNode.childForFieldName('name');
                if (baseNameNode) {
                    const rawName = baseNameNode.text;
                    const mapped = this.context.importedMapping.get(rawName);
                    if (mapped) {
                        extendedIfaces.push(`${mapped}:${rawName}`);
                    } else {
                        extendedIfaces.push(`${absolutePath}:${rawName}`);
                    }
                }
            }
        });
        return extendedIfaces;
    }

    private parseObjectType(
        objectTypeNode: SyntaxNode,
    ): Record<string, string> {
        const fields: Record<string, string> = {};
        objectTypeNode.namedChildren.forEach((child) => {
            if (child.type === 'property_signature') {
                const propNameNode = child.childForFieldName('name');
                const propTypeNode = child.childForFieldName('type');
                if (propNameNode) {
                    const propType = propTypeNode
                        ? this.normalizeSignatureText(
                              propTypeNode.text.replace(/^:/, ''),
                          )
                        : 'any';
                    fields[propNameNode.text] = propType;
                }
            } else if (child.type === 'method_signature') {
                const methodNameNode = child.childForFieldName('name');
                const paramsNode = child.childForFieldName('parameters');
                const returnTypeNode = child.childForFieldName('return_type');
                if (methodNameNode) {
                    const paramsText = paramsNode
                        ? this.normalizeSignatureText(paramsNode.text)
                        : '()';
                    const returnText = returnTypeNode
                        ? this.normalizeSignatureText(
                              returnTypeNode.text.replace(/^:/, ''),
                          )
                        : 'void';
                    fields[methodNameNode.text] = `${paramsText}:${returnText}`;
                }
            }
        });
        return fields;
    }

    private collectClassHeritage(
        heritageNode: SyntaxNode,
        absolutePath: string,
    ): { extendedClass: string | null; implemented: string[] } {
        let extendedClass: string | null = null;
        const implemented: string[] = [];

        heritageNode.namedChildren.forEach((child) => {
            if (child.type === 'extends_clause') {
                child.namedChildren.forEach((typeNode) => {
                    if (typeNode.type === 'type_identifier') {
                        extendedClass = typeNode.text;
                    } else if (typeNode.type === 'generic_type') {
                        const baseNameNode = typeNode.childForFieldName('name');
                        if (baseNameNode) {
                            extendedClass = baseNameNode.text;
                        }
                    }
                });
            } else if (child.type === 'implements_clause') {
                child.namedChildren.forEach((typeNode) => {
                    if (typeNode.type === 'type_identifier') {
                        const rawIfaceName = typeNode.text;
                        const mapped =
                            this.context.importedMapping.get(rawIfaceName);
                        if (mapped) {
                            implemented.push(`${mapped}:${rawIfaceName}`);
                        } else {
                            implemented.push(`${absolutePath}:${rawIfaceName}`);
                        }
                    } else if (typeNode.type === 'generic_type') {
                        const baseNameNode = typeNode.childForFieldName('name');
                        if (baseNameNode) {
                            const rawIfaceName = baseNameNode.text;
                            const mapped =
                                this.context.importedMapping.get(rawIfaceName);
                            if (mapped) {
                                implemented.push(`${mapped}:${rawIfaceName}`);
                            } else {
                                implemented.push(
                                    `${absolutePath}:${rawIfaceName}`,
                                );
                            }
                        }
                    }
                });
            }
        });

        return { extendedClass, implemented };
    }

    protected processCallCapture(
        capture: QueryCapture,
        absolutePath: string,
    ): void {
        throw new Error(
            'Method not implemented. This method is not used in TypeScript parser.',
        );
    }

    protected processDefinitionCapture(
        capture: QueryCapture,
        absolutePath: string,
    ): void {
        throw new Error(
            'Method not implemented. This method is not used in TypeScript parser.',
        );
    }

    protected processImportCapture(
        capture: QueryCapture,
        filePath: string,
    ): void {
        throw new Error(
            'Method not implemented. This method is not used in TypeScript parser.',
        );
    }
}
