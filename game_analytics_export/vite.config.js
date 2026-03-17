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
    },
    // data/ copied via post-build script
  },
  server: {
    port: 5173,
    fs: { allow: ['.'] },
  },
});
