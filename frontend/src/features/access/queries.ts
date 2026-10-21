import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import { useSession } from '@/app/use-session';
import type { ApiError } from '@/lib/api-error';
import {
  fetchPlans,
  fetchRoles,
  fetchSupportContact,
  type PlanOption,
  type RoleOption,
} from '@/lib/session-client';

/** El catálogo cambia por migración, no durante una sesión: basta pedirlo una vez. */
const UNA_VEZ = { staleTime: Infinity, retry: false } as const;

export function usePlans(): UseQueryResult<PlanOption[], ApiError> {
  const { baseUrl, estado } = useSession();
  return useQuery<PlanOption[], ApiError>({
    queryKey: ['catalogo', 'planes'],
    enabled: estado === 'autenticado',
    queryFn: ({ signal }) => fetchPlans(baseUrl, signal),
    ...UNA_VEZ,
  });
}

/** Solo los que quien consulta puede asignar: la API los filtra por rango. */
export function useRoles(): UseQueryResult<RoleOption[], ApiError> {
  const { baseUrl, estado, puedeAdministrar } = useSession();
  return useQuery<RoleOption[], ApiError>({
    queryKey: ['catalogo', 'roles'],
    enabled: estado === 'autenticado' && puedeAdministrar,
    queryFn: ({ signal }) => fetchRoles(baseUrl, signal),
    ...UNA_VEZ,
  });
}

/**
 * Teléfono de soporte para los avisos de error. Con sesión viene en ella; sin
 * sesión (la pantalla de entrada) o con una API anterior, se pide aparte.
 */
export function useSupportPhone(): string | null {
  const { baseUrl, usuario } = useSession();
  const enSesion = usuario?.supportPhone;
  const consulta = useQuery({
    queryKey: ['soporte'],
    enabled: enSesion === undefined,
    queryFn: ({ signal }) => fetchSupportContact(baseUrl, signal),
    ...UNA_VEZ,
  });
  return enSesion !== undefined ? enSesion : (consulta.data?.phone ?? null);
}
