import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const API_INTERNA = process.env.VITE_API_PROXY_TARGET ?? 'http://127.0.0.1:3000';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // La API se sirve bajo el mismo origen que la página. Es lo que permite que la
  // cookie de sesión sea `sameSite=lax`: entre `localhost:5173` y `127.0.0.1:3000`
  // el navegador ve dos sitios distintos y no la enviaría. Además evita CORS.
  server: {
    proxy: {
      '/v1': { target: API_INTERNA, changeOrigin: false },
      '/health': { target: API_INTERNA, changeOrigin: false },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    // `e2e/` pertenece a Playwright, que tiene su propio `test`. Recogido por Vitest
    // falla al cargarse y deja la suite en rojo por un motivo que no es un fallo.
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/main.tsx', 'src/test/**', 'src/**/*.d.ts'],
      thresholds: { statements: 80, branches: 80, functions: 80, lines: 80 },
    },
  },
});
