import { defineConfig } from 'vite';

export default defineConfig({
  base: '/',
  build: {
    outDir: 'dist',
    assetsDir: 'assets'
  },
  plugins: [
    {
      name: 'docs-middleware',
      configureServer(server) {
        server.middlewares.use((req, _res, next) => {
          if (req.url === '/docs' || req.url === '/docs/') {
            req.url = '/docs/index.html';
          }
          next();
        });
      }
    }
  ]
});
