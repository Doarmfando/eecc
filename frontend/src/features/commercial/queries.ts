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
  createCommercialProduct,
  fetchCommercialProductsForAdmin,
  updateCommercialProduct,
  type CommercialProductAdmin,
  type CreateCommercialProductInput,
  type UpdateCommercialProductInput,
} from '@/lib/session-client';

function productosAdminQueryKey(): readonly unknown[] {
  return ['catalogo', 'productos-admin'];
}

/** Todo el catálogo de saldo, activo o retirado, para quien lo administra (`PLANS_MANAGE`). */
export function useCommercialProductsForAdmin(): UseQueryResult<
  CommercialProductAdmin[],
  ApiError
> {
  const { baseUrl, estado, puedeAdministrarPlanes } = useSession();
  return useQuery<CommercialProductAdmin[], ApiError>({
    queryKey: productosAdminQueryKey(),
    enabled: estado === 'autenticado' && puedeAdministrarPlanes,
    queryFn: ({ signal }) => fetchCommercialProductsForAdmin(baseUrl, signal),
  });
}

function useInvalidarProductos(): () => void {
  const queryClient = useQueryClient();
  return () => {
    void queryClient.invalidateQueries({ queryKey: productosAdminQueryKey() });
  };
}

export function useCreateCommercialProduct(): UseMutationResult<
  CommercialProductAdmin,
  ApiError,
  CreateCommercialProductInput
> {
  const { baseUrl } = useSession();
  const invalidar = useInvalidarProductos();
  return useMutation<CommercialProductAdmin, ApiError, CreateCommercialProductInput>({
    mutationFn: (datos) => createCommercialProduct(baseUrl, datos),
    onSuccess: invalidar,
  });
}

export function useUpdateCommercialProduct(): UseMutationResult<
  CommercialProductAdmin,
  ApiError,
  { code: string; cambios: UpdateCommercialProductInput }
> {
  const { baseUrl } = useSession();
  const invalidar = useInvalidarProductos();
  return useMutation<
    CommercialProductAdmin,
    ApiError,
    { code: string; cambios: UpdateCommercialProductInput }
  >({
    mutationFn: ({ code, cambios }) => updateCommercialProduct(baseUrl, code, cambios),
    onSuccess: invalidar,
  });
}
