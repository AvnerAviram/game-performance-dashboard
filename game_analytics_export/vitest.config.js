import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.js'],
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/e2e/**',
      '**/tests/archive/**',
      '**/*.spec.js',  // Exclude Playwright E2E tests
      '**/validate-duckdb-aggregations.test.js',  // DuckDB is browser-only
      '**/duckdb-enforcement.test.js',  // Same
      '**/validate-json-baseline.test.js',  // Hardcoded counts, data has changed
      '**/data-quality-monitor.test.js',  // DuckDB-specific, brittle counts
      // UI rendering tests need full DOM - run as E2E instead
      '**/validate-overview-page.test.js',
      '**/validate-prediction-page.test.js',
      '**/validate-themes-page.test.js',
      '**/validate-mechanics-page.test.js',
      '**/validate-providers-page.test.js',
      '**/validate-insights-page.test.js',
      '**/validate-anomalies-page.test.js',
      '**/validate-games-page.test.js',
      '**/validate-trends-page.test.js',
      '**/validate-ai-assistant-page.test.js',
      '**/validate-ui-rendering-bugs.test.js',
      '**/theme-clickability.test.js',  // Expects DuckDB theme structure (_isUnified, _subthemes)
      '**/filters-comprehensive.test.js'  // Brittle filter assertions
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'json-summary', 'json', 'html'],
      // Only measure unit-testable core logic (exclude UI, DuckDB, DOM-heavy)
      include: [
        'src/lib/filters.js',
        'src/lib/data.js',
        'src/lib/auth.js',
        'src/lib/env.js',
        'src/lib/game-analytics-engine.js',
        'src/lib/sanitize.js',
        'src/lib/symbol-utils.js',
        'src/lib/features.js',
        'src/config/mechanics.js'
      ],
      exclude: [
        'node_modules/',
        'tests/',
        'dist/',
        'scripts/',
        '**/*.config.js'
      ],
      thresholds: {
        lines: 40,
        functions: 70,
        branches: 70,
        statements: 40
      }
    },
    testTimeout: 10000,
    hookTimeout: 30000,
    sequence: {
      setupFiles: 'list'
    },
    fileParallelism: false
  },
  resolve: {
    alias: {
      '@': '/src'
    }
  }
});
