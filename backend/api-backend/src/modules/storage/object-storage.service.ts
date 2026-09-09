import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import type { AppConfig } from '../../config/app-config';

export interface StoredObject {
  objectKey: string;
  byteSize: number;
  checksum: string;
}

/**
 * Adaptador de almacenamiento. Hoy escribe en disco local con claves opacas;
 * al conectar S3 solo cambia esta clase.
 *
 * Una clave nunca incluye el nombre original, la empresa ni la cuenta.
 */
@Injectable()
export class ObjectStorageService {
  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  buildObjectKey(organizationId: string, statementId: string, suffix: string): string {
    return `organizations/${organizationId}/statements/${statementId}/${randomUUID()}.${suffix}`;
  }

  async put(objectKey: string, content: Buffer): Promise<StoredObject> {
    const destination = this.resolveKey(objectKey);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, content);
    return {
      objectKey,
      byteSize: content.byteLength,
      checksum: createHash('sha256').update(content).digest('hex'),
    };
  }

  async get(objectKey: string): Promise<Buffer> {
    return readFile(this.resolveKey(objectKey));
  }

  /**
   * Borra un objeto. Un objeto que ya no está no es un error: la limpieza debe
   * poder repetirse sin fallar, y un archivo ausente es exactamente el estado
   * que se quería alcanzar.
   */
  async remove(objectKey: string): Promise<boolean> {
    try {
      await rm(this.resolveKey(objectKey));
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return false;
      }
      throw error;
    }
  }

  private resolveKey(objectKey: string): string {
    const root = resolve(this.config.get('STORAGE_ROOT', { infer: true }));
    const destination = resolve(join(root, objectKey));
    if (!destination.startsWith(root)) {
      throw new Error('La clave del objeto escapa del directorio de almacenamiento');
    }
    return destination;
  }
}
