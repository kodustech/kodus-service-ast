import { LanguageResolver } from '@/core/domain/ast/contracts/LanguageResolver';
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
] as const;

export async function getLanguageResolver(
    projectRoot: string,
): Promise<LanguageResolver | null> {
    for (const resolver of resolvers) {
        if (await resolver.canHandle(projectRoot)) {
            return resolver;
        }
    }
    return null;
}
