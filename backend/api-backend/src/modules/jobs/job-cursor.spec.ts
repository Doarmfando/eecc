import { BadRequestException } from '@nestjs/common';

import { decodeJobCursor, encodeJobCursor } from './job-cursor';

const ID = '33333333-3333-4333-8333-333333333333';

describe('cursor del historial', () => {
  it('sobrevive un viaje de ida y vuelta sin perder precisión', () => {
    const createdAt = new Date('2026-08-26T23:45:12.345Z');

    const decoded = decodeJobCursor(encodeJobCursor({ createdAt, id: ID }));

    expect(decoded.createdAt.toISOString()).toBe(createdAt.toISOString());
    expect(decoded.id).toBe(ID);
  });

  it('no expone el contenido en claro dentro de la URL', () => {
    const cursor = encodeJobCursor({ createdAt: new Date('2026-08-26T00:00:00Z'), id: ID });

    expect(cursor).not.toContain(ID);
    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('rechaza cursores manipulados', () => {
    for (const raw of ['', 'no-base64!!', Buffer.from('sinseparador').toString('base64url')]) {
      expect(() => decodeJobCursor(raw)).toThrow(BadRequestException);
    }
    expect(() =>
      decodeJobCursor(Buffer.from(`fecha-invalida|${ID}`).toString('base64url')),
    ).toThrow(BadRequestException);
    expect(() =>
      decodeJobCursor(Buffer.from('2026-08-26T00:00:00Z|no-es-uuid').toString('base64url')),
    ).toThrow(BadRequestException);
  });
});
