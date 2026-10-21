import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../common/prisma/prisma.service';
import type { AppConfig } from '../../config/app-config';
import { ObjectStorageService } from '../storage/object-storage.service';
import { WorkerClientService } from '../worker-client/worker-client.service';

/** Documento que retiró el cupo, para decírselo a su dueño. */
export interface RemovedStatement {
  statementId: string;
  sourceFileName: string | null;
}

export interface EnforceOptions {
  /**
   * Documentos que conserva quien sube: el cupo de su membresía. Sin valor, el de
   * las credenciales de servicio (`RETAINED_STATEMENTS_PER_USER`).
   */
  limit?: number;
  keepStatementId?: string;
  preferredStatementId?: string;
}

/** `worker/<organización>/<trabajoDelWorker>/[intento/]<nombre>` */
const CLAVE_DEL_WORKER =
  /^worker\/[0-9a-f-]{36}\/([0-9a-f]{32})\/(?:[0-9a-f-]{36}\/)?[A-Za-z0-9._-]{1,120}$/;

/**
 * Conserva solo los documentos más recientes de cada persona y borra el resto.
 *
 * Sin esto, los archivos se acumulan sin fin: cada estado de cuenta deja el PDF
 * de origen en el almacenamiento y sus XLSX/CSV en el disco del worker, y nada
 * los caduca. El tope no es solo ahorro de espacio: también acota cuánto tiempo
 * vive un documento financiero en el servidor.
 *
 * Se borra el documento entero —fila y archivos—, no solo los archivos: un
 * historial que enumera trabajos cuyos resultados ya no se pueden descargar
 * confunde más de lo que informa.
 */
@Injectable()
export class StatementRetentionService {
  private readonly logger = new Logger(StatementRetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: ObjectStorageService,
    private readonly worker: WorkerClientService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /**
   * Deja como mucho `limit` documentos de esa persona: el cupo de su membresía.
   *
   * El cupo es por persona y no por organización para que la actividad de alguien
   * no borre el trabajo reciente de otro. `uploadedById` nulo —una credencial de
   * servicio— forma su propio grupo, con `RETAINED_STATEMENTS_PER_USER`.
   *
   * Tras bajar de membresía puede sobrar más de uno: se retiran todos los que
   * excedan el cupo nuevo, empezando por el elegido.
   *
   * Por defecto sobran los más antiguos. Si la persona eligió cuál reemplazar
   * (`preferredStatementId`), ese sale primero, siempre que sea suyo: la búsqueda
   * ya filtra por organización y dueño, así que un identificador ajeno no
   * coincide con nada y se vuelve al más antiguo (ADR-0014). `keepStatementId`
   * es el documento recién subido, que nunca se borra.
   */
  async enforceForUploader(
    organizationId: string,
    uploadedById: string | null,
    options: EnforceOptions = {},
  ): Promise<RemovedStatement[]> {
    const cupoDeServicio: number = this.config.get('RETAINED_STATEMENTS_PER_USER', { infer: true });
    const limite = options.limit ?? cupoDeServicio;

    const documentos = await this.prisma.statement.findMany({
      where: { organizationId, uploadedById },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true, sourceFileName: true },
    });
    const cuantosSobran = documentos.length - limite;
    if (cuantosSobran <= 0) {
      return [];
    }
    const candidatos = documentos.filter(({ id }) => id !== options.keepStatementId).reverse();
    const elegido = candidatos.find(({ id }) => id === options.preferredStatementId);
    const sobrantes = (
      elegido ? [elegido, ...candidatos.filter((documento) => documento !== elegido)] : candidatos
    ).slice(0, cuantosSobran);

    const borrados: RemovedStatement[] = [];
    for (const sobrante of sobrantes) {
      // Uno a uno y sin cortar ante un fallo: que un documento se resista no debe
      // dejar sin limpiar a los demás, y la próxima subida volverá a intentarlo.
      try {
        await this.deleteStatement(organizationId, sobrante.id);
        borrados.push({ statementId: sobrante.id, sourceFileName: sobrante.sourceFileName });
      } catch (error) {
        this.logger.warn(
          `No se pudo retirar un documento caducado: ${error instanceof Error ? error.name : 'error desconocido'}`,
        );
      }
    }

    if (borrados.length > 0) {
      this.logger.log(
        `Documentos retirados por el cupo de ${String(limite)}: ${String(borrados.length)}`,
      );
    }
    return borrados;
  }

