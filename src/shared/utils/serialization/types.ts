export type SerializablePrimitive = string | number | boolean | null;
export type Serializable =
    | SerializablePrimitive
    | Serializable[]
    | { [key: string]: Serializable }
    | { __type: 'Map'; value: [string, Serializable][] }
    | { __type: 'Set'; value: Serializable[] };
