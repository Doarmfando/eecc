import { defineConfig, devices } from '@playwright/test';

/**
 * Prueba de extremo a extremo con navegador real.
 *
 * Requiere la pila levantada: worker, API con PostgreSQL y una credencial válida.
 * Se activa con `E2E_API_KEY`; sin esa variable la suite no aporta nada y se salta.
 */
const PORT = process.env.E2E_PORT ?? '5199';
const BASE_URL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  timeout: 60_000,
  use: {
    baseURL: BASE_URL,
    ...devices['Desktop Chrome'],
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: BASE_URL,
    // No reutiliza un servidor ajeno por defecto: podría ser otro proyecto.
    // `E2E_REUSE_SERVER=1` sirve para apuntar a una instancia propia ya levantada.
    reuseExistingServer: process.env.E2E_REUSE_SERVER === '1',
    timeout: 120_000,
  },
});