  /**
   * Descarta lo que publicó el worker para un trabajo que no llegó a registrarse,
   * salvo que otro documento ya lo referencie: el identificador del worker se
   * deriva del contenido y lo comparten quienes subieron el mismo PDF.
   */
  async discardUnregisteredWorkerJob(workerJobId: string): Promise<void> {
    const referenciado = await this.prisma.artifact.findFirst({
      where: { objectKey: { contains: `/${workerJobId}/` } },
      select: { id: true },
    });
    if (referenciado) {
      return;
    }
    await this.worker.discardJob(workerJobId);
  }

  /**
   * Borra todos los documentos que subió una persona en la organización.
   *
   * Al contrario que el cupo, aquí un fallo **sí** corta: quien llama va a eliminar
   * la cuenta a continuación, y hacerlo con documentos a medio borrar dejaría
   * archivos financieros sin dueño y sin nadie que los vea en su historial.
   */
  async removeAllForUploader(organizationId: string, uploadedById: string): Promise<number> {
    const documentos = await this.prisma.statement.findMany({
      where: { organizationId, uploadedById },
      select: { id: true },
    });
    for (const documento of documentos) {
      await this.deleteStatement(organizationId, documento.id);
    }
    return documentos.length;
  }

  /** Borra los archivos de un documento y después su fila. */
  private async deleteStatement(organizationId: string, statementId: string): Promise<void> {
    const artefactos = await this.prisma.artifact.findMany({
      where: { organizationId, statementId },
      select: { objectKey: true },
    });

    const trabajosDelWorker = new Set<string>();
    for (const artefacto of artefactos) {
      const coincidencia = CLAVE_DEL_WORKER.exec(artefacto.objectKey);
      if (coincidencia?.[1]) {
        trabajosDelWorker.add(coincidencia[1]);
      } else {
        // Solo el PDF de origen vive en el almacenamiento propio.
        await this.storage.remove(artefacto.objectKey);
      }
    }

    for (const trabajo of trabajosDelWorker) {
      if (await this.otraOrganizacionUsaElTrabajo(trabajo, statementId)) {
        // El identificador del worker se deriva del contenido, así que dos
        // organizaciones que subieron el mismo documento comparten sus artefactos.
        // Borrarlos dejaría a la otra sin poder descargar lo suyo.
        this.logger.log('Artefactos del worker conservados: otro documento aún los referencia');
        continue;
      }
      await this.worker.discardJob(trabajo);
    }

    // Los artefactos se borran antes que el documento: su relación con el intento
    // es `NoAction`, así que dejar que caigan por cascada depende del orden en que
    // la base resuelva las claves, y eso no conviene darlo por hecho.
    await this.prisma.$transaction([
      this.prisma.artifact.deleteMany({ where: { organizationId, statementId } }),
      this.prisma.statement.delete({
        where: { organizationId_id: { organizationId, id: statementId } },
      }),
    ]);
  }

  /** ¿Queda algún otro documento apuntando a los artefactos de ese trabajo? */
  private async otraOrganizacionUsaElTrabajo(
    workerJobId: string,
    statementIdExcluido: string,
  ): Promise<boolean> {
    const otro = await this.prisma.artifact.findFirst({
      where: {
        objectKey: { contains: `/${workerJobId}/` },
        statementId: { not: statementIdExcluido },
      },
      select: { id: true },
    });
    return otro !== null;
  }
}
