import { StreamedResponse } from '@kodus/kodus-proto/v2';
import { from, Observable } from 'rxjs';

type primitive = string | number | boolean | null | undefined;

export function streamedResponse<T, K extends primitive | object>(
    request: T,
    method: (req: T) => Promise<K>,
): Observable<StreamedResponse> {
    return from(handleRequest(request, method));
}

async function* handleRequest<T, K extends primitive | object>(
    request: T,
    method: (req: T) => Promise<K>,
): AsyncGenerator<StreamedResponse> {
    const res = await method(request);

    yield* createChunkStream(res);
}

function* createChunkStream<T extends primitive | object>(
    data: T,
    chunkSize = 1024 * 1024,
): Generator<StreamedResponse> {
    let jsonString: string;
    try {
        jsonString = JSON.stringify(data);
    } catch (error) {
        console.error('Error stringifying data:', error);
        throw new Error('Failed to serialize data to JSON');
    }
    const totalLength = jsonString.length;

    for (let i = 0; i < totalLength; i += chunkSize) {
        const chunk = jsonString.slice(i, i + chunkSize);
        const isLast = i + chunkSize >= totalLength;

        yield {
            data: new TextEncoder().encode(chunk),
            isLast,
        };
    }
}
