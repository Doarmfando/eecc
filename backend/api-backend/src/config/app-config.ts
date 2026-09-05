import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsString,
  IsUrl,
  Matches,
  Max,
  Min,
  MinLength,
  ValidateIf,
  validateSync,
} from 'class-validator';

/**
 * Dónde vive el estado de los trabajos.
 *
 * `database` es el modo del producto: PostgreSQL y almacenamiento de objetos.
 * `memory` no escribe nada en ningún disco — ni el PDF de origen, ni los
 * resultados, ni una fila — y todo se pierde al reiniciar el proceso. Sirve para
 * usar la herramienta sin retener información financiera.
 */
export enum PersistenceMode {
  Database = 'database',
  Memory = 'memory',
}

export enum NodeEnvironment {
  Development = 'development',
  Test = 'test',
  Production = 'production',
}

/**
 * Configuración validada al arrancar. Ningún valor por defecto contiene secretos:
 * las claves deben llegar por variables de entorno.
 */
export class AppConfig {
  @IsEnum(NodeEnvironment)
  NODE_ENV: NodeEnvironment = NodeEnvironment.Development;

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT = 3000;

  @IsEnum(PersistenceMode)
  PERSISTENCE_MODE: PersistenceMode = PersistenceMode.Database;

  /** Solo se exige con `PERSISTENCE_MODE=database`; en memoria no hay a qué conectarse. */
  @ValidateIf((config: AppConfig) => config.PERSISTENCE_MODE === PersistenceMode.Database)
  @IsString()
  @MinLength(1)
  DATABASE_URL!: string;

  @IsUrl({ require_tld: false, protocols: ['http', 'https'] })
  WORKER_BASE_URL = 'http://127.0.0.1:8000';

  @IsInt()
  @Min(1000)
  @Max(600000)
  WORKER_TIMEOUT_MS = 120000;

  @IsInt()
  @Min(1024)
  @Max(536870912)
  MAX_UPLOAD_BYTES = 52428800;

  /**
   * Clave HMAC del fingerprint por organización. Vive en el gestor de secretos.
   * En modo memoria no se exige: la huella nunca sale del proceso, así que se
   * deriva de un secreto aleatorio por arranque.
   */
  @ValidateIf((config: AppConfig) => config.PERSISTENCE_MODE === PersistenceMode.Database)
  @IsString()
  @MinLength(32)
  FINGERPRINT_SECRET!: string;

  /**
   * Credencial única aceptada en modo memoria, donde no hay tabla de claves.
   * Debe respetar el mismo formato que una credencial de servicio real.
   */
  @ValidateIf((config: AppConfig) => config.PERSISTENCE_MODE === PersistenceMode.Memory)
  @IsString()
  @Matches(/^[A-Za-z0-9._-]{32,128}$/)
  EPHEMERAL_API_KEY!: string;

  /** Organización a la que se atribuyen los trabajos en modo memoria. */
  @IsString()
  @Matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/)
  EPHEMERAL_ORGANIZATION_ID = '00000000-0000-4000-8000-000000000000';

  /** Trabajos que el modo memoria conserva antes de descartar el más antiguo. */
  @IsInt()
  @Min(1)
  @Max(500)
  EPHEMERAL_MAX_JOBS = 25;

  /** Minutos que un trabajo sobrevive en memoria antes de expirar. */
  @IsInt()
  @Min(1)
  @Max(1440)
  EPHEMERAL_TTL_MINUTES = 60;

  @IsString()
  @MinLength(1)
  STORAGE_ROOT = 'storage';

  @IsString()
  @MinLength(1)
  PROFILE_VERSION = 'bcp-2026.08';

  /** Orígenes autorizados del navegador, separados por coma. Vacío desactiva CORS. */
  @IsString()
  CORS_ORIGINS = '';
}

/** Lista explícita: nunca se responde con comodín a un origen desconocido. */
export function parseCorsOrigins(value: string): string[] {
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

const NUMERIC_KEYS = new Set<keyof AppConfig>([
  'PORT',
  'WORKER_TIMEOUT_MS',
  'MAX_UPLOAD_BYTES',
  'EPHEMERAL_MAX_JOBS',
  'EPHEMERAL_TTL_MINUTES',
]);

export function validateConfig(raw: Record<string, unknown>): AppConfig {
  const coerced: Record<string, unknown> = { ...raw };
  for (const key of NUMERIC_KEYS) {
    const value = coerced[key];
    if (typeof value === 'string' && value.trim() !== '') {
      coerced[key] = Number(value);
    }
  }

  const config = plainToInstance(AppConfig, coerced, { excludeExtraneousValues: false });
  const errors = validateSync(config, { skipMissingProperties: false, whitelist: false });
  if (errors.length > 0) {
    const fields = errors.map((error) => error.property).join(', ');
    throw new Error(`Configuración inválida en: ${fields}`);
  }
  return config;
}
