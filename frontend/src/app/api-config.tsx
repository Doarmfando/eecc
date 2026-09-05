import { useMemo, useState, type ReactNode } from 'react';

import { readBaseUrl } from '@/lib/env';

import { ApiConfigContext, type ApiConfigValue } from './api-config-context';

export function ApiConfigProvider({
  children,
  baseUrl,
}: {
  children: ReactNode;
  baseUrl?: string;
}): ReactNode {
  const [apiKey, setApiKey] = useState('');
  const resolvedBaseUrl = baseUrl ?? readBaseUrl(import.meta.env);

  const value = useMemo<ApiConfigValue>(
    () => ({
      baseUrl: resolvedBaseUrl,
      apiKey,
      setApiKey,
      options: apiKey ? { baseUrl: resolvedBaseUrl, apiKey } : null,
    }),
    [apiKey, resolvedBaseUrl],
  );

  return <ApiConfigContext value={value}>{children}</ApiConfigContext>;
}
