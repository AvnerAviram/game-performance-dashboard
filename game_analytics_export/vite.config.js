import { defineConfig } from 'vite';

export default defineConfig({
    root: '.',
    build: {
        outDir: 'dist',
        rollupOptions: {
            input: {
                main: 'dashboard.html',
                index: 'index.html',
                login: 'login.html',
            },
            output: {
                manualChunks(id) {
                    if (id.includes('node_modules/chart.js')) return 'vendor-chartjs';
                    if (
                        id.includes('/src/ui/chart-setup') ||
                        id.includes('/src/ui/chart-utils') ||
                        id.includes('/src/ui/chart-config') ||
                        id.includes('/src/ui/charts-modern')
                    )
                        return 'dashboard-components';
                    if (
                        id.includes('/src/lib/data.') ||
                        id.includes('/src/lib/game-fields') ||
                        id.includes('/src/lib/metrics.') ||
                        id.includes('/src/lib/shared-config') ||
                        id.includes('/src/lib/parse-features') ||
                        id.includes('/src/lib/env.') ||
                        id.includes('/src/lib/sanitize.')
                    )
                        return 'core';
                },
            },
        },
    },
    server: {
        port: 5173,
        fs: { allow: ['.'] },
    },
});
