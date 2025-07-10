export function findLastIndexOf<T>(
    arr: Array<T>,
    predicate: (value: T, index: number, obj: Array<T>) => boolean,
): number {
    for (let i = arr.length - 1; i >= 0; i--) {
        if (predicate(arr[i], i, arr)) {
            return i;
        }
    }
    return -1; // Not found
}

export function findLast<T>(
    arr: Array<T>,
    predicate: (value: T, index: number, obj: Array<T>) => boolean,
): T | undefined {
    const index = findLastIndexOf(arr, predicate);
    return index !== -1 ? arr[index] : undefined;
}

/**
 * Appends a new element to the array or updates the last element with new values.
 * If the last element has any non-null properties that would be overwritten, a new element is created.
 *
 * This method is useful when maintaining a list of objects that follow a pattern where the first element is non-optional/always the same type.
 *
 * Example, list of parameters:
 *
 * `(name1, name2: type2, name3: type3 = defaultValue3)` always starts with the parameter name.
 *
 * results in: `[{ name: 'name1', type: null, defaultValue: null }, { name: 'name2', type: 'type2', defaultValue: null  }, { name: 'name3', type: 'type3', defaultValue: 'defaultValue3' }]`
 *
 * Not recommended when the first element type is optional or may change.
 *
 * `(name1, type2: name2, type3: name3 = defaultValue3)` the first element may be name or type.
 *
 * results in: `[{ name: 'name1', type: 'type2', defaultValue: null }, { name: 'name2', type: 'type3', defaultValue: null }, { name: 'name3', type: null, defaultValue: 'defaultValue3' }]`
 *
 * @param array The array to append or update.
 * @param newInfo The new information to apply to the last element or the new element.
 */
export function appendOrUpdateElement<T>(
    array: T[],
    newInfo: Partial<T>,
): void {
    // Get the last element or create a new one with all null values
    let current = array[array.length - 1];

    // If no elements exist or if any property in newInfo would overwrite a non-null value
    const needsNew =
        !current ||
        Object.keys(newInfo).some(
            (key) =>
                newInfo[key] !== undefined &&
                current[key] !== undefined &&
                current[key] !== null,
        );

    if (needsNew) {
        // Merge keys
        const keys = new Set([
            ...Object.keys(newInfo),
            ...Object.keys(current || {}),
        ]);

        // Create a new object with all properties set to null
        current = {} as T;
        for (const key in keys) {
            current[key] = null;
        }
        array.push(current);
    }

    // Apply the new values
    for (const key in newInfo) {
        if (newInfo[key] !== undefined) {
            current[key] = newInfo[key]!;
        }
    }
}
