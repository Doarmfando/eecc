import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { useSession } from '@/app/use-session';
import type { ApiError } from '@/lib/api-error';
import {
  createPlan,
  fetchPlans,
  fetchPlansForAdmin,
  fetchRoles,
  fetchSupportContact,
  updatePlan,
  type CreatePlanInput,
  type PlanAdminOption,
  type PlanOption,
  type RoleOption,
  type UpdatePlanInput,
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

function planesAdminQueryKey(): readonly unknown[] {
  return ['catalogo', 'planes-admin'];
}

/**
 * Todo el catálogo, activo o retirado, para quien lo administra
 * (`PLANS_MANAGE`, ADR-0018). A diferencia de `usePlans`, sí se refresca: es
 * la pantalla donde se edita, no un dato que solo cambia por migración.
 */
export function usePlansForAdmin(): UseQueryResult<PlanAdminOption[], ApiError> {
  const { baseUrl, estado, puedeAdministrarPlanes } = useSession();
  return useQuery<PlanAdminOption[], ApiError>({
    queryKey: planesAdminQueryKey(),
    enabled: estado === 'autenticado' && puedeAdministrarPlanes,
    queryFn: ({ signal }) => fetchPlansForAdmin(baseUrl, signal),
  });
}

/** Al crear o cambiar un plan, se refresca tanto la vista de administrarlo como la de alta. */
function useInvalidarCatalogoDePlanes(): () => void {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: planesAdminQueryKey() });
    void queryClient.invalidateQueries({ queryKey: ['catalogo', 'planes'] });
  };
}

export function useCreatePlan(): UseMutationResult<PlanAdminOption, ApiError, CreatePlanInput> {
  const { baseUrl } = useSession();
  const invalidar = useInvalidarCatalogoDePlanes();
  return useMutation<PlanAdminOption, ApiError, CreatePlanInput>({
    mutationFn: (datos) => createPlan(baseUrl, datos),
    onSuccess: invalidar,
  });
}

export function useUpdatePlan(): UseMutationResult<
  PlanAdminOption,
  ApiError,
  { code: string; cambios: UpdatePlanInput }
> {
  const { baseUrl } = useSession();
  const invalidar = useInvalidarCatalogoDePlanes();
  return useMutation<PlanAdminOption, ApiError, { code: string; cambios: UpdatePlanInput }>({
    mutationFn: ({ code, cambios }) => updatePlan(baseUrl, code, cambios),
    onSuccess: invalidar,
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
