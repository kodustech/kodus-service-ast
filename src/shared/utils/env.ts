export function isEnvVariableSet(variable: string): boolean {
    return process.env[variable] !== undefined && process.env[variable] !== '';
}

export function getEnvVariable(
    variable: string,
    defaultValue?: string,
): string | undefined {
    if (!isEnvVariableSet(variable)) {
        return defaultValue;
    }

    return process.env[variable];
}

export function getEnvVariableOrExit(variable: string): string {
    const value = getEnvVariable(variable);
    if (value === undefined) {
        console.error(`Environment variable ${variable} is not set`);
        process.exit(1);
    }

    return value;
}

export function getEnvVariableAsNumber(
    variable: string,
    defaultValue?: number,
): number | undefined {
    const value = getEnvVariable(variable, defaultValue?.toString());
    if (value === undefined) {
        return defaultValue;
    }

    const numberValue = Number(value);
    if (isNaN(numberValue)) {
        console.error(
            `Environment variable ${variable} is not a valid number: ${value}`,
        );
        return defaultValue;
    }

    return numberValue;
}

export function getEnvVariableAsNumberOrExit(variable: string): number {
    const value = getEnvVariableAsNumber(variable);
    if (value === undefined) {
        console.error(`Environment variable ${variable} is not set`);
        process.exit(1);
    }

    if (isNaN(value)) {
        console.error(
            `Environment variable ${variable} is not a valid number: ${value}`,
        );
        process.exit(1);
    }

    return value;
}

export function getEnvVariableAsBoolean(
    variable: string,
    defaultValue: boolean = false,
): boolean {
    const value = getEnvVariable(variable);
    if (value === undefined) {
        return defaultValue;
    }

    return value.toLowerCase() === 'true' || value === '1';
}
