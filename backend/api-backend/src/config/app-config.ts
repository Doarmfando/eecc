import { plainToInstance } from 'class-transformer';
import { IsEnum, IsInt, IsString, IsUrl, Max, Min, MinLength, validateSync } from 'class-validator';

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

  /** Clave HMAC del fingerprint por organización. Vive en el gestor de secretos. */
  @IsString()
  @MinLength(32)
  FINGERPRINT_SECRET!: string;

  @IsString()
  @MinLength(1)
  STORAGE_ROOT = 'storage';

  @IsString()
  @MinLength(1)
  PROFILE_VERSION = 'bcp-2026.08';

  /** Orígenes autorizados del navegador, separados por coma. Vacío desactiva CORS. */
  @IsString()
  CORS_ORIGINS = '';

  /**
   * Cuenta inicial que se crea **solo si la base no tiene ningún usuario**.
   *
   * Sirve para un despliegue nuevo en un PaaS, donde la base solo es accesible
   * desde dentro y no habría forma de sembrarla. Vacías, no se hace nada.
   */
  @IsString()
  BOOTSTRAP_ADMIN_EMAIL = '';

  @IsString()
  BOOTSTRAP_ADMIN_PASSWORD = '';

  /**
   * Dominios de correo admitidos al crear una cuenta o cambiarle el correo,
   * separados por coma. Vacío admite cualquiera.
   *
   * No afecta al inicio de sesión: una cuenta que ya existe sigue pudiendo entrar,
   * para que ajustar la lista no deje fuera a nadie de golpe.
   */
  @IsString()
  ALLOWED_EMAIL_DOMAINS = 'hotmail.com,empresa.pe,eecc.local';

  /**
   * Documentos que se conservan por persona. Al superarlo, los más antiguos se
   * borran enteros: fila y archivos.
   *
   * Existe porque nada más caduca: sin tope, cada estado de cuenta deja para
   * siempre su PDF de origen y sus XLSX/CSV en disco.
   */
  @IsInt()
  @Min(1)
  @Max(100)
  RETAINED_STATEMENTS_PER_USER = 3;

  /**
   * Carpeta con el frontend ya compilado. Vacío significa no servirlo.
   *
   * Servir la página desde la propia API la deja en el mismo origen que `/v1`, que
   * es lo que permite que la cookie de sesión sea `SameSite=Lax`: en dominios
   * distintos el navegador no la enviaría y nadie podría entrar.
   */
  @IsString()
  STATIC_ROOT = '';

  /**
   * Horas que dura una sesión de navegador. Corta a propósito: son documentos
   * financieros y un equipo compartido no debería quedar abierto de un día para otro.
   */
  @IsInt()
  @Min(1)
  @Max(720)
  SESSION_TTL_HOURS = 12;
}

/** Lista explícita: nunca se responde con comodín a un origen desconocido. */
export function parseCorsOrigins(value: string): string[] {
  return value
    .split(',')
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
}

/** `" @Empresa.PE , hotmail.com"` → `["empresa.pe", "hotmail.com"]`. */
export function parseEmailDomains(value: string): string[] {
  return value
    .split(',')
    .map((dominio) => dominio.trim().toLowerCase().replace(/^@/, ''))
    .filter((dominio) => dominio.length > 0);
}

/**
 * Coincidencia exacta con lo que va tras la última arroba: `empresa.pe` no admite
 * `otra.empresa.pe` ni `empresa.pe.falso.com`. Una lista vacía lo admite todo.
 */
export function isEmailDomainAllowed(email: string, dominios: readonly string[]): boolean {
  if (dominios.length === 0) {
    return true;
  }
  const dominio = email.trim().toLowerCase().split('@').pop() ?? '';
  return dominios.includes(dominio);
}

const NUMERIC_KEYS = new Set<keyof AppConfig>([
  'PORT',
  'WORKER_TIMEOUT_MS',
  'MAX_UPLOAD_BYTES',
  'SESSION_TTL_HOURS',
  'RETAINED_STATEMENTS_PER_USER',
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
