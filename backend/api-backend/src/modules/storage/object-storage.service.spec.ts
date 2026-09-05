import type { ConfigService } from '@nestjs/config';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { AppConfig } from '../../config/app-config';
import { ObjectStorageService } from './object-storage.service';

const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const STATEMENT_ID = '22222222-2222-4222-8222-222222222222';

describe('ObjectStorageService', () => {
  let root: string;
  let service: ObjectStorageService;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), `eecc-storage-${randomUUID()}-`));
    const config = {
      get: (key: string): unknown => (key === 'STORAGE_ROOT' ? root : undefined),
    } as unknown as ConfigService<AppConfig, true>;
    service = new ObjectStorageService(config);
  });

  afterEach(() => {
    rmSync(root, { recursive: true, force: true });
  });

  it('genera claves opacas que no incluyen el nombre original', () => {
    const key = service.buildObjectKey(ORGANIZATION_ID, STATEMENT_ID, 'pdf');
    const other = service.buildObjectKey(ORGANIZATION_ID, STATEMENT_ID, 'pdf');

    expect(key).toMatch(/^organizations\/[\w-]+\/statements\/[\w-]+\/[0-9a-f-]{36}\.pdf$/);
    expect(key).not.toEqual(other);
  });

  it('escribe el objeto y devuelve tamaño y checksum verificables', async () => {
    const content = Buffer.from('%PDF-1.7 contenido sintetico');
    const key = service.buildObjectKey(ORGANIZATION_ID, STATEMENT_ID, 'pdf');

    const stored = await service.put(key, content);

    expect(stored.objectKey).toEqual(key);
    expect(stored.byteSize).toEqual(content.byteLength);
    expect(stored.checksum).toEqual(createHash('sha256').update(content).digest('hex'));
    expect(readFileSync(join(root, key))).toEqual(content);
  });

  it('rechaza una clave que intente escapar del directorio configurado', async () => {
    await expect(service.put('../fuera.pdf', Buffer.from('x'))).rejects.toThrow(/escapa/);
  });
});
