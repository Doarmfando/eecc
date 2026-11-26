import type { RequestWithContext } from '../../common/http/request-context';
import type { AuthenticatedUser } from '../auth/auth.service';
import { UsersController } from './users.controller';
import type { UsersService } from './users.service';

const ACTOR = {
  userId: '11111111-1111-4111-8111-111111111111',
  organizationId: '22222222-2222-4222-8222-222222222222',
  roleRank: 50,
} as unknown as AuthenticatedUser;
const USUARIO_ID = '33333333-3333-4333-8333-333333333333';
const REQUEST = { requestId: 'req-1' } as unknown as RequestWithContext;

/**
 * El controlador arma a mano el objeto que le pasa al servicio, campo por
 * campo: un campo nuevo en el DTO que no se agregue aquí llega validado por
 * `class-validator` y aun así nunca sale del controlador (ya pasó una vez con
 * `monthlyPageQuotaOverride`). Estas pruebas comprueban el `PATCH` completo,
 * no solo que `UsersService.update` haga lo correcto con lo que recibe.
 */
describe('UsersController.update: todos los campos del DTO llegan al servicio', () => {
  function construir(): { controller: UsersController; actualizar: jest.Mock } {
    const actualizar = jest.fn().mockResolvedValue({});
    const service = { update: actualizar } as unknown as UsersService;
    return { controller: new UsersController(service), actualizar };
  }

  it('reenvía la recarga de páginas al mes', async () => {
    const { controller, actualizar } = construir();

    await controller.update(ACTOR, USUARIO_ID, { monthlyPageQuotaOverride: 80 }, REQUEST);

    expect(actualizar).toHaveBeenCalledWith(
      ACTOR.organizationId,
      expect.objectContaining({ userId: ACTOR.userId }),
      USUARIO_ID,
      { monthlyPageQuotaOverride: 80 },
      'req-1',
    );
  });

  it('null quita la recarga: también se reenvía, no se confunde con "no enviado"', async () => {
    const { controller, actualizar } = construir();

    await controller.update(ACTOR, USUARIO_ID, { monthlyPageQuotaOverride: null }, REQUEST);

    expect(actualizar).toHaveBeenCalledWith(
      ACTOR.organizationId,
      expect.objectContaining({ userId: ACTOR.userId }),
      USUARIO_ID,
      { monthlyPageQuotaOverride: null },
      'req-1',
    );
  });

  it('reenvía el resto de campos del PATCH, cada uno por su cuenta', async () => {
    const { controller, actualizar } = construir();

    await controller.update(
      ACTOR,
      USUARIO_ID,
      {
        displayName: 'Nuevo nombre',
        email: 'nuevo@empresa.pe',
        role: 'ADMIN',
        planCode: 'ESPECIAL',
        planExpiresOn: '2099-12-31',
        membershipStatus: 'REVOKED' as never,
      },
      REQUEST,
    );

    const [, , , cambios] = actualizar.mock.calls[0] as [unknown, unknown, unknown, unknown];
    expect(cambios).toEqual({
      displayName: 'Nuevo nombre',
      email: 'nuevo@empresa.pe',
      role: 'ADMIN',
      planCode: 'ESPECIAL',
      planExpiresOn: '2099-12-31',
      membershipStatus: 'REVOKED',
    });
  });

  it('sin nada en el cuerpo, no inventa campos', async () => {
    const { controller, actualizar } = construir();

    await controller.update(ACTOR, USUARIO_ID, {}, REQUEST);

    const [, , , cambios] = actualizar.mock.calls[0] as [unknown, unknown, unknown, unknown];
    expect(cambios).toEqual({});
  });
});

describe('UsersController.detail', () => {
  it('pide el detalle de esa cuenta en la organización de quien consulta', async () => {
    const detalle = jest.fn().mockResolvedValue({ userId: USUARIO_ID, pagesUsed: 7 });
    const service = { detail: detalle } as unknown as UsersService;
    const controller = new UsersController(service);

    const resultado = await controller.detail(ACTOR, USUARIO_ID);

    expect(detalle).toHaveBeenCalledWith(
      ACTOR.organizationId,
      expect.objectContaining({ userId: ACTOR.userId }),
      USUARIO_ID,
    );
    expect(resultado).toEqual({ userId: USUARIO_ID, pagesUsed: 7 });
  });
});
