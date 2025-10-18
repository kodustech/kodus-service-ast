import {
    type AnalysisNode,
    type CodeGraph,
    type EnrichedGraph,
    type FileAnalysis,
    type FunctionAnalysis,
    type GraphWithDir,
    type SerializedCodeGraph,
    type SerializedFileAnalysis,
    type SerializedGetGraphsResponseData,
    type SerializedGraphWithDir,
    type TypeAnalysis,
} from '@/shared/types/ast.js';

function mapToRecord<T>(map: Map<string, T>): Record<string, T> {
    const record: Record<string, T> = {};
    map.forEach((value, key) => {
        record[key] = value;
    });
    return record;
}

function recordToMap<T>(record: Record<string, T> | undefined): Map<string, T> {
    const map = new Map<string, T>();
    if (!record) {
        return map;
    }
    Object.entries(record).forEach(([key, value]) => {
        map.set(key, value);
    });
    return map;
}

function serializeFileAnalysis(file: FileAnalysis): SerializedFileAnalysis {
    return {
        defines: file.defines,
        calls: file.calls,
        imports: file.imports,
        className: file.className,
        nodes: mapToRecord(file.nodes),
    };
}

function deserializeFileAnalysis(
    serialized: SerializedFileAnalysis,
): FileAnalysis {
    const nodes = recordToMap<AnalysisNode>(serialized.nodes);

    return {
        defines: serialized.defines,
        calls: serialized.calls,
        imports: serialized.imports,
        className: serialized.className,
        nodes,
    };
}

function serializeCodeGraph(graph: CodeGraph): SerializedCodeGraph {
    const files: Record<string, SerializedFileAnalysis> = {};
    graph.files.forEach((value, key) => {
        files[key] = serializeFileAnalysis(value);
    });

    const functions = mapToRecord(graph.functions);

    const types: Record<string, TypeAnalysis> = {};
    graph.types.forEach((value, key) => {
        const fields =
            value.fields instanceof Map
                ? mapToRecord(value.fields)
                : value.fields;

        types[key] = {
            ...value,
            fields,
        };
    });

    return {
        files,
        functions,
        types,
    };
}

function deserializeCodeGraph(serialized: SerializedCodeGraph): CodeGraph {
    const files = new Map<string, FileAnalysis>();
    Object.entries(serialized.files ?? {}).forEach(([key, value]) => {
        files.set(key, deserializeFileAnalysis(value));
    });

    const functions = recordToMap<FunctionAnalysis>(serialized.functions);

    const types = new Map<string, TypeAnalysis>();
    Object.entries(serialized.types ?? {}).forEach(([key, value]) => {
        const fields = value.fields;
        let normalizedFields: TypeAnalysis['fields'];
        if (fields instanceof Map) {
            normalizedFields = fields;
        } else if (fields) {
            normalizedFields = { ...fields };
        }

        types.set(key, {
            ...value,
            fields: normalizedFields,
        });
    });

    return {
        files,
        functions,
        types,
    };
}

function serializeGraphWithDir(
    graph: GraphWithDir<CodeGraph>,
): SerializedGraphWithDir {
    return {
        dir: graph.dir,
        graph: serializeCodeGraph(graph.graph),
    };
}

function deserializeGraphWithDir(
    graph: SerializedGraphWithDir,
): GraphWithDir<CodeGraph> {
    return {
        dir: graph.dir,
        graph: deserializeCodeGraph(graph.graph),
    };
}

export const astSerializer = {
    serializeGetGraphsResponseData(data: {
        baseGraph: GraphWithDir<CodeGraph>;
        headGraph: GraphWithDir<CodeGraph>;
        enrichHeadGraph: EnrichedGraph;
    }): SerializedGetGraphsResponseData {
        return {
            baseGraph: serializeGraphWithDir(data.baseGraph),
            headGraph: serializeGraphWithDir(data.headGraph),
            enrichHeadGraph: data.enrichHeadGraph,
        };
    },
};

export const astDeserializer = {
    deserializeGetGraphsResponseData(data: SerializedGetGraphsResponseData): {
        baseGraph: GraphWithDir<CodeGraph>;
        headGraph: GraphWithDir<CodeGraph>;
        enrichHeadGraph: EnrichedGraph;
    } {
        return {
            baseGraph: deserializeGraphWithDir(data.baseGraph),
            headGraph: deserializeGraphWithDir(data.headGraph),
            enrichHeadGraph: data.enrichHeadGraph,
        };
    },
};
