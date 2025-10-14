import tseslint from 'typescript-eslint';
import prettierPlugin from 'eslint-plugin-prettier';
import prettierConfig from 'eslint-config-prettier';

// Importar configurações do Prettier para garantir consistência
import { readFileSync } from 'fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const prettierOptions = JSON.parse(readFileSync('./.prettierrc', 'utf8'));

const __dirname = dirname(fileURLToPath(import.meta.url));

export default tseslint.config(
    // Arquivos a ignorar
    {
        ignores: ['dist/**', 'node_modules/**', 'eslint.config.js'],
    },
    // Configurações básicas
    {
        languageOptions: {
            parser: tseslint.parser,
            parserOptions: {
                project: ['./tsconfig.json'],
                sourceType: 'module',
                tsconfigRootDir: __dirname,
                ecmaVersion: 2020,
            },
            globals: {
                node: true,
                jest: true,
            },
        },
        // Plugins
        plugins: {
            '@typescript-eslint': tseslint.plugin,
            'prettier': prettierPlugin,
        },
        // Regras
        rules: {
            // Integração com Prettier
            'prettier/prettier': ['error', prettierOptions],

            // Regras básicas de tipagem
            '@typescript-eslint/no-explicit-any': 'off', // Permite uso de 'any'

            '@typescript-eslint/no-floating-promises': 'error',

            // Regras básicas de tipagem
            '@typescript-eslint/no-explicit-any': 'off', // Permite uso de 'any'

            // Desabilitar a regra que impede o uso de Function em decoradores
            '@typescript-eslint/no-unsafe-function-type': 'off',
            '@typescript-eslint/no-unused-vars': [
                'error',
                { argsIgnorePattern: '^_' },
            ],

            // Força o uso de 'import type' para imports apenas de tipos
            '@typescript-eslint/consistent-type-imports': [
                'error',
                {
                    prefer: 'type-imports',
                    disallowTypeAnnotations: true,
                    fixStyle: 'inline-type-imports',
                },
            ],

            // Regras básicas de nomenclatura
            '@typescript-eslint/naming-convention': [
                'error',
                // Classes, interfaces, tipos, enums em PascalCase
                {
                    selector: [
                        'class',
                        'interface',
                        'typeAlias',
                        'enum',
                        'typeParameter',
                    ],
                    format: ['PascalCase'],
                },
                // Variáveis, funções, métodos, propriedades em camelCase
                {
                    selector: [
                        'variable',
                        'function',
                        'method',
                        'property',
                        'parameter',
                    ],
                    format: ['camelCase'],
                    leadingUnderscore: 'allow',
                },
                // Variáveis const que são funções podem ser camelCase
                {
                    selector: 'variable',
                    modifiers: ['const'],
                    types: ['function'],
                    format: ['camelCase'],
                },
                // Outras constantes podem ser camelCase ou UPPER_CASE
                {
                    selector: 'variable',
                    modifiers: ['const'],
                    format: ['camelCase', 'UPPER_CASE'],
                },
                {
                    // Exceção para funções decoradoras (como Agent, Step, Trigger, Workflow, etc.)
                    selector: 'function',
                    filter: {
                        regex: '^(Agent|Step|Trigger|Signal|Workflow|Instruction|Tool)$',
                        match: true,
                    },
                    format: ['PascalCase'],
                },
                {
                    // Exceção para propriedades de objetos literais que representam constantes
                    selector: 'objectLiteralProperty',
                    format: ['camelCase', 'UPPER_CASE'],
                },
                {
                    // Exceção para headers HTTP com hífens (X-...)
                    selector: 'objectLiteralProperty',
                    filter: {
                        regex: '^X-[A-Za-z-]+$',
                        match: true,
                    },
                    format: null,
                },
                {
                    // Exceção para propriedades RabbitMQ com hífens (x-...)
                    selector: 'objectLiteralProperty',
                    filter: {
                        regex: '^x-[a-z-]+$',
                        match: true,
                    },
                    format: null,
                },
                {
                    // Exceção para variáveis com prefixo __
                    selector: 'variable',
                    filter: {
                        regex: '^__',
                        match: true,
                    },
                    format: null,
                },
                {
                    // Exceção para propriedades de interface com prefixo __
                    selector: ['property', 'parameter', 'accessor'],
                    filter: {
                        regex: '^__',
                        match: true,
                    },
                    format: null,
                },
                {
                    // Exceção para caminhos de alias que começam com @
                    selector: 'objectLiteralProperty',
                    filter: {
                        regex: '^@',
                        match: true,
                    },
                    format: null,
                },
                {
                    // Exceção para variáveis que recebem classes/construtores (PascalCase)
                    selector: 'variable',
                    modifiers: ['const'],
                    types: ['function'],
                    format: ['PascalCase'],
                },
                {
                    // Exceção para destructuring de classes importadas
                    selector: 'variable',
                    modifiers: ['const'],
                    filter: {
                        regex: '^[A-Z][a-zA-Z]*$',
                        match: true,
                    },
                    format: ['PascalCase'],
                },
                {
                    // Exceção para funções constantes nomeadas em PascalCase
                    selector: 'variable',
                    modifiers: ['const'],
                    types: ['function'],
                    format: ['PascalCase'],
                },
                {
                    // Exceção para nomes de nós AST (tree-sitter) com underscores
                    selector: 'objectLiteralProperty',
                    filter: {
                        regex: '_',
                        match: true,
                    },
                    format: null,
                },
                {
                    // Exceção para constantes que são funções SQL (nomes de tabelas)
                    selector: 'variable',
                    filter: {
                        regex: '^(MIGRATIONS_TABLE|CREATE_MIGRATIONS_TABLE)$',
                        match: true,
                    },
                    format: ['UPPER_CASE'],
                },
            ],

            // Regras gerais básicas
            'no-console': 'warn',
            'prefer-const': 'error',
            'no-var': 'error',
            'eqeqeq': ['error', 'always'],
            'curly': ['error', 'all'], // Força uso de chaves em estruturas de controle

            // Desativando regras que conflitam com o Prettier
            'quotes': 'off',
            'semi': 'off',
        },
    },
    // Configurações recomendadas do TypeScript
    tseslint.configs.recommended,
    // Sobrescrever regras específicas após as recomendadas
    {
        rules: {
            '@typescript-eslint/no-explicit-any': 'off', // Permite uso de 'any'
        },
    },
    // Configuração do Prettier (deve ser a última para sobrescrever regras conflitantes)
    prettierConfig,
    // Regras que devem ser aplicadas após o Prettier
    {
        rules: {
            curly: ['error', 'all'], // Força uso de chaves em estruturas de controle
        },
    },
);
