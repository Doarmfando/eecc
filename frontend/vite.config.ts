import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

/** Por defecto, la API local: es lo que espera quien clona el repositorio y sigue `EJECUTAR.md`. */
const API_LOCAL = 'http://127.0.0.1:3000';

export default defineConfig(({ mode }) => {
  // `loadEnv` y no `process.env`: al evaluar este archivo, Vite todavía no ha
  // volcado los `.env` al entorno del proceso. Sin esto, poner
  // `VITE_API_PROXY_TARGET` en `.env.local` no tendría ningún efecto y el proxy
  // seguiría apuntando en silencio a donde diga el valor por defecto.
  const env = loadEnv(mode, process.cwd(), 'VITE_');

  /**
   * A dónde reenvía el proxy de desarrollo.
   *
   * Para trabajar contra una API ya desplegada sin levantar nada en local, pon
   * su origen en `VITE_API_PROXY_TARGET` dentro de `frontend/.env.local`, que no
   * se versiona y por tanto no cambia el entorno de nadie más.
   */
  const apiInterna = env.VITE_API_PROXY_TARGET?.trim() || API_LOCAL;

  /**
   * Contra un dominio remoto hay que reescribir la cabecera `Host`: los PaaS
   * enrutan por ella, y un `Host: localhost:5173` no llegaría al servicio.
   * Contra una API local se deja como está, que es lo que el backend espera.
   */
  const esRemota = new URL(apiInterna).hostname !== new URL(API_LOCAL).hostname;

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    // La API se sirve bajo el mismo origen que la página. Es lo que permite que la
    // cookie de sesión sea `sameSite=lax`: entre `localhost:5173` y la API el
    // navegador vería dos sitios distintos y no la enviaría. Además evita CORS.
    //
    // Apuntando a una API desplegada, su cookie llega marcada `Secure` y el
    // navegador la acepta igual porque `localhost` cuenta como origen seguro. No
    // lleva `Domain`, así que al pasar por el proxy queda atada a `localhost`.
    server: {
      proxy: {
        '/v1': { target: apiInterna, changeOrigin: esRemota },
        '/health': { target: apiInterna, changeOrigin: esRemota },
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
  };
});
