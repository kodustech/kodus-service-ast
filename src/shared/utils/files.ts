import * as fs from 'fs';

export async function tryReadFile(filePath: string): Promise<string | null> {
    try {
        const content = await fs.promises.readFile(filePath, 'utf8');
        return content;
    } catch (error) {
        console.error(`Error reading file ${filePath}:`, error);
        return null;
    }
}

export function tryReadFileSync(filePath: string): string | null {
    try {
        return fs.readFileSync(filePath, 'utf8');
    } catch (error) {
        console.error(`Error reading file ${filePath}:`, error);
        return null;
    }
}

export async function doesFileExist(filePath: string): Promise<boolean> {
    try {
        await fs.promises.access(filePath, fs.constants.R_OK);
        return true;
    } catch {
        return false;
    }
}

export function doesFileExistSync(filePath: string): boolean {
    try {
        fs.accessSync(filePath, fs.constants.R_OK);
        return true;
    } catch {
        return false;
    }
}
