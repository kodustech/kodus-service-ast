import { type LanguageResolver } from '@/core/domain/parsing/contracts/language-resolver.contract.js';
import { TypeScriptResolver } from './typescript/typescript-resolver.js';
import { JavaScriptResolver } from './javascript/javascript-resolver.js';
import { PythonResolver } from './python/python-resolver.js';
import { RubyResolver } from './ruby/ruby-resolver.js';
import { RustResolver } from './rust/rust-resolver.js';
import { PHPResolver } from './php/php-resolver.js';
import { CSharpResolver } from './csharp/csharp-resolver.js';
import { JavaResolver } from './java/java-resolver.js';

const resolvers: LanguageResolver[] = [
    new TypeScriptResolver(),
    new JavaScriptResolver(),
    new PythonResolver(),
    new RubyResolver(),
    new RustResolver(),
    new PHPResolver(),
    new CSharpResolver(),
    new JavaResolver(),
];

export async function getLanguageResolver(
    projectRoot: string,
): Promise<LanguageResolver | null> {
    const results = await Promise.all(
        resolvers.map(async (resolver) => ({
            resolver,
            canHandle: await resolver.canHandle(projectRoot),
        })),
    );

    const match = results.find((result) => result.canHandle);
    return match ? match.resolver : null;
}
