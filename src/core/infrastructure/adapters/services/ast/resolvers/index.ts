import { LanguageResolver } from '@/core/domain/ast/contracts/language-resolver.contract';
import { TypeScriptResolver } from './typescript/typescript-resolver';
import { JavaScriptResolver } from './javascript/javascript-resolver';
import { PythonResolver } from './python/python-resolver';
import { RubyResolver } from './ruby/ruby-resolver';
import { RustResolver } from './rust/rust-resolver';
import { PHPResolver } from './php/php-resolver';
import { CSharpResolver } from './csharp/csharp-resolver';
import { JavaResolver } from './java/java-resolver';

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
