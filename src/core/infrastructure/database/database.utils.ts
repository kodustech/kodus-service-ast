export function sanitizeIdentifier(name: string): string {
    const sanitized = name.trim();
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(sanitized)) {
        throw new Error(`Invalid identifier: ${name}`);
    }
    return sanitized;
}

export function quoteIdentifier(identifier: string): string {
    return `"${identifier.replace(/"/g, '""')}"`;
}

export function qualifiedName(schema: string, table: string): string {
    return `${quoteIdentifier(schema)}.${quoteIdentifier(table)}`;
}
