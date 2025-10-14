import {
    isMap,
    isPlainObject,
    isSerializedMap,
    isSerializedSet,
    isSet,
} from './type-guards.js';
import { type Serializable, type SerializablePrimitive } from './types.js';

export function serializeObject(input: any): Serializable {
    if (isMap(input)) {
        return {
            __type: 'Map',
            value: Array.from(input.entries()).map(([k, v]) => [
                String(k),
                serializeObject(v),
            ]),
        };
    }

    if (isSet(input)) {
        return {
            __type: 'Set',
            value: Array.from(input).map(serializeObject),
        };
    }

    if (Array.isArray(input)) {
        return input.map(serializeObject);
    }

    if (isPlainObject(input)) {
        const result: { [key: string]: Serializable } = {};
        for (const key in input) {
            result[key] = serializeObject(input[key]);
        }
        return result;
    }

    return input as SerializablePrimitive;
}

export function deserializeObject(input: Serializable): any {
    if (isSerializedMap(input)) {
        return new Map(input.value.map(([k, v]) => [k, deserializeObject(v)]));
    }

    if (isSerializedSet(input)) {
        return new Set(input.value.map(deserializeObject));
    }

    if (Array.isArray(input)) {
        return input.map(deserializeObject);
    }

    if (isPlainObject(input)) {
        const result: Record<string, any> = {};
        for (const key in input) {
            result[key] = deserializeObject(input[key]);
        }
        return result;
    }

    return input;
}
