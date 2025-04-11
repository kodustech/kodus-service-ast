import { ImportConfigProvider } from './ImportPathResolver';

export interface AliasConfig {
    // The original pattern from the language config (e.g. "@/*" in tsconfig)
    pattern: string;
    // The target path this alias points to (e.g. "./src/*")
    target: string;
}

export interface LanguageResolver extends ImportConfigProvider {
    /**
     * Read and parse the alias configuration for this language
     * Returns a map of alias pattern to target path
     */
    readAliasConfig(): Record<string, AliasConfig>;

    /**
     * Get the priority of this resolver
     * Higher priority resolvers are checked first
     * For example, TypeScript might be higher priority than JavaScript
     */
    getPriority(): number;
}
