/**
 * Origen de la API. Vacío significa "el mismo que la página", que es lo normal:
 * en desarrollo el proxy de Vite reenvía `/v1`, y en despliegue ambos van detrás
 * del mismo dominio. Solo se configura para apuntar a una API en otro origen, lo
 * que exige además CORS con credenciales.
 */
const DEFAULT_BASE_URL = '';

/** Solo variables `VITE_` llegan al navegador; ninguna credencial se configura aquí. */
export function readBaseUrl(env: { VITE_API_BASE_URL?: string }): string {
  const configured = env.VITE_API_BASE_URL?.trim();
  return configured !== undefined && configured.length > 0 ? configured : DEFAULT_BASE_URL;
}
