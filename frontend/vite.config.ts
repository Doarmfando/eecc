import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * A dónde reenvía el proxy de desarrollo.
 *
 * Por defecto, la API **desplegada**: así `npm run dev` sirve el frontend en
 * curso contra los datos y las cuentas reales sin levantar nada más. Para
 * trabajar contra una API local, pon `VITE_API_PROXY_TARGET=http://127.0.0.1:3000`
 * en `frontend/.env.local`.
 */
const API_DESPLEGADA = 'https://eecc-api-production.up.railway.app';
const API_INTERNA = process.env.VITE_API_PROXY_TARGET ?? API_DESPLEGADA;

/**
 * Contra un dominio remoto hay que reescribir la cabecera `Host`: Railway enruta
 * por ella, y un `Host: localhost:5173` no llegaría al servicio. Contra una API
 * local se deja como está, que es lo que el backend espera.
 */
const ES_REMOTA = new URL(API_INTERNA).hostname !== '127.0.0.1';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // La API se sirve bajo el mismo origen que la página. Es lo que permite que la
  // cookie de sesión sea `sameSite=lax`: entre `localhost:5173` y la API el
  // navegador vería dos sitios distintos y no la enviaría. Además evita CORS.
  //
  // La cookie que emite la API desplegada es `Secure`; el navegador la acepta
  // igual porque `localhost` cuenta como origen seguro. No lleva `Domain`, así
  // que al pasar por el proxy queda atada a `localhost` sin reescribir nada.
  server: {
    proxy: {
      '/v1': { target: API_INTERNA, changeOrigin: ES_REMOTA },
      '/health': { target: API_INTERNA, changeOrigin: ES_REMOTA },
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
