import fs from 'node:fs';
import path from 'node:path';

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

function loadRawEnvFile(): void {
    const envPath =
        process.env.DOTENV_CONFIG_PATH ?? path.resolve(process.cwd(), '.env');

    try {
        const contents = fs.readFileSync(envPath, 'utf8');
        const parsed = parseRawEnv(contents);

        for (const [key, value] of Object.entries(parsed)) {
            process.env[key] = value;
        }
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
            throw error;
        }
    }
}

loadRawEnvFile();
