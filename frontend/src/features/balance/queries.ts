import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
  type UseQueryResult,
} from '@tanstack/react-query';

import { useSession } from '@/app/use-session';
import type { ApiError } from '@/lib/api-error';
import type { PageLot } from '@/lib/page-balance';
import {
  fetchCommercialProducts,
  fetchMemberPageBalance,
  fetchQuote,
  registerPurchase,
  type CommercialProduct,
  type MemberPageBalance,
  type Quote,
  type RegisterPurchaseInput,
} from '@/lib/session-client';

function saldoDeMiembroQueryKey(userId: string): readonly unknown[] {
  return ['miembro-saldo', userId];
}

/** Saldo e historial de lotes de una cuenta, para quien la administra (ADR-0019). */
export function useMemberPageBalance(
  userId: string | undefined,
): UseQueryResult<MemberPageBalance, ApiError> {
  const { baseUrl, estado } = useSession();
  return useQuery<MemberPageBalance, ApiError>({
    queryKey: saldoDeMiembroQueryKey(userId ?? ''),
    enabled: estado === 'autenticado' && userId !== undefined,
    queryFn: ({ signal }) => fetchMemberPageBalance(baseUrl, userId ?? '', signal),
    retry: false,
  });
}

/** Al registrar una compra se refrescan el saldo y el detalle de esa cuenta. */
export function useRegisterPurchase(
  userId: string,
): UseMutationResult<PageLot, ApiError, RegisterPurchaseInput> {
  const { baseUrl } = useSession();
  const queryClient = useQueryClient();
  return useMutation<PageLot, ApiError, RegisterPurchaseInput>({
    mutationFn: (datos) => registerPurchase(baseUrl, userId, datos),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: saldoDeMiembroQueryKey(userId) });
      void queryClient.invalidateQueries({ queryKey: ['miembro-detalle', userId] });
    },
  });
}

/** Recargas y paquetes que se ofrecen hoy, con su precio. */
export function useCommercialProducts(): UseQueryResult<CommercialProduct[], ApiError> {
  const { baseUrl, estado } = useSession();
  return useQuery<CommercialProduct[], ApiError>({
    queryKey: ['catalogo', 'productos'],
    enabled: estado === 'autenticado',
    queryFn: ({ signal }) => fetchCommercialProducts(baseUrl, signal),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

/** Cotización para el producto y la cantidad seleccionados. */
export function useQuote(
  code: string | null,
  pages: number | undefined,
): UseQueryResult<Quote, ApiError> {
  const { baseUrl, estado } = useSession();
  return useQuery<Quote, ApiError>({
    queryKey: ['cotizacion', code, pages ?? null],
    enabled: estado === 'autenticado' && code !== null,
    queryFn: ({ signal }) => fetchQuote(baseUrl, code ?? '', pages, signal),
    retry: false,
  });
}
