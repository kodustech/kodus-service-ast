// @ts-check
import eslint from '@eslint/js';
import eslintPluginPrettierRecommended from 'eslint-plugin-prettier/recommended';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  // Arquivos a serem ignorados completamente
  {
    ignores: ['eslint.config.mjs', 'ecosystem.config.js'],
  },
  // Configurações base
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  eslintPluginPrettierRecommended,
  // Configuração global
  {
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.jest,
      },
      ecmaVersion: 5,
      sourceType: 'module',
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  // Regras para arquivos TypeScript
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-floating-promises': 'warn',
      '@typescript-eslint/no-unsafe-argument': 'warn',
      '@typescript-eslint/no-unsafe-assignment': 'warn',
      '@typescript-eslint/no-unsafe-member-access': 'warn',
    },
  },
  // Configuração específica para arquivos JavaScript puros (como ecosystem.config.js)
  {
    files: ['**/*.js', '*.js'],
    ignores: ['src/**/*.js'], // Não aplicar a arquivos JS dentro de src
    ...eslint.configs.recommended,
    languageOptions: {
      globals: {
        ...globals.node,
      },
      sourceType: 'module',
      parserOptions: {
        ecmaVersion: 2022,
      },
    },
  }
);
