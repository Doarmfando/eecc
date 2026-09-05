import { QueryClientProvider } from '@tanstack/react-query';
import { render, type RenderResult } from '@testing-library/react';
import type { ReactElement, ReactNode } from 'react';
import { MemoryRouter } from 'react-router-dom';

import { ApiConfigContext, type ApiConfigValue } from '@/app/api-config-context';
import { createQueryClient } from '@/app/query-client';

export const TEST_API_KEY = 'k'.repeat(48);
export const TEST_BASE_URL = 'http://127.0.0.1:3000';

/** Envuelve con los mismos proveedores que la aplicación real. */
export function renderWithProviders(
  ui: ReactElement,
  { apiKey = TEST_API_KEY }: { apiKey?: string } = {},
): RenderResult {
  const value: ApiConfigValue = {
    baseUrl: TEST_BASE_URL,
    apiKey,
    setApiKey: () => undefined,
    options: apiKey ? { baseUrl: TEST_BASE_URL, apiKey } : null,
  };

  function Wrapper({ children }: { children: ReactNode }): ReactNode {
    return (
      <QueryClientProvider client={createQueryClient()}>
        <ApiConfigContext value={value}>
          <MemoryRouter>{children}</MemoryRouter>
        </ApiConfigContext>
      </QueryClientProvider>
    );
  }

  return render(ui, { wrapper: Wrapper });
}
