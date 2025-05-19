import { Language, QueryMatch, SyntaxNode } from 'tree-sitter';
import { BaseParser, CallChain, ChainType } from '../base-parser';
import { phpQueries } from './php-queries';
import * as PhpLang from 'tree-sitter-php/php';

export class PhpParser extends BaseParser {
    protected override readonly constructorName: string = '__construct';
    protected override readonly selfAccessReference: string = '$this';

    protected override readonly validMemberTypes: Set<string> = new Set([
        'variable_name',
        'name',
    ] as const);
    protected override readonly validFunctionTypes: Set<string> = new Set([
        'variable_name',
        'name',
    ] as const);

    protected override setupLanguage(): void {
        this.language = PhpLang as Language;
    }

    protected override setupQueries(): void {
        this.rawQueries = phpQueries;
        super.setupQueries();
    }

    protected override getImportOriginName(match: QueryMatch): string | null {
        const originCapture = match.captures.find(
            (capture) => capture.name === 'origin',
        );
        if (!originCapture) return null;

        let originName = originCapture.node.text;
        if (match['properties']) {
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
            const properties = match['properties'];
            if (
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                properties['leadingSlash'] &&
                // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
                properties['leadingSlash'] === 'true'
            ) {
                originName = originName.replace(/^\//, '');
            }
        }

        return originName;
    }

    protected override processChainNode(
        node: SyntaxNode,
        chain: CallChain[],
    ): boolean {
        switch (node.type) {
            case 'nullsafe_member_access_expression':
            case 'member_access_expression': {
                const object = node.childForFieldName('object');
                const name = node.childForFieldName('name');

                this.addToChain(object, ChainType.MEMBER, chain, node.id);
                this.addToChain(name, ChainType.MEMBER, chain, node.id);

                return true;
            }
            case 'nullsafe_member_call_expression':
            case 'member_call_expression': {
                const object = node.childForFieldName('object');
                const name = node.childForFieldName('name');

                this.addToChain(object, ChainType.MEMBER, chain, node.id);
                this.addToChain(name, ChainType.FUNCTION, chain, node.id);

                return true;
            }
            case 'function_call_expression': {
                const func = node.childForFieldName('function');

                this.addToChain(func, ChainType.FUNCTION, chain, node.id);

                return true;
            }
            case 'scoped_property_access_expression':
            case 'class_constant_access_expression': {
                const scope = node.childForFieldName('scope');
                const name = node.childForFieldName('name');

                this.addToChain(scope, ChainType.MEMBER, chain, node.id);
                this.addToChain(name, ChainType.MEMBER, chain, node.id);

                return true;
            }
            case 'scoped_call_expression': {
                const scope = node.childForFieldName('scope');
                const name = node.childForFieldName('name');

                this.addToChain(scope, ChainType.MEMBER, chain, node.id);
                this.addToChain(name, ChainType.FUNCTION, chain, node.id);

                return true;
            }
            default:
                return false;
        }
    }
}
