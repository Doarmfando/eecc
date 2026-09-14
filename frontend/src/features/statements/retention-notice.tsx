import type { ReactNode } from 'react';

import { useSession } from '@/app/use-session';

import { useJobHistory } from './queries';

/**
 * Cuántos documentos propios caben todavía, y qué pasará al superarlo.
 *
 * Se muestra tanto en el historial como junto al formulario de subida: es antes
 * de subir cuando avisar sirve de algo, porque después el documento más antiguo
 * ya se ha borrado.
 */
export function RetentionNotice(): ReactNode {
  const { usuario } = useSession();
  const history = useJobHistory();
  const cupo = usuario?.retainedStatementsPerUser ?? 0;

  if (cupo <= 0 || !history.data) {
    return null;
  }

  // El historial ya trae solo los propios; se filtra igual por si una API anterior
  // todavía devolviera los de toda la organización.
  const mios = history.data.items.filter((job) => job.uploadedByMe).length;
  const enElTope = mios >= cupo;

  return (
    <p className="text-xs text-muted-foreground">
      Se conservan tus <strong>{cupo}</strong> documentos más recientes
      {enElTope ? (
        <>
          , y ya los tienes todos:{' '}
          <strong>al procesar el siguiente se borrará el más antiguo</strong> junto con sus
          archivos. Descarga lo que necesites conservar.
        </>
      ) : (
        <>
          {' '}
          ({mios} de {cupo} usados). Al superarlo, el más antiguo se borra con sus archivos.
        </>
      )}
    </p>
  );
}
