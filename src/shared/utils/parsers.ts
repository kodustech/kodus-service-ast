import * as toml from 'toml';
import { XMLParser } from 'fast-xml-parser';

export function tryParseJson<T>(content: string): T | null {
    try {
        return JSON.parse(content) as T;
    } catch (error) {
        console.error('Error parsing JSON:', error);
        return null;
    }
}

export function tryParseToml<T>(content: string): T | null {
    try {
        return toml.parse(content) as T;
    } catch (error) {
        console.error('Error parsing TOML:', error);
        return null;
    }
}

export function tryParseXml<T>(content: string): T | null {
    try {
        const parser = new XMLParser({
            ignoreAttributes: false,
            attributeNamePrefix: '',
        });
        return parser.parse(content) as T;
    } catch (error) {
        console.error('Error parsing XML:', error);
        return null;
    }
}
