import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.node,
        Chart: 'readonly',
        closeMechanicPanel: 'readonly',
        closeThemePanel: 'readonly',
        closeGamePanel: 'readonly',
        closeProviderPanel: 'readonly',
        showThemeDetails: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-console': 'off',
    },
    ignores: [
      'dist/', 'node_modules/', 'coverage/', '**/*.cjs', '**/archive/**',
      'tests/'  // Legacy scripts + vitest; lint src/ only
    ],
  },
];
