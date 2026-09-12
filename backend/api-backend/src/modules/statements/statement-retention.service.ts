import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PrismaService } from '../../common/prisma/prisma.service';
import type { AppConfig } from '../../config/app-config';
import { ObjectStorageService } from '../storage/object-storage.service';
import { WorkerClientService } from '../worker-client/worker-client.service';

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
   * Deja como mucho `RETAINED_STATEMENTS_PER_USER` documentos de esa persona.
   *
   * El cupo es por persona y no por organización para que la actividad de alguien
   * no borre el trabajo reciente de otro. `uploadedById` nulo —una credencial de
   * servicio— forma su propio grupo.
   */
  async enforceForUploader(organizationId: string, uploadedById: string | null): Promise<number> {
    const limite = this.config.get('RETAINED_STATEMENTS_PER_USER', { infer: true });

    const sobrantes = await this.prisma.statement.findMany({
      where: { organizationId, uploadedById },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: limite,
      select: { id: true },
    });

    let borrados = 0;
    for (const sobrante of sobrantes) {
      // Uno a uno y sin cortar ante un fallo: que un documento se resista no debe
      // dejar sin limpiar a los demás, y la próxima subida volverá a intentarlo.
      try {
        await this.deleteStatement(organizationId, sobrante.id);
        borrados += 1;
      } catch (error) {
        this.logger.warn(
          `No se pudo retirar un documento caducado: ${error instanceof Error ? error.name : 'error desconocido'}`,
        );
      }
    }

    if (borrados > 0) {
      this.logger.log(`Documentos retirados por el cupo de ${String(limite)}: ${String(borrados)}`);
    }
    return borrados;
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
