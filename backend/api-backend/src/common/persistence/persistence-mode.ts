import type { ConfigService } from '@nestjs/config';

import { PersistenceMode, type AppConfig } from '../../config/app-config';

/**
 * En modo memoria nada toca un disco: ni PostgreSQL, ni el PDF de origen, ni los
 * resultados del worker. El precio es que reiniciar el proceso borra el historial.
 */
export function isMemoryMode(config: ConfigService<AppConfig, true>): boolean {
  return config.get('PERSISTENCE_MODE', { infer: true }) === PersistenceMode.Memory;
}
