import { Loader2 } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';

import { Link } from 'react-router-dom';

import { useSession } from '@/app/use-session';
import { Alert } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import type { MonthlyUsage } from '@/lib/api-client';
import { formatCount } from '@/lib/format';
import { describirFecha, paginasCompradas } from '@/lib/page-balance';
import { countPdfPages } from '@/lib/pdf-pages';

import { useMonthlyUsage } from './queries';

/** Desglose corto: de dónde salen las páginas que le quedan. */
function desglose(saldo: MonthlyUsage): string {
  const compradas = paginasCompradas(saldo);
  const propias = (saldo.pagesAvailable ?? 0) - compradas;
  const partes: string[] = [];
  if (propias > 0) {
    const origen = saldo.lots.some((lote) => lote.source === 'TRIAL')
      ? 'de tu prueba gratuita'
      : saldo.period
        ? 'de tu membresía este periodo'
        : 'de tu membresía';
    partes.push(`${formatCount(propias)} ${origen}`);
  }
  if (compradas > 0) {
    partes.push(`${formatCount(compradas)} compradas`);
  }
  return partes.join(' y ');
}

/** Qué hacer cuando no alcanza: comprar o esperar el próximo periodo. */
function SinSaldoSuficiente(): ReactNode {
  return (
    <>
      Puedes{' '}
      <Link to="/saldo" className="font-medium underline">
        comprar más páginas
      </Link>{' '}
      o dividir el PDF en partes más cortas.
    </>
  );
}

/**
 * Cuántas páginas le quedan a la persona, sumando su membresía o su prueba y lo
 * que compró aparte (ADR-0019), y cuántas traería el PDF que acaba de elegir,
 * antes de enviarlo.
 *
 * El cobro es por páginas, no por documentos guardados: por eso esto solo habla
 * de páginas. El cupo de documentos sigue existiendo por almacenamiento, pero ya
 * no se anuncia aquí.
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
  const saldo = usage.data;
  if (!saldo) {
    return null;
  }

  if (saldo.unlimited) {
    return (
      <p className="mt-3 text-xs text-muted-foreground">
        Membresía <strong>{plan.name}</strong>: volumen de páginas a cotizar, sin tope fijo.
      </p>
    );
  }

  const disponible = saldo.pagesAvailable ?? 0;
  if (disponible <= 0) {
    const pruebaUsada = plan.trialOneTime && paginasCompradas(saldo) === 0;
    return (
      <Alert
        variant="destructive"
        title={pruebaUsada ? 'Ya usaste tu prueba gratuita' : 'No te quedan páginas'}
        className="mt-3"
      >
        {pruebaUsada
          ? 'No se renueva. '
          : saldo.period
            ? `Tu membresía te da páginas nuevas el ${describirFecha(saldo.period.endsAt)}. `
            : ''}
        Para seguir convirtiendo,{' '}
        <Link to="/saldo" className="font-medium underline">
          compra más páginas
        </Link>
        .
      </Alert>
    );
  }

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
    const seExcede = filePages > disponible;
    return (
      <Alert
        variant={seExcede ? 'destructive' : 'default'}
        title={
          seExcede
            ? `No te alcanzan las páginas: el archivo tiene ${formatCount(filePages)}`
            : `Este archivo tiene ${formatCount(filePages)} páginas`
        }
        className="mt-3"
      >
        Te quedan <strong>{formatCount(disponible)}</strong> páginas ({desglose(saldo)}).{' '}
        {seExcede ? (
          <>
            Te faltan <strong>{formatCount(filePages - disponible)}</strong>. <SinSaldoSuficiente />
          </>
        ) : (
          <>
            Después de convertirlo te quedarían{' '}
            <strong>{formatCount(disponible - filePages)}</strong>.
          </>
        )}
      </Alert>
    );
  }

  return (
    <p className="mt-3 text-xs text-muted-foreground" aria-live="polite">
      Te quedan <strong>{formatCount(disponible)}</strong> páginas ({desglose(saldo)}).{' '}
      <Link to="/saldo" className="underline">
        Ver mi saldo
      </Link>
    </p>
  );
}
