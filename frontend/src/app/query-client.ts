import { QueryClient } from '@tanstack/react-query';

/** Los reintentos los decide cada hook según el tipo de error del API. */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, refetchOnWindowFocus: false, staleTime: 30_000 },
      mutations: { retry: false },
    },
  });
}
