import { useEffect, useState, type ReactNode } from 'react';

import { useSession } from '@/app/use-session';
import { Alert } from '@/components/ui/alert';
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
      <Alert variant="destructive" title="Ya usaste tu prueba gratuita">
        No se renueva. Pide a un administrador una membresía de pago para seguir convirtiendo.
      </Alert>
    );
  }

  const quota = usage.data?.monthlyPageQuota ?? plan.monthlyPageQuota;
  if (quota === null || quota === undefined) {
    return (
      <p className="text-xs text-muted-foreground">
        Membresía <strong>{plan.name}</strong>: volumen de páginas a cotizar, sin tope fijo.
      </p>
    );
  }

  const usado = usage.data?.pagesUsed ?? 0;
  const total = filePages !== null ? usado + filePages : null;
  const seExcede = total !== null && total > quota;

  return (
    <p
      className={
        seExcede ? 'text-xs font-medium text-destructive' : 'text-xs text-muted-foreground'
      }
      aria-live="polite"
    >
      Membresía <strong>{plan.name}</strong>: llevas <strong>{usado}</strong> de{' '}
      <strong>{quota}</strong> páginas acumuladas este mes.
      {counting ? ' Contando las páginas de tu archivo…' : null}
      {filePages !== null ? (
        seExcede ? (
          <>
            {' '}
            Este archivo tiene <strong>{filePages}</strong> páginas: te pasarías del cupo por{' '}
            <strong>{usado + filePages - quota}</strong>. Espera a que se renueve tu cupo o pide a
            un administrador otra membresía.
          </>
        ) : (
          <>
            {' '}
            Este archivo tiene <strong>{filePages}</strong> páginas; te quedarían{' '}
            <strong>{quota - usado - filePages}</strong> este mes.
          </>
        )
      ) : null}
    </p>
  );
}
