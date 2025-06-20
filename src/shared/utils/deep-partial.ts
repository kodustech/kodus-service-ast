export type DeepPartial<T> = {
    [P in keyof T]?: T[P] extends object
        ? T[P] extends Array<infer U>
            ? Array<DeepPartial<U>> // Handle arrays
            : DeepPartial<T[P]> // Recurse into object
        : T[P]; // Primitive values stay as-is
};

export function matchesPartial<T>(obj: T, queryObj: DeepPartial<T>): boolean {
    return Object.entries(queryObj).every(([key, value]) => {
        const objValue = obj[key as keyof T];

        if (
            value !== null &&
            typeof value === 'object' &&
            !Array.isArray(value)
        ) {
            if (
                objValue !== null &&
                typeof objValue === 'object' &&
                !Array.isArray(objValue)
            ) {
                return matchesPartial(objValue, value);
            }
            return false;
        }

        return objValue === value;
    });
}

export function deepMerge<T>(target: T, updates: DeepPartial<T>): T {
    const result = { ...target };

    for (const key in updates) {
        const value = updates[key];
        if (
            value !== null &&
            typeof value === 'object' &&
            !Array.isArray(value)
        ) {
            const targetValue = target[key];

            result[key] = deepMerge(targetValue, value);
        } else {
            result[key] = value as T[typeof key];
        }
    }

    return result;
}
