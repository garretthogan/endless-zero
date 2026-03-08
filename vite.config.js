import { defineConfig } from 'vite';

export default defineConfig({
  // For GitHub Pages: set BASE_PATH=/<repo-name>/ in CI so assets load from the project subpath
  base: process.env.BASE_PATH || '/',
  server: {
    host: true,
    port: 5173,
  },
});
