import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function stripQuotes(value: string): string {
    if (value.length < 2) {
        return value;
    }

    const firstChar = value[0];
    const lastChar = value[value.length - 1];
    if (
        (firstChar === "'" && lastChar === "'") ||
        (firstChar === '"' && lastChar === '"')
    ) {
        return value.slice(1, -1);
    }

    return value;
}

function parseRawEnv(contents: string): Record<string, string> {
    const result: Record<string, string> = {};
    const lines = contents.replace(/\r\n?/g, '\n').split('\n');

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (line === '' || line.startsWith('#')) {
            continue;
        }

        const equalIndex = line.indexOf('=');
        if (equalIndex === -1) {
            continue;
        }

        let key = line.slice(0, equalIndex).trim();
        if (key.startsWith('export ')) {
            key = key.slice('export '.length).trim();
        }

        if (key === '') {
            continue;
        }

        let value = line.slice(equalIndex + 1).replace(/^\s+/, '');
        value = stripQuotes(value);

        const inlineCommentIndex = value.search(/\s#/);
        if (inlineCommentIndex !== -1) {
            value = value.slice(0, inlineCommentIndex).trimEnd();
        }

        result[key] = value;
    }

    return result;
}

function findEnvPath(startDir: string): string | null {
    let current = path.resolve(startDir);
    for (let i = 0; i < 8; i += 1) {
        const candidate = path.join(current, '.env');
        if (fs.existsSync(candidate)) {
            return candidate;
        }
        const parent = path.dirname(current);
        if (parent === current) {
            break;
        }
        current = parent;
    }
    return null;
}

function resolveEnvPath(): string | null {
    if (process.env.DOTENV_CONFIG_PATH) {
        return process.env.DOTENV_CONFIG_PATH;
    }

    const cwdPath = findEnvPath(process.cwd());
    if (cwdPath) {
        return cwdPath;
    }

    const moduleDir = path.dirname(fileURLToPath(import.meta.url));
    return findEnvPath(moduleDir);
}

function shouldOverrideValue(rawValue: string, existing?: string): boolean {
    if (existing === undefined || existing === '') {
        return true;
    }

    if (existing === rawValue) {
        return false;
    }

    return rawValue.includes('$') && !existing.includes('$');
}

function loadRawEnvFile(): void {
    const envPath = resolveEnvPath();
    if (!envPath) {
        return;
    }

    try {
        const contents = fs.readFileSync(envPath, 'utf8');
        const parsed = parseRawEnv(contents);

        for (const [key, value] of Object.entries(parsed)) {
            if (shouldOverrideValue(value, process.env[key])) {
                process.env[key] = value;
            }
        }
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            throw error;
        }
    }
}

loadRawEnvFile();
