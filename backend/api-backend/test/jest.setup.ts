/**
 * Variables mínimas para construir el módulo en pruebas.
 *
 * Los valores son ficticios y locales. Nunca sobrescriben lo que ya venga del
 * entorno: así una corrida contra PostgreSQL real conserva su `DATABASE_URL`.
 */
process.env.NODE_ENV ??= 'test';
process.env.DATABASE_URL ??= 'postgresql://usuario:clave@127.0.0.1:5432/eecc_test';
process.env.FINGERPRINT_SECRET ??= 'f'.repeat(48);
process.env.STORAGE_ROOT ??= 'storage-test';
process.env.WORKER_BASE_URL ??= 'http://127.0.0.1:8000';
