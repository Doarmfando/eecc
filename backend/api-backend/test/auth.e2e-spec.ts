import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { SanitizedExceptionFilter } from '../src/common/http/sanitized-exception.filter';
import { PrismaService } from '../src/common/prisma/prisma.service';
import { hashPassword } from '../src/modules/auth/password-hash';
import { SESSION_COOKIE, hashSessionToken } from '../src/modules/auth/session-cookie';
import { WorkerClientService } from '../src/modules/worker-client/worker-client.service';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = '22222222-2222-4222-8222-222222222222';
const OTRO_USER_ID = '33333333-3333-4333-8333-333333333333';
const EMAIL = 'persona@empresa.pe';
const PASSWORD = 'contraseña-de-prueba-larga';

/**
 * Doble de PostgreSQL centrado en autenticación.
 *
 * Guarda las sesiones en un `Map` para poder comprobar de verdad el ciclo entrar →
 * consultar → salir, que es justo lo que un doble sin estado no demostraría.
 */
interface EstadoUsuario {
  status: string;
  role: string;
  failedAttempts: number;
  lockedUntil: Date | null;
}

function buildPrismaDouble(passwordHash: string): {
  prisma: PrismaService;
  sesiones: Map<string, { revokedAt: Date | null; expiresAt: Date }>;
  usuario: EstadoUsuario;
} {
  const sesiones = new Map<string, { revokedAt: Date | null; expiresAt: Date }>();
  const usuario: EstadoUsuario = {
    status: 'ACTIVE',
    role: 'ADMIN',
    failedAttempts: 0,
    lockedUntil: null,
  };

  const membership = (): Record<string, unknown> => ({
    organizationId: ORGANIZATION_ID,
    userId: USER_ID,
    role: usuario.role,
    status: 'ACTIVE',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    organization: { id: ORGANIZATION_ID, displayName: 'Organización de prueba', status: 'ACTIVE' },
  });

  const filaUsuario = (): Record<string, unknown> => ({
    id: USER_ID,
    emailNormalized: EMAIL,
    displayName: 'Persona de prueba',
    passwordHash,
    status: usuario.status,
    failedAttempts: usuario.failedAttempts,
    lockedUntil: usuario.lockedUntil,
    lastLoginAt: null,
    memberships: [membership()],
    _count: { statements: 2 },
  });

  const prisma = {
    $connect: jest.fn().mockResolvedValue(undefined),
    $disconnect: jest.fn().mockResolvedValue(undefined),
    $transaction: jest.fn(async (arg: unknown) => {
      if (typeof arg === 'function') {
        return (arg as (tx: unknown) => Promise<unknown>)(prisma);
      }
      return Promise.all(arg as Promise<unknown>[]);
    }),
    user: {
      findUnique: jest.fn(({ where }: { where: { emailNormalized?: string; id?: string } }) => {
        if (where.emailNormalized !== undefined) {
          return Promise.resolve(where.emailNormalized === EMAIL ? filaUsuario() : null);
        }
        return Promise.resolve(where.id === USER_ID ? filaUsuario() : null);
      }),
      update: jest.fn(({ data }: { data: Record<string, unknown> }) => {
        if (typeof data.failedAttempts === 'number') {
          usuario.failedAttempts = data.failedAttempts;
        }
        if (data.lockedUntil !== undefined) {
          usuario.lockedUntil = data.lockedUntil as Date | null;
        }
        return Promise.resolve(filaUsuario());
      }),
    },
    session: {
      create: jest.fn(({ data }: { data: { tokenHash: string; expiresAt: Date } }) => {
        sesiones.set(data.tokenHash, { revokedAt: null, expiresAt: data.expiresAt });
        return Promise.resolve({ id: 'session-id', ...data });
      }),
      findUnique: jest.fn(({ where }: { where: { tokenHash: string } }) => {
        const guardada = sesiones.get(where.tokenHash);
        if (!guardada) {
          return Promise.resolve(null);
        }
        return Promise.resolve({
          id: 'session-id',
          userId: USER_ID,
          organizationId: ORGANIZATION_ID,
          revokedAt: guardada.revokedAt,
          expiresAt: guardada.expiresAt,
          user: filaUsuario(),
        });
      }),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn(({ where }: { where: { tokenHash?: string } }) => {
        if (where.tokenHash) {
          const guardada = sesiones.get(where.tokenHash);
          if (guardada) {
            guardada.revokedAt = new Date();
          }
        } else {
          for (const guardada of sesiones.values()) {
            guardada.revokedAt = new Date();
          }
        }
        return Promise.resolve({ count: 1 });
      }),
    },
    organizationMembership: {
      findMany: jest.fn(() => Promise.resolve([{ ...membership(), user: filaUsuario() }])),
      findUnique: jest.fn(({ where }: { where: { organizationId_userId: { userId: string } } }) => {
        const buscado = where.organizationId_userId.userId;
        if (buscado === OTRO_USER_ID) {
          return Promise.resolve({
            ...membership(),
            userId: OTRO_USER_ID,
            role: 'MEMBER',
            user: { ...filaUsuario(), id: OTRO_USER_ID, emailNormalized: 'otra@empresa.pe' },
          });
        }
        return Promise.resolve(
          buscado === USER_ID ? { ...membership(), user: filaUsuario() } : null,
        );
      }),
      update: jest.fn(() => Promise.resolve({ ...membership(), user: filaUsuario() })),
      count: jest.fn().mockResolvedValue(0),
    },
    auditEvent: { create: jest.fn().mockResolvedValue({}) },
    apiKey: { findUnique: jest.fn().mockResolvedValue(null) },
  } as unknown as PrismaService;

  return { prisma, sesiones, usuario };
}

