import { SUPPORTED_LANGUAGES } from '@/core/domain/ast/types/supported-languages';
import { Injectable } from '@nestjs/common';
import * as path from 'path';
import { Language, Range } from 'tree-sitter';
import * as Parser from 'tree-sitter';
import * as CSharpLang from 'tree-sitter-c-sharp';
import * as JavaLang from 'tree-sitter-java';
import * as PhpLang from 'tree-sitter-php/php';
import * as PythonLang from 'tree-sitter-python';
import * as RubyLang from 'tree-sitter-ruby';
import * as RustLang from 'tree-sitter-rust';
import * as TypeScriptLang from 'tree-sitter-typescript/typescript';
import { PinoLoggerService } from '../logger/pino.service';
import { SourceFileAnalyzer } from '../ast/analyze-source-file';

@Injectable()
export class DifferService {
    constructor(private readonly logger: PinoLoggerService) {}

    async getRelevantContent(
        diff: string,
        filePath: string,
        rootDir: string,
        filename?: string,
        content?: string,
    ): Promise<string> {
        try {
            const analyzer = new SourceFileAnalyzer();
            const analysis = await analyzer.analyzeSourceFile(
                rootDir,
                filePath,
                path.join(rootDir, filePath),
            );
        } catch (error) {
            this.logger.error({
                context: DifferService.name,
                message: `Failed to get relevant content`,
                error:
                    error instanceof Error ? error : new Error(String(error)),
                metadata: {
                    diff,
                    content,
                },
            });
            return null;
        }
    }

    private setParserLanguage(filename: string, parser: Parser): void {
        const extension = path.extname(filename).toLowerCase();
        const language = Object.values(SUPPORTED_LANGUAGES).find((lang) =>
            lang.extensions.includes(extension),
        );

        if (!language) {
            throw new Error(`Language not supported: ${extension}`);
        }

        switch (language.name) {
            case SUPPORTED_LANGUAGES.typescript.name:
            case SUPPORTED_LANGUAGES.javascript.name:
                parser.setLanguage(TypeScriptLang as Language);
                break;
            case SUPPORTED_LANGUAGES.python.name:
                parser.setLanguage(PythonLang as Language);
                break;
            case SUPPORTED_LANGUAGES.ruby.name:
                parser.setLanguage(RubyLang as Language);
                break;
            case SUPPORTED_LANGUAGES.php.name:
                parser.setLanguage(PhpLang as Language);
                break;
            case SUPPORTED_LANGUAGES.csharp.name:
                parser.setLanguage(CSharpLang as Language);
                break;
            case SUPPORTED_LANGUAGES.java.name:
                parser.setLanguage(JavaLang as Language);
                break;
            case SUPPORTED_LANGUAGES.rust.name:
                parser.setLanguage(RustLang as Language);
                break;
            default:
                throw new Error(`Language not supported: ${language.name}`);
        }
    }

    private getFilename(diff: string): string {
        const match = diff.match(/diff --git a\/(.*?) b\//);
        if (match && match[1]) {
            return match[1];
        }
        throw new Error('Filename not found in diff');
    }

    private getRanges(diff: string, content: string): Range[] {
        const lines = content.split('\n');
        const diffLines = diff.split('\n');

        const ranges: Range[] = [];
        let i = 0;

        while (i < diffLines.length) {
            const line = diffLines[i];

            if (line.startsWith('@@')) {
                const match = /@@ -\d+,?\d* \+(\d+),?(\d*) @@/.exec(line);
                if (!match) {
                    i++;
                    continue;
                }

                const newLineNumber = parseInt(match[1], 10);
                i++;
                let currentNewLine = newLineNumber - 1;
                let startLine: number | null = null;

                while (i < diffLines.length && !diffLines[i].startsWith('@@')) {
                    const diffLine = diffLines[i];

                    if (
                        diffLine.startsWith('+') &&
                        !diffLine.startsWith('+++')
                    ) {
                        if (startLine === null) {
                            startLine = currentNewLine;
                        }
                    } else if (startLine !== null) {
                        const start = startLine;
                        const end = currentNewLine - 1;

                        const startIndex =
                            lines.slice(0, start).join('\n').length +
                            (start > 0 ? 1 : 0);
                        const endIndex = lines
                            .slice(0, end + 1)
                            .join('\n').length;

                        ranges.push({
                            startIndex,
                            startPosition: { row: start, column: 0 },
                            endIndex,
                            endPosition: {
                                row: end,
                                column: lines[end].length,
                            },
                        });

                        startLine = null;
                    }

                    if (!diffLine.startsWith('-')) {
                        currentNewLine++;
                    }

                    i++;
                }

                // If addition goes to the end of the hunk
                if (startLine !== null) {
                    const start = startLine;
                    const end = currentNewLine - 1;
                    const startIndex =
                        lines.slice(0, start).join('\n').length +
                        (start > 0 ? 1 : 0);
                    const endIndex = lines.slice(0, end + 1).join('\n').length;

                    ranges.push({
                        startIndex,
                        startPosition: { row: start, column: 0 },
                        endIndex,
                        endPosition: { row: end, column: lines[end].length },
                    });
                }
            } else {
                i++;
            }
        }

        return ranges;
    }
}
