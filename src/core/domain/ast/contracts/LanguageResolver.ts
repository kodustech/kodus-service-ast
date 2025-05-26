import { ImportConfigProvider } from './ImportPathResolver';

export interface AliasConfig {
    pattern: string;
    target: string;
}

export interface LanguageResolver extends ImportConfigProvider {
    readAliasConfig(): Record<string, AliasConfig>;
    getPriority(): number;
}
