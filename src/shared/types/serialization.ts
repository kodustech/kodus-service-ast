export interface Timestamp {
    seconds: number;
    nanos: number;
}

export function serializeDateToTimeStamp(
    input: Date | string | number | null | undefined,
): Timestamp {
    if (!input) {
        return { seconds: 0, nanos: 0 };
    }

    const date = input instanceof Date ? input : new Date(input);
    if (Number.isNaN(date.getTime())) {
        return { seconds: 0, nanos: 0 };
    }

    const milliseconds = date.getTime();
    const seconds = Math.floor(milliseconds / 1000);
    const nanos = Math.floor((milliseconds % 1000) * 1_000_000);

    return { seconds, nanos };
}

export function deserializeTimeStampToDate(timestamp: Timestamp): Date {
    const milliseconds =
        timestamp.seconds * 1000 + Math.floor(timestamp.nanos / 1_000_000);
    return new Date(milliseconds);
}
