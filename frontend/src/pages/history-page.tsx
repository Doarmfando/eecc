import type { ReactNode } from 'react';

import { JobHistory } from '@/features/statements/job-history';

export function HistoryPage(): ReactNode {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Documentos procesados
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Solo los que has subido tú. Abre uno para revisar sus advertencias o descargar sus
          archivos.
        </p>
      </div>

      {/* Sin comprobar credencial: llegar aquí ya exige sesión, porque la ruta
          está protegida en `app.tsx`. */}
      <JobHistory />
    </div>
  );
}
