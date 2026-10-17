import { describe, expect, it } from 'vitest';

import { MAX_CLIENT_BYTES, validateStatementFile } from './validate-file';

function fileOfSize(bytes: number, name = 'estado.pdf'): File {
  return new File([new Uint8Array(bytes)], name, { type: 'application/pdf' });
}

describe('validateStatementFile', () => {
  it('acepta un PDF con contenido dentro del límite', () => {
    expect(validateStatementFile(fileOfSize(1024))).toBeNull();
  });

  it('exige que se elija un archivo', () => {
    expect(validateStatementFile(null)).toBe('Selecciona un archivo PDF.');
  });

  it('exige extensión .pdf sin importar mayúsculas', () => {
    expect(validateStatementFile(fileOfSize(10, 'estado.PDF'))).toBeNull();
    expect(validateStatementFile(fileOfSize(10, 'estado.xlsx'))).toBe(
      '«estado.xlsx» no es un PDF. Sube el estado de cuenta en PDF, tal como lo descargaste de tu banca.',
    );
  });

  it('rechaza archivos vacíos y los que superan el límite', () => {
    expect(validateStatementFile(fileOfSize(0))).toBe(
      '«estado.pdf» está vacío. Descárgalo de nuevo desde tu banca y vuelve a subirlo.',
    );
    expect(validateStatementFile(fileOfSize(MAX_CLIENT_BYTES + 1))).toMatch(
      /^«estado\.pdf» pesa .+ y el máximo es 50\.0 MB\.$/,
    );
  });
});
