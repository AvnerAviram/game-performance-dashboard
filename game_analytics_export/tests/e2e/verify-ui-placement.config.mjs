import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: '.',
    testMatch: 'verify-ui-placement.spec.mjs',
    timeout: 30000,
    retries: 0,
    workers: 1,
    reporter: 'list',
    use: {
        baseURL: 'http://localhost:3000',
        screenshot: 'on',
    },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
