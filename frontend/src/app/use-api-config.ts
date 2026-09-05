import { use } from 'react';

import { ApiConfigContext, type ApiConfigValue } from './api-config-context';

export function useApiConfig(): ApiConfigValue {
  const value = use(ApiConfigContext);
  if (!value) {
    throw new Error('useApiConfig requiere ApiConfigProvider');
  }
  return value;
}
