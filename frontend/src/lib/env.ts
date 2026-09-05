const DEFAULT_BASE_URL = 'http://127.0.0.1:3000';

/** Solo variables `VITE_` llegan al navegador; ninguna credencial se configura aquí. */
export function readBaseUrl(env: { VITE_API_BASE_URL?: string }): string {
  const configured = env.VITE_API_BASE_URL?.trim();
  return configured !== undefined && configured.length > 0 ? configured : DEFAULT_BASE_URL;
}
