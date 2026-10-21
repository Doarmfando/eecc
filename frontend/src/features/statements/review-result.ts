import { describirAviso } from '@/components/shared/warning-labels';
import type { DeclaredSummary } from '@/features/financial-center/statement-from-csv';
import type { Job } from '@/types/job';

/**
 * Avisos que dicen que los totales del banco no cuadran con lo leído. Son los que
 * merecen detener a la persona al terminar: el Excel sirve, pero le faltan o le
 * sobran movimientos respecto de lo que el banco declara.
 */
const DESCUADRES: ReadonlySet<string> = new Set([
  'BCP_DECLARED_TOTAL_MISMATCH',
  'BCP_BALANCE_MISMATCH',
  'BCP_PAGE_INCOMPLETE',
]);

/**
 * El saldo solo se compara cuando el propio extractor dijo que no cuadra: en otros
 * bancos el `Resumen` puede definir sus totales de otra forma (el ITF del BBVA) y
 * una resta ingenua inventaría una diferencia.
 */
const DESCUADRE_DE_SALDO = 'BCP_BALANCE_MISMATCH';

/** Primero dónde mirar, luego el porqué, luego el resto. */
const ORDEN: readonly string[] = [
  'BCP_PAGE_INCOMPLETE',
  'BCP_BALANCE_MISMATCH',
  'BCP_DECLARED_TOTAL_MISMATCH',
];

/** Un resultado recién convertido que hay que decidir si se usa. */
export function pideRevision(job: Pick<Job, 'status' | 'artifacts'>): boolean {
  // Sin archivos no hay nada que conservar: eso ya lo dice la página como error.
  return job.status === 'NEEDS_REVIEW' && job.artifacts.length > 0;
}

/** Si el problema es un descuadre con el banco y no una fila dudosa. */
export function esDescuadre(job: Pick<Job, 'warningCodes'>): boolean {
  return job.warningCodes.some((code) => DESCUADRES.has(code));
}

/** Lo que pasó, en frases, empezando por dónde mirar. */
export function motivosDeRevision(job: Pick<Job, 'warningCodes' | 'warningPages'>): string[] {
  const posicion = (code: string): number => {
    const index = ORDEN.indexOf(code);
    return index === -1 ? ORDEN.length : index;
  };
  return [...new Set(job.warningCodes)]
    .sort((a, b) => posicion(a) - posicion(b))
    .map((code) =>
      describirAviso(
        code,
        (job.warningPages ?? []).filter((page) => page.code === code).map((page) => page.page),
      ),
    );
}

export interface DiferenciaDeSaldo {
  /** Lo que imprime el banco como saldo final, en céntimos. */
  segunBanco: number;
  /** Saldo inicial + abonos − cargos de los movimientos leídos, en céntimos. */
  segunMovimientos: number;
  /** `segunBanco − segunMovimientos`: positivo, faltan abonos; negativo, faltan cargos. */
  diferencia: number;
}

/**
 * Cuánto no cuadra, con las cifras del `Resumen` que ya publicó el trabajo.
 *
 * Se calcula en el navegador a propósito: la API no devuelve importes (ADR-0002) y
 * el CSV ya está autorizado para su dueño. `null` si el extractor no reportó un
 * descuadre de saldo o al `Resumen` le falta alguna cifra.
 */
export function diferenciaDeSaldo(
  job: Pick<Job, 'warningCodes'>,
  resumen: DeclaredSummary | null | undefined,
): DiferenciaDeSaldo | null {
  if (!resumen || !job.warningCodes.includes(DESCUADRE_DE_SALDO)) {
    return null;
  }
  const { saldoInicial, abonos, cargos, saldoFinal } = resumen;
  if (saldoInicial === null || abonos === null || cargos === null || saldoFinal === null) {
    return null;
  }
  const segunMovimientos = saldoInicial + abonos - cargos;
  const diferencia = saldoFinal - segunMovimientos;
  return diferencia === 0 ? null : { segunBanco: saldoFinal, segunMovimientos, diferencia };
}