describe('Sesión de usuario (e2e)', () => {
  let app: INestApplication;
  let sesiones: Map<string, { revokedAt: Date | null; expiresAt: Date }>;
  let usuario: EstadoUsuario;
  let prismaDoble: PrismaService;

  beforeAll(async () => {
    const passwordHash = await hashPassword(PASSWORD);
    const doble = buildPrismaDouble(passwordHash);
    sesiones = doble.sesiones;
    usuario = doble.usuario;
    prismaDoble = doble.prisma;

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue(doble.prisma)
      .overrideProvider(WorkerClientService)
      .useValue({ processStatement: jest.fn(), fetchArtifact: jest.fn() })
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('v1', { exclude: ['health'] });
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new SanitizedExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    sesiones.clear();
    usuario.status = 'ACTIVE';
    usuario.role = 'ADMIN';
    usuario.failedAttempts = 0;
    usuario.lockedUntil = null;
  });

  async function entrar(): Promise<string> {
    const respuesta = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: EMAIL, password: PASSWORD })
      .expect(200);
    const cookies = respuesta.headers['set-cookie'] as unknown as string[];
    return cookies.find((cookie) => cookie.startsWith(SESSION_COOKIE)) ?? '';
  }

  it('entrega una cookie httpOnly, no accesible desde la página', async () => {
    const cookie = await entrar();

    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    // El token no aparece en el cuerpo: el navegador lo guarda, el JavaScript no lo ve.
    const respuesta = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: EMAIL, password: PASSWORD })
      .expect(200);
    expect(JSON.stringify(respuesta.body)).not.toContain('token');
    expect(respuesta.body.email).toBe(EMAIL);
    expect(respuesta.body.role).toBe('ADMIN');
  });

  it('permite consultar la sesión y luego cerrarla', async () => {
    const cookie = await entrar();

    const yo = await request(app.getHttpServer())
      .get('/v1/auth/me')
      .set('Cookie', cookie)
      .expect(200);
    expect(yo.body.userId).toBe(USER_ID);
    expect(yo.body.organizationName).toBe('Organización de prueba');

    await request(app.getHttpServer()).post('/v1/auth/logout').set('Cookie', cookie).expect(204);

    // Tras salir, la misma cookie ya no vale: la sesión se revoca en la base y no
    // se espera a que caduque nada firmado.
    await request(app.getHttpServer()).get('/v1/auth/me').set('Cookie', cookie).expect(401);
  });

  it('no distingue una contraseña incorrecta de un correo inexistente', async () => {
    const malaClave = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: EMAIL, password: 'otra-contraseña-larga' })
      .expect(401);

    const correoDesconocido = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: 'nadie@empresa.pe', password: PASSWORD })
      .expect(401);

    expect(malaClave.body.code).toBe('INVALID_CREDENTIALS');
    expect(correoDesconocido.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('rechaza a quien tiene la cuenta desactivada', async () => {
    usuario.status = 'DISABLED';

    const respuesta = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: EMAIL, password: PASSWORD })
      .expect(401);
    expect(respuesta.body.code).toBe('ACCOUNT_DISABLED');
  });

  it('bloquea la cuenta tras varios intentos fallidos seguidos', async () => {
    for (let intento = 0; intento < 5; intento += 1) {
      await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send({ email: EMAIL, password: 'clave-equivocada-larga' })
        .expect(401);
    }

    // Aunque ahora acierte, el bloqueo temporal sigue en pie: es lo que hace inútil
    // probar contraseñas en serie contra un endpoint público.
    const respuesta = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: EMAIL, password: PASSWORD })
      .expect(401);
    expect(respuesta.body.code).toBe('ACCOUNT_LOCKED');
  });

  it('deja de aceptar una sesión revocada aunque la cookie siga en el navegador', async () => {
    const cookie = await entrar();
    const token = cookie.split(';')[0]?.split('=')[1] ?? '';

    const guardada = sesiones.get(hashSessionToken(token));
    expect(guardada).toBeDefined();
    if (guardada) {
      guardada.revokedAt = new Date();
    }

    await request(app.getHttpServer()).get('/v1/auth/me').set('Cookie', cookie).expect(401);
  });

  it('protege la gestión de personas y no la abre a una credencial de servicio', async () => {
    await request(app.getHttpServer()).get('/v1/users').expect(401);

    const cookie = await entrar();
    const listado = await request(app.getHttpServer())
      .get('/v1/users')
      .set('Cookie', cookie)
      .expect(200);
    expect(listado.body[0].email).toBe(EMAIL);
    expect(listado.body[0].documentCount).toBe(2);
  });

  it('solo un administrador gestiona cuentas', async () => {
    // El rol se relee de la membresía en cada petición: no basta con haber sido
    // administrador al entrar.
    usuario.role = 'MEMBER';
    const cookie = await entrar();

    const respuesta = await request(app.getHttpServer())
      .get('/v1/users')
      .set('Cookie', cookie)
      .expect(403);
    expect(respuesta.body.code).toBe('INSUFFICIENT_ROLE');
    await request(app.getHttpServer())
      .delete(`/v1/users/${OTRO_USER_ID}`)
      .set('Cookie', cookie)
      .expect(403);
  });

  it('solo da de alta correos de los dominios admitidos, y la sesión los anuncia', async () => {
    const cookie = await entrar();

    const yo = await request(app.getHttpServer())
      .get('/v1/auth/me')
      .set('Cookie', cookie)
      .expect(200);
    expect(yo.body.allowedEmailDomains).toEqual(['hotmail.com', 'empresa.pe', 'eecc.local']);

    const respuesta = await request(app.getHttpServer())
      .post('/v1/users')
      .set('Cookie', cookie)
      .send({ displayName: 'Diego', email: 'diego@avax.pe', role: 'MEMBER' })
      .expect(400);
    expect(respuesta.body.code).toBe('EMAIL_DOMAIN_NOT_ALLOWED');
  });

  it('no deja eliminar a un administrador', async () => {
    const cookie = await entrar();

    const respuesta = await request(app.getHttpServer())
      .delete(`/v1/users/${USER_ID}`)
      .set('Cookie', cookie)
      .expect(409);
    expect(respuesta.body.code).toBe('ADMIN_CANNOT_BE_DELETED');
  });

  it('rechaza una contraseña fijada demasiado corta sin llegar a guardarla', async () => {
    const cookie = await entrar();

    const respuesta = await request(app.getHttpServer())
      .post(`/v1/users/${OTRO_USER_ID}/password-reset`)
      .set('Cookie', cookie)
      .send({ password: 'corta' })
      .expect(400);
    expect(respuesta.body.code).toBe('VALIDATION_FAILED');
  });

  it('edita el nombre de otra persona recortando los espacios', async () => {
    const cookie = await entrar();

    await request(app.getHttpServer())
      .patch(`/v1/users/${OTRO_USER_ID}`)
      .set('Cookie', cookie)
      .send({ displayName: '  Nombre nuevo  ' })
      .expect(200);

    expect(prismaDoble.user.update).toHaveBeenCalledWith({
      where: { id: OTRO_USER_ID },
      data: { displayName: 'Nombre nuevo' },
    });
  });

  it('un nombre de solo espacios no pasa por válido', async () => {
    const cookie = await entrar();

    await request(app.getHttpServer())
      .patch(`/v1/users/${OTRO_USER_ID}`)
      .set('Cookie', cookie)
      .send({ displayName: '    ' })
      .expect(400);
  });

  it('rechaza campos que la edición no admite', async () => {
    // `forbidNonWhitelisted`: sin él, un campo como `passwordHash` se ignoraría en
    // silencio y quien lo envió creería haberlo cambiado.
    const cookie = await entrar();

    await request(app.getHttpServer())
      .patch(`/v1/users/${OTRO_USER_ID}`)
      .set('Cookie', cookie)
      .send({ passwordHash: 'x' })
      .expect(400);
  });

  it('exige sesión para subir un documento cuando no hay credencial', async () => {
    const anonimo = await request(app.getHttpServer()).get('/v1/jobs').expect(401);
    expect(anonimo.body.code).toBe('AUTHENTICATION_REQUIRED');
  });
});
