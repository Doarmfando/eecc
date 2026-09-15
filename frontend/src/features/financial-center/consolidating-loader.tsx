import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';

import { Card } from '@/components/ui/card';

export function ConsolidatingLoader(): ReactNode {
  return (
    <Card
      role="status"
      aria-live="polite"
      className="mx-auto w-full max-w-2xl items-center gap-4 rounded-2xl py-14 text-center"
    >
      <Loader2 aria-hidden className="size-10 animate-spin text-primary" />
      <div>
        <p className="text-base font-semibold text-foreground">
          Consolidando tus estados de cuenta…
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Cruzando saldos y movimientos de los documentos elegidos.
        </p>
      </div>
      <div aria-hidden className="mt-2 w-full space-y-3">
        <div className="h-24 w-full animate-pulse rounded-2xl bg-muted" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="h-32 animate-pulse rounded-2xl bg-muted" />
          <div className="h-32 animate-pulse rounded-2xl bg-muted" />
        </div>
      </div>
    </Card>
  );
}
