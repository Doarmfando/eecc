import type { ConfigService } from '@nestjs/config';

import type { PrismaService } from '../../common/prisma/prisma.service';
import type { AppConfig } from '../../config/app-config';
import type { ObjectStorageService } from '../storage/object-storage.service';
import type { WorkerClientService } from '../worker-client/worker-client.service';
import { StatementRetentionService } from './statement-retention.service';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const USUARIO_ID = '22222222-2222-4222-8222-222222222222';
const WORKER_JOB_ID = 'a'.repeat(32);
const ATTEMPT_ID = '44444444-4444-4444-8444-444444444444';

function clavePdf(statementId: string): string {
  return `organizations/${ORGANIZATION_ID}/statements/${statementId}/${'b'.repeat(8)}-1111-4111-8111-111111111111.pdf`;
}

function claveWorker(nombre = 'statement.xlsx'): string {
  return `worker/${ORGANIZATION_ID}/${WORKER_JOB_ID}/${ATTEMPT_ID}/${nombre}`;
}

interface Dobles {
  service: StatementRetentionService;
  sobrantes: jest.Mock;
  borrarObjeto: jest.Mock;
  descartarEnWorker: jest.Mock;
  borrarArtefactos: jest.Mock;
  borrarDocumento: jest.Mock;
  otroArtefacto: jest.Mock;
}

function construir(
  opciones: {
    limite?: number;
    /** Documentos de la persona, del más reciente al más antiguo, como los ordena la consulta. */
    documentos?: { id: string }[];
    artefactos?: { objectKey: string }[];
    compartidoConOtro?: boolean;
    fallaElBorrado?: boolean;
  } = {},
): Dobles {
  const sobrantes = jest.fn().mockResolvedValue(opciones.documentos ?? []);
  const otroArtefacto = jest
    .fn()
    .mockResolvedValue(opciones.compartidoConOtro ? { id: 'otro' } : null);
  const borrarObjeto = jest.fn().mockResolvedValue(true);
  const descartarEnWorker = jest.fn().mockResolvedValue(true);
  const borrarArtefactos = jest.fn().mockResolvedValue({ count: 1 });
  const borrarDocumento = opciones.fallaElBorrado
    ? jest.fn().mockRejectedValue(new Error('fila bloqueada'))
    : jest.fn().mockResolvedValue({});

  const prisma = {
    statement: { findMany: sobrantes, delete: borrarDocumento },
    artifact: {
      findMany: jest.fn().mockResolvedValue(opciones.artefactos ?? []),
      findFirst: otroArtefacto,
      deleteMany: borrarArtefactos,
    },
    $transaction: jest.fn((operaciones: unknown) => Promise.all(operaciones as Promise<unknown>[])),
  } as unknown as PrismaService;

  const config = {
    get: (): number => opciones.limite ?? 3,
  } as unknown as ConfigService<AppConfig, true>;

  return {
    service: new StatementRetentionService(
      prisma,
      { remove: borrarObjeto } as unknown as ObjectStorageService,
      { discardJob: descartarEnWorker } as unknown as WorkerClientService,
      config,
    ),
    sobrantes,
    borrarObjeto,
    descartarEnWorker,
    borrarArtefactos,
    borrarDocumento,
    otroArtefacto,
  };
}

/** Qué documentos se borraron, en orden. */
function borrados(borrarDocumento: jest.Mock): string[] {
  return borrarDocumento.mock.calls.map(
    (llamada) =>
      (llamada[0] as { where: { organizationId_id: { id: string } } }).where.organizationId_id.id,
  );
}

