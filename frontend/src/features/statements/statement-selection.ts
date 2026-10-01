import { useCallback, useMemo, useSyncExternalStore } from 'react';

import { useSession } from '@/app/use-session';
import type { JobListItem } from '@/types/job';

/**
 * Qué documentos del historial entran al Centro Financiero y al Calendario.
 *
 * Se marcan en el Historial y las dos vistas leen la misma selección, así que
 * nunca muestran conjuntos distintos. Se guardan los **excluidos**, no los
 * elegidos: un documento recién procesado entra solo, sin que nadie tenga que
 * volver a marcarlo.
 *
 * Vive en `localStorage` por persona y solo guarda identificadores de trabajo,
 * nunca importes ni movimientos. Si el almacenamiento no está disponible, todo
 * queda incluido.
 */

const STORAGE_PREFIX = 'eecc:statements-excluded:';
const CHANGE_EVENT = 'eecc:statements-selection';
const EMPTY: readonly string[] = [];

/**
 * Un documento solo se puede consolidar si dejó archivos publicados: de ahí
 * salen sus movimientos. Uno fallido, o todavía en proceso, no tiene nada.
 */
export function isConsolidable(job: JobListItem): boolean {
  return (job.status === 'SUCCEEDED' || job.status === 'NEEDS_REVIEW') && job.artifactCount > 0;
}

function storageKey(userId: string): string {
  return `${STORAGE_PREFIX}${userId}`;
}

// Cache por clave: `useSyncExternalStore` exige la misma referencia mientras el
// valor guardado no cambie.
const snapshots = new Map<string, { raw: string | null; ids: readonly string[] }>();

function readExcluded(key: string): readonly string[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(key);
  } catch {
    return EMPTY;
  }
  const cached = snapshots.get(key);
  if (cached?.raw === raw) {
    return cached.ids;
  }
  let ids: readonly string[] = EMPTY;
  if (raw) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        ids = parsed.filter((value): value is string => typeof value === 'string');
      }
    } catch {
      ids = EMPTY;
    }
  }
  snapshots.set(key, { raw, ids });
  return ids;
}

function writeExcluded(key: string, ids: readonly string[]): void {
  try {
    if (ids.length === 0) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, JSON.stringify(ids));
    }
  } catch {
    // Sin almacenamiento la selección no persiste; todo sigue incluido.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CHANGE_EVENT, onChange);
  // Otra pestaña con la misma sesión.
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

export interface StatementSelection {
  isIncluded: (jobId: string) => boolean;
  setIncluded: (jobId: string, included: boolean) => void;
}

export function useStatementSelection(): StatementSelection {
  const { usuario } = useSession();
  const key = usuario ? storageKey(usuario.userId) : null;

  const excluded = useSyncExternalStore(
    subscribe,
    () => (key ? readExcluded(key) : EMPTY),
    () => EMPTY,
  );

  const excludedSet = useMemo(() => new Set(excluded), [excluded]);

  const isIncluded = useCallback((jobId: string) => !excludedSet.has(jobId), [excludedSet]);

  const setIncluded = useCallback(
    (jobId: string, included: boolean) => {
      if (!key) {
        return;
      }
      const next = new Set(readExcluded(key));
      if (included) {
        next.delete(jobId);
      } else {
        next.add(jobId);
      }
      writeExcluded(key, [...next]);
    },
    [key],
  );

  return { isIncluded, setIncluded };
}
