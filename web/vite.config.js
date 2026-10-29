import { defineConfig } from 'vite';

/* 开发时把 /api 与 /ws 代理到本地服务端，前端代码里一律用相对路径，
   这样开发与部署（Nginx 同源反代）走的是同一套路径，不会出现"本地能跑线上 404"。 */
const BACKEND = process.env.MOOPET_BACKEND || 'http://127.0.0.1:8080';

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/api': { target: BACKEND, changeOrigin: true },
      '/ws': { target: BACKEND, ws: true, changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    chunkSizeWarningLimit: 900,
  },
});
