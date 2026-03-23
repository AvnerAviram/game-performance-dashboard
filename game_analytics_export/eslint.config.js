import js from '@eslint/js';
import globals from 'globals';
import prettierConfig from 'eslint-config-prettier';

export default [
    { ignores: ['dist/', 'node_modules/', 'coverage/', '**/archive/**', 'tests/'] },

    js.configs.recommended,

    {
        files: ['src/**/*.js', 'server/**/*.cjs'],
        rules: {
            'no-unused-vars': [
                'warn',
                {
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                    caughtErrorsIgnorePattern: '^_',
                },
            ],
            'no-console': 'off',
        },
    },

    // Client code (ESM, browser globals)
    {
        files: ['src/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                ...globals.browser,
                Chart: 'readonly',
                closeMechanicPanel: 'readonly',
                closeThemePanel: 'readonly',
                closeGamePanel: 'readonly',
                closeProviderPanel: 'readonly',
                showThemeDetails: 'readonly',
            },
        },
    },

    // Server code (CJS, Node globals)
    {
        files: ['server/**/*.cjs'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: {
                ...globals.node,
                require: 'readonly',
                module: 'readonly',
                __dirname: 'readonly',
                __filename: 'readonly',
                process: 'readonly',
            },
        },
    },

    // Disable ESLint formatting rules that conflict with Prettier
    prettierConfig,
];
