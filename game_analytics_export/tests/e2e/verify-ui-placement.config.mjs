import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: '.',
    testMatch: 'verify-ui-placement.spec.mjs',
    timeout: 30000,
    retries: 0,
    workers: 1,
    reporter: 'list',
    use: {
        baseURL: 'http://localhost:8000',
        screenshot: 'on',
    },
    projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
    webServer: {
        command: 'npm run serve:e2e',
        port: 8000,
        reuseExistingServer: true,
        timeout: 120000,
    },
});
