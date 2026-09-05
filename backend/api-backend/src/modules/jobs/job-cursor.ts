import { BadRequestException } from '@nestjs/common';

export interface JobCursor {
  createdAt: Date;
  id: string;
}

const SEPARATOR = '|';
const UUID = /^[0-9a-f-]{36}$/i;

/**
 * Paginación por clave, no por desplazamiento: al insertarse trabajos nuevos
 * mientras se navega, ninguna página repite ni salta filas.
 */
export function encodeJobCursor(cursor: JobCursor): string {
  return Buffer.from(`${cursor.createdAt.toISOString()}${SEPARATOR}${cursor.id}`, 'utf8').toString(
    'base64url',
  );
}

export function decodeJobCursor(raw: string): JobCursor {
  const decoded = Buffer.from(raw, 'base64url').toString('utf8');
  const separator = decoded.indexOf(SEPARATOR);
  if (separator < 0) {
    throw new BadRequestException({ code: 'INVALID_CURSOR' });
  }

  const createdAt = new Date(decoded.slice(0, separator));
  const id = decoded.slice(separator + 1);
  if (Number.isNaN(createdAt.getTime()) || !UUID.test(id)) {
    throw new BadRequestException({ code: 'INVALID_CURSOR' });
  }
  return { createdAt, id };
}