describe('StatementRetentionService', () => {
  it('por defecto borra los que exceden el cupo empezando por el más antiguo', async () => {
    const { service, sobrantes, borrarDocumento } = construir({
      limite: 3,
      documentos: [{ id: 'nuevo' }, { id: 'b' }, { id: 'c' }, { id: 'viejo' }],
    });

    await expect(service.enforceForUploader(ORGANIZATION_ID, USUARIO_ID)).resolves.toBe(1);

    expect(sobrantes).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: ORGANIZATION_ID, uploadedById: USUARIO_ID },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    );
    expect(borrados(borrarDocumento)).toEqual(['viejo']);
  });

  it('borra el documento que eligió la persona en vez del más antiguo', async () => {
    const { service, borrarDocumento } = construir({
      documentos: [{ id: 'nuevo' }, { id: 'b' }, { id: 'c' }, { id: 'viejo' }],
    });

    await service.enforceForUploader(ORGANIZATION_ID, USUARIO_ID, {
      keepStatementId: 'nuevo',
      preferredStatementId: 'b',
    });

    expect(borrados(borrarDocumento)).toEqual(['b']);
  });

  it.each([
    ['es de otra persona u organización', 'ajeno'],
    ['es el documento recién subido', 'nuevo'],
  ])('vuelve al más antiguo si el elegido %s', async (_motivo, elegido) => {
    const { service, borrarDocumento } = construir({
      documentos: [{ id: 'nuevo' }, { id: 'b' }, { id: 'c' }, { id: 'viejo' }],
    });

    await service.enforceForUploader(ORGANIZATION_ID, USUARIO_ID, {
      keepStatementId: 'nuevo',
      preferredStatementId: elegido,
    });

    expect(borrados(borrarDocumento)).toEqual(['viejo']);
  });

  it('una elección sin cupo superado no borra nada', async () => {
    const { service, borrarDocumento } = construir({
      documentos: [{ id: 'nuevo' }, { id: 'b' }, { id: 'c' }],
    });

    await expect(
      service.enforceForUploader(ORGANIZATION_ID, USUARIO_ID, { preferredStatementId: 'b' }),
    ).resolves.toBe(0);
    expect(borrarDocumento).not.toHaveBeenCalled();
  });

  it('no borra nada cuando aún no se llegó al cupo', async () => {
    const { service, borrarDocumento, borrarObjeto, descartarEnWorker } = construir({
      documentos: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    });

    await expect(service.enforceForUploader(ORGANIZATION_ID, USUARIO_ID)).resolves.toBe(0);
    expect(borrarDocumento).not.toHaveBeenCalled();
    expect(borrarObjeto).not.toHaveBeenCalled();
    expect(descartarEnWorker).not.toHaveBeenCalled();
  });

  it('retira el PDF de origen, los artefactos del worker y la fila', async () => {
    const { service, borrarObjeto, descartarEnWorker, borrarArtefactos, borrarDocumento } =
      construir({
        documentos: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'viejo' }],
        artefactos: [
          { objectKey: clavePdf('viejo') },
          { objectKey: claveWorker('statement.xlsx') },
          { objectKey: claveWorker('statement_Movimientos.csv') },
        ],
      });

    await expect(service.enforceForUploader(ORGANIZATION_ID, USUARIO_ID)).resolves.toBe(1);

    expect(borrarObjeto).toHaveBeenCalledTimes(1);
    expect(borrarObjeto).toHaveBeenCalledWith(clavePdf('viejo'));
    // Los dos artefactos pertenecen al mismo trabajo del worker: se descarta una vez.
    expect(descartarEnWorker).toHaveBeenCalledTimes(1);
    expect(descartarEnWorker).toHaveBeenCalledWith(WORKER_JOB_ID);
    expect(borrarArtefactos).toHaveBeenCalled();
    expect(borrarDocumento).toHaveBeenCalled();
  });

  it('no descarta artefactos del worker que otro documento sigue usando', async () => {
    // El identificador del worker se deriva del contenido: dos organizaciones que
    // subieron el mismo archivo comparten sus resultados. Borrarlos dejaría a la
    // otra sin poder descargar lo suyo.
    const { service, descartarEnWorker, borrarDocumento } = construir({
      documentos: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'viejo' }],
      artefactos: [{ objectKey: claveWorker() }],
      compartidoConOtro: true,
    });

    await service.enforceForUploader(ORGANIZATION_ID, USUARIO_ID);

    expect(descartarEnWorker).not.toHaveBeenCalled();
    // La fila propia sí se retira: lo compartido son los archivos, no el registro.
    expect(borrarDocumento).toHaveBeenCalled();
  });

  it('sigue con los demás cuando uno falla', async () => {
    const { service, borrarDocumento } = construir({
      documentos: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'uno' }, { id: 'dos' }],
      artefactos: [],
      fallaElBorrado: true,
    });

    // Ni lanza ni se detiene: la próxima subida vuelve a intentarlo.
    await expect(service.enforceForUploader(ORGANIZATION_ID, USUARIO_ID)).resolves.toBe(0);
    expect(borrarDocumento).toHaveBeenCalledTimes(2);
  });

  it('al eliminar una cuenta borra todos sus documentos, no solo los que exceden el cupo', async () => {
    const { service, sobrantes, borrarDocumento } = construir({
      documentos: [{ id: 'uno' }, { id: 'dos' }],
      artefactos: [],
    });

    await expect(service.removeAllForUploader(ORGANIZATION_ID, USUARIO_ID)).resolves.toBe(2);

    const consulta = sobrantes.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(consulta.where).toEqual({ organizationId: ORGANIZATION_ID, uploadedById: USUARIO_ID });
    expect(consulta).not.toHaveProperty('skip');
    expect(borrarDocumento).toHaveBeenCalledTimes(2);
  });

  it('al eliminar una cuenta se detiene ante un fallo en vez de dejarla a medias', async () => {
    // Quien llama borra la cuenta justo después: si siguiera, quedarían archivos
    // financieros sin dueño y sin nadie que los viera en su historial.
    const { service, borrarDocumento } = construir({
      documentos: [{ id: 'uno' }, { id: 'dos' }],
      artefactos: [],
      fallaElBorrado: true,
    });

    await expect(service.removeAllForUploader(ORGANIZATION_ID, USUARIO_ID)).rejects.toThrow();
    expect(borrarDocumento).toHaveBeenCalledTimes(1);
  });

  it('agrupa por subidor, de modo que una credencial de servicio no gasta el cupo de nadie', async () => {
    const { service, sobrantes } = construir();

    await service.enforceForUploader(ORGANIZATION_ID, null);

    expect(sobrantes).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: ORGANIZATION_ID, uploadedById: null },
      }),
    );
  });
});
