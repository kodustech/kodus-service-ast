import { promisify } from 'util';
import { gunzip, gzip } from 'zlib';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

function isGzipped(data: Buffer): boolean {
    return data.length >= 2 && data[0] === 0x1f && data[1] === 0x8b;
}

export async function compressString(input: string): Promise<string> {
    try {
        const compressedBuffer = await gzipAsync(input);
        return compressedBuffer.toString('base64');
    } catch (error) {
        throw new Error(
            `Failed to compress string: ${(error as Error).message}`,
        );
    }
}

export async function decompressString(input: string): Promise<string> {
    try {
        const buffer = Buffer.from(input, 'base64');

        if (!isGzipped(buffer)) {
            return buffer.toString('utf-8');
        }

        const decompressedBuffer = await gunzipAsync(buffer);
        return decompressedBuffer.toString('utf-8');
    } catch (error) {
        throw new Error(
            `Failed to decompress string: ${(error as Error).message}`,
        );
    }
}
