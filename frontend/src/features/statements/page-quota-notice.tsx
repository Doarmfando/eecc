import { Loader2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

import { useSession } from '@/app/use-session';
import { Alert } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { countPdfPages } from '@/lib/pdf-pages';

import { useMonthlyUsage } from './queries';

/**
 * Cuántas páginas lleva usadas este mes la persona, y cuántas traería el PDF
 * que acaba de elegir, antes de enviarlo (ADR-0018).
 *
 * El modelo de cobro es por páginas acumuladas al mes, no por documentos
 * guardados: por eso esto solo habla de páginas. El cupo de documentos sigue
 * existiendo por almacenamiento, pero ya no se anuncia aquí.
 */
export function PageQuotaNotice({ selectedFile }: { selectedFile: File | null }): ReactNode {
  const { usuario } = useSession();
  const usage = useMonthlyUsage();
  const [filePages, setFilePages] = useState<number | null>(null);
  const [counting, setCounting] = useState(false);

  useEffect(() => {
    if (!selectedFile) {
      setFilePages(null);
      setCounting(false);
      return;
    }
    let cancelado = false;
    setCounting(true);
    setFilePages(null);
    void countPdfPages(selectedFile).then((paginas) => {
      if (!cancelado) {
        setFilePages(paginas);
        setCounting(false);
      }
    });
    return () => {
      cancelado = true;
    };
  }, [selectedFile]);

  const plan = usuario?.plan;
  if (!plan) {
    return null;
  }

  if (plan.trialOneTime && plan.trialAvailable === false) {
    return (
      <Alert variant="destructive" title="Ya usaste tu prueba gratuita" className="mt-3">
        No se renueva. Pide a un administrador una membresía de pago para seguir convirtiendo.
      </Alert>
    );
  }

  const quota = usage.data?.monthlyPageQuota ?? plan.monthlyPageQuota;
  if (quota === null || quota === undefined) {
    return (
      <p className="mt-3 text-xs text-muted-foreground">
        Membresía <strong>{plan.name}</strong>: volumen de páginas a cotizar, sin tope fijo.
      </p>
    );
  }

  const usado = usage.data?.pagesUsed ?? 0;

  // Contando páginas de un PDF pesado puede tardar un momento: sin esto, la
  // pantalla se queda en silencio entre elegir el archivo y saber si entra.
  if (counting) {
    return (
      <div
        className="mt-3 flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3"
        aria-live="polite"
      >
        <Loader2 aria-hidden className="size-4 shrink-0 animate-spin text-primary" />
        <div className="min-w-0 flex-1 space-y-2">
          <p className="text-sm font-medium text-foreground">
            Analizando tu archivo: contando sus páginas…
          </p>
          <Progress aria-label="Contando las páginas del archivo" />
        </div>
      </div>
    );
  }

  if (filePages !== null) {
    const total = usado + filePages;
    const seExcede = total > quota;
    return (
      <Alert
        variant={seExcede ? 'destructive' : 'default'}
        title={
          seExcede
            ? `No te alcanza el cupo: ${String(filePages)} páginas`
            : `Este archivo tiene ${String(filePages)} páginas`
        }
        className="mt-3"
      >
        Membresía <strong>{plan.name}</strong>: llevas <strong>{usado}</strong> de{' '}
        <strong>{quota}</strong> páginas acumuladas este mes.{' '}
        {seExcede ? (
          <>
            Este archivo tiene <strong>{filePages}</strong> páginas: te pasarías del cupo por{' '}
            <strong>{total - quota}</strong>. Espera a que se renueve tu cupo o pide a un
            administrador otra membresía.
          </>
        ) : (
          <>
            Este archivo tiene <strong>{filePages}</strong> páginas; te quedarían{' '}
            <strong>{quota - total}</strong> este mes.
          </>
        )}
      </Alert>
    );
  }

  return (
    <p className="mt-3 text-xs text-muted-foreground" aria-live="polite">
      Membresía <strong>{plan.name}</strong>: llevas <strong>{usado}</strong> de{' '}
      <strong>{quota}</strong> páginas acumuladas este mes.
    </p>
  );
}
