/**
 * Entorno del modo sin persistencia, aplicado antes de importar `AppModule`.
 *
 * `ConfigModule.forRoot()` valida `process.env` al evaluarse el módulo, no al
 * inicializarse la aplicación: hacerlo desde un `beforeAll` llegaría tarde. Por
 * eso este archivo se importa antes que `AppModule` en la prueba.
 *
 * Los borrados son un intento, no una garantía: si hay un `.env` local,
 * `ConfigModule` lo carga después y puede reponerlos. Que la validación no los
 * exija en este modo se comprueba en `app-config.spec.ts`.
 */
process.env.PERSISTENCE_MODE = 'memory';
process.env.EPHEMERAL_API_KEY = 'm'.repeat(48);
delete process.env.DATABASE_URL;
delete process.env.FINGERPRINT_SECRET;

export const EPHEMERAL_API_KEY = 'm'.repeat(48);
