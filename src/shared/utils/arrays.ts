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
