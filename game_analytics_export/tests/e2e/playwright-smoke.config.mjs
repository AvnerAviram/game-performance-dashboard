import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: '.',
    testMatch: 'smoke-e2e.spec.mjs',
    timeout: 120000,
    retries: 0,
    workers: 1,
    reporter: 'list',
    use: {
        baseURL: 'http://localhost:3000',
        screenshot: 'only-on-failure',
    },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
