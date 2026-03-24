import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './tests',
    testIgnore: ['**/archive/**', '**/node_modules/**', '**/*.test.js'],
    timeout: 15000, // Per-test limit; dashboard load ~5-8s with JSON fallback
    fullyParallel: false,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,
    reporter: 'html',

    use: {
        baseURL: 'http://localhost:8000',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
    },

    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
        {
            name: 'firefox',
            use: { ...devices['Desktop Firefox'] },
        },
        {
            name: 'webkit',
            use: { ...devices['Desktop Safari'] },
        },
        {
            name: 'mobile-chrome',
            use: { ...devices['Pixel 7'] },
        },
        {
            name: 'mobile-safari',
            use: { ...devices['iPhone 14'] },
        },
        {
            name: 'tablet',
            use: { ...devices['iPad Pro 11'] },
        },
    ],

    webServer: {
        command: 'npm run serve:e2e',
        port: 8000,
        reuseExistingServer: true,
        timeout: 120000,
        cwd: process.cwd(),
    },
});
