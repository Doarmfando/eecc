import { createContext } from 'react';

import type { ApiClientOptions } from '@/lib/api-client';

export interface ApiConfigValue {
  baseUrl: string;
  apiKey: string;
  setApiKey: (value: string) => void;
  options: ApiClientOptions | null;
}

export const ApiConfigContext = createContext<ApiConfigValue | null>(null);
