/**
 * Qué significa cada código de advertencia, dicho para quien usa el resultado.
 *
 * Un solo sitio para la lista de advertencias y para el aviso al terminar una
 * conversión: la misma advertencia no puede explicarse de dos maneras.
 */
const WARNING_LABELS: Record<string, string> = {
  BCP_AMOUNT_UNPARSEABLE: 'Un importe no pudo interpretarse con certeza.',
  BCP_NEGATIVE_COLUMN_AMOUNT: 'Se encontró un importe negativo en una columna que no lo admite.',
  BCP_BOTH_DEBIT_AND_CREDIT: 'Una fila trae cargo y abono a la vez.',
  BCP_BALANCE_AMOUNT_CONFLICT: 'Una fila trae un saldo que no encaja con sus importes.',
  BCP_DATE_UNPARSEABLE: 'Una fila tiene fecha inválida y quedó sin clasificar.',
  BCP_ROW_UNCLASSIFIED: 'Una fila no se pudo clasificar como movimiento.',
  BCP_ORPHAN_CONTINUATION: 'Una línea de detalle no tenía un movimiento al que pertenecer.',
  BCP_CROSS_PAGE_CONTINUATION: 'Un movimiento continúa en la página siguiente.',
  BCP_CONTINUATION_AMOUNT_CONFLICT:
    'Una continuación entraba en conflicto con el movimiento anterior.',
  BCP_NO_ROWS: 'No se encontraron filas de movimientos en el documento.',
  BCP_UNCLASSIFIED_ROWS_PRESENT: 'Hay filas que el extractor no pudo clasificar.',
  BCP_UNMERGED_CONTINUATIONS_PRESENT: 'Hay líneas de detalle que no se unieron a su movimiento.',
  BCP_INVALID_MOVEMENT_FIELDS: 'Algún movimiento no tiene fecha o descripción.',
  BCP_INVALID_MOVEMENT_AMOUNT: 'Algún movimiento no tiene un importe claro de cargo o abono.',
  BCP_DUPLICATE_PAGE_TOTAL: 'Una página imprime su total más de una vez.',
  BCP_DECLARED_TOTAL_MISMATCH:
    'Los totales de cargos y abonos que imprime el banco no coinciden con la suma de los movimientos leídos.',
  BCP_BALANCE_RECONCILIATION_INCOMPLETE: 'No se pudo reconciliar el saldo con los movimientos.',
  BCP_BALANCE_MISMATCH:
    'El saldo final que imprime el banco no coincide con el saldo inicial más los movimientos leídos.',
  GENERIC_HEADER_NOT_RECOGNISED: 'No se reconocieron los nombres de las columnas de la tabla.',
  GENERIC_ROW_WITHOUT_DATE: 'Alguna fila no tenía una fecha interpretable y se omitió.',
  GENERIC_ROW_WITHOUT_AMOUNT: 'Alguna fila no tenía importes y se omitió.',
  GENERIC_AMOUNT_UNPARSEABLE: 'Un importe no pudo interpretarse con certeza.',
  GENERIC_BALANCE_COLUMN_MISSING:
    'La tabla no trae columna de saldo, así que no se pudo verificar la aritmética.',
  INTERBANK_ROW_UNCLASSIFIED: 'Una fila con importes no se pudo clasificar como movimiento.',
  INTERBANK_AMOUNT_SIDE_UNKNOWN: 'Un importe sin signo no se pudo asignar a ingresos ni a gastos.',
  INTERBANK_DUPLICATE_OPENING_BALANCE: 'El documento declara más de un saldo inicial.',
  BANCO_NACION_HEADER_NOT_FOUND:
    'No se encontró la cabecera de la tabla de movimientos, así que no se sabe qué importe es cargo, abono o saldo.',
  BANCO_NACION_ROW_UNCLASSIFIED: 'Una fila con importes no se pudo clasificar como movimiento.',
  BANCO_NACION_AMOUNT_SIDE_UNKNOWN: 'Un importe no se pudo asignar a cargos, abonos ni saldo.',
  BANCO_NACION_DATE_WITHOUT_YEAR:
    'Una fecha no trae año y el documento no declara su periodo; la fila se omitió.',
  BBVA_HEADER_NOT_FOUND:
    'No se encontró la cabecera de la tabla de movimientos, así que no se sabe qué importe es cargo, ITF o saldo.',
  BBVA_ROW_UNCLASSIFIED: 'Una fila con importes no se pudo clasificar como movimiento.',
  BBVA_AMOUNT_COLUMN_UNKNOWN:
    'Los importes de una fila no se pudieron repartir entre cargo/abono, ITF y saldo.',
  BBVA_DATE_WITHOUT_YEAR:
    'Una fecha no trae año y el documento no trae fecha de emisión de la que deducirlo; escribe el año del periodo y vuelve a procesarlo.',
  BBVA_DUPLICATE_OPENING_BALANCE: 'El documento declara más de un saldo anterior.',
};

/** El aviso de una página con huecos: el único que hoy llega con su página. */
export const PAGE_INCOMPLETE = 'BCP_PAGE_INCOMPLETE';

/** «la página 424», «las páginas 3 y 7», «las páginas 3, 7 y 9». */
export function nombrarPaginas(paginas: readonly number[]): string {
  const numeros = paginas.map(String);
  if (numeros.length <= 1) {
    return `la página ${numeros[0] ?? ''}`.trim();
  }
  return `las páginas ${numeros.slice(0, -1).join(', ')} y ${numeros.at(-1) ?? ''}`;
}

/**
 * La explicación de un código. `paginas` dice dónde mirar cuando el extractor lo
 * sabe; sin ella (una API anterior) la frase no nombra ninguna.
 */
export function describirAviso(code: string, paginas: readonly number[] = []): string {
  if (code === PAGE_INCOMPLETE) {
    const donde =
      paginas.length === 0
        ? 'Una página trae'
        : `${capitalizar(nombrarPaginas(paginas))} ${paginas.length === 1 ? 'trae' : 'traen'}`;
    return `${donde} bastantes menos movimientos que las demás: el PDF parece tener huecos en blanco donde debería haber movimientos.`;
  }
  return WARNING_LABELS[code] ?? 'Advertencia del extractor.';
}

function capitalizar(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}
