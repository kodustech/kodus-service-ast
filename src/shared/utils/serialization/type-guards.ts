import { type Serializable } from './types.js';

export function isMap(value: unknown): value is Map<unknown, unknown> {
    return value instanceof Map;
}

export function isSet(value: unknown): value is Set<unknown> {
    return value instanceof Set;
}

export function isPlainObject(
    value: unknown,
): value is Record<string, unknown> {
    return (
        typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value) &&
        !(value instanceof Map) &&
        !(value instanceof Set)
    );
}

export function isSerializedMap(
    value: unknown,
): value is { __type: 'Map'; value: [string, Serializable][] } {
    return (
        typeof value === 'object' &&
        value !== null &&
        '__type' in value &&
        'value' in value &&
        value.__type === 'Map' &&
        Array.isArray(value.value)
    );
}

export function isSerializedSet(
    value: unknown,
): value is { __type: 'Set'; value: Serializable[] } {
    return (
        typeof value === 'object' &&
        value !== null &&
        '__type' in value &&
        'value' in value &&
        value.__type === 'Set' &&
        Array.isArray(value.value)
    );
}
