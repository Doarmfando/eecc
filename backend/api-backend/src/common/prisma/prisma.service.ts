import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaClient } from '@prisma/client';

import type { AppConfig } from '../../config/app-config';
import { isMemoryMode } from '../persistence/persistence-mode';

/** URL sintética para modo memoria: el cliente se construye pero nunca se conecta. */
const DISABLED_DATASOURCE_URL = 'postgresql://disabled/disabled';

/**
 * Único punto de acceso a PostgreSQL. El worker nunca recibe estas credenciales.
 *
 * En modo memoria el cliente se instancia pero no se conecta: nada debería
 * consultarlo, y si algo lo intenta el fallo de conexión lo delata de inmediato
 * en lugar de escribir en una base que se creía apagada.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly disabled: boolean;

  constructor(config: ConfigService<AppConfig, true>) {
    const disabled = isMemoryMode(config);
    super({
      datasourceUrl: disabled
        ? DISABLED_DATASOURCE_URL
        : config.get('DATABASE_URL', { infer: true }),
    });
    this.disabled = disabled;
  }

  async onModuleInit(): Promise<void> {
    if (this.disabled) {
      this.logger.warn('Persistencia desactivada: no se abre conexión a PostgreSQL');
      return;
    }
    await this.$connect();
    this.logger.log('Conexión a PostgreSQL establecida');
  }

  async onModuleDestroy(): Promise<void> {
    if (this.disabled) {
      return;
    }
    await this.$disconnect();
  }
}
