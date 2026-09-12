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
    sobrantes?: { id: string }[];
    artefactos?: { objectKey: string }[];
    compartidoConOtro?: boolean;
    fallaElBorrado?: boolean;
  } = {},
): Dobles {
  const sobrantes = jest.fn().mockResolvedValue(opciones.sobrantes ?? []);
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

describe('StatementRetentionService', () => {
  it('pide solo los documentos que exceden el cupo, del más antiguo hacia atrás', async () => {
    const { service, sobrantes } = construir({ limite: 3 });

    await service.enforceForUploader(ORGANIZATION_ID, USUARIO_ID);

    expect(sobrantes).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: ORGANIZATION_ID, uploadedById: USUARIO_ID },
        // `skip: 3` sobre un orden descendente deja intactos los tres recientes.
        skip: 3,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      }),
    );
  });

  it('no borra nada cuando aún no se llegó al cupo', async () => {
    const { service, borrarDocumento, borrarObjeto, descartarEnWorker } = construir({
      sobrantes: [],
    });

    await expect(service.enforceForUploader(ORGANIZATION_ID, USUARIO_ID)).resolves.toBe(0);
    expect(borrarDocumento).not.toHaveBeenCalled();
    expect(borrarObjeto).not.toHaveBeenCalled();
    expect(descartarEnWorker).not.toHaveBeenCalled();
  });

  it('retira el PDF de origen, los artefactos del worker y la fila', async () => {
    const { service, borrarObjeto, descartarEnWorker, borrarArtefactos, borrarDocumento } =
      construir({
        sobrantes: [{ id: 'viejo' }],
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
      sobrantes: [{ id: 'viejo' }],
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
      sobrantes: [{ id: 'uno' }, { id: 'dos' }],
      artefactos: [],
      fallaElBorrado: true,
    });

    // Ni lanza ni se detiene: la próxima subida vuelve a intentarlo.
    await expect(service.enforceForUploader(ORGANIZATION_ID, USUARIO_ID)).resolves.toBe(0);
    expect(borrarDocumento).toHaveBeenCalledTimes(2);
  });

  it('al eliminar una cuenta borra todos sus documentos, no solo los que exceden el cupo', async () => {
    const { service, sobrantes, borrarDocumento } = construir({
      sobrantes: [{ id: 'uno' }, { id: 'dos' }],
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
      sobrantes: [{ id: 'uno' }, { id: 'dos' }],
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
