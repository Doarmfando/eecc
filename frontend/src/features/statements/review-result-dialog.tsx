import { AlertTriangle, Loader2, RotateCcw } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';

import { useNotifications } from '@/components/notifications/notifications-context';
import { SupportDetails } from '@/components/shared/support-details';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { describeError } from '@/lib/api-error';
import { formatMoney } from '@/lib/format';
import type { Job } from '@/types/job';

import { useDeleteStatements, useJobSummaryFigures } from './queries';
import { diferenciaDeSaldo, esDescuadre, motivosDeRevision } from './review-result';

/** Lo que la persona decidió hacer con un resultado que no cuadra. */
export type ReviewDiscard = 'reintentar' | 'cancelar';

/**
 * Al terminar una conversión con discrepancias: qué pasó, cuánto no cuadra y qué
 * hacer, sin obligar a leer la página entera.
 *
 * «Continuar» recibe el foco: un Enter conserva el resultado con su aviso, que es
 * lo que se hace casi siempre. Cerrar con Escape o la ✕ también continúa: lo que
 * borra necesita un clic explícito. «Volver a intentar» y «Cancelar conversión»
 * borran esta conversión (no ocupa cupo) y vuelven a la carga.
 */
export function ReviewResultDialog({
  job,
  open,
  onContinue,
  onDiscarded,
}: {
  job: Job;
  open: boolean;
  onContinue: () => void;
  /** Ya borrada: quien la abrió decide adónde ir. */
  onDiscarded: (choice: ReviewDiscard) => void;
}): ReactNode {
  const borrado = useDeleteStatements();
  const { notify } = useNotifications();
  const [eleccion, setEleccion] = useState<ReviewDiscard | null>(null);
  const continuarRef = useRef<HTMLButtonElement>(null);
  const figuras = useJobSummaryFigures(
    job,
    open && job.warningCodes.includes('BCP_BALANCE_MISMATCH'),
  );
  const diferencia = diferenciaDeSaldo(job, figuras.data);
  const moneda = figuras.data?.moneda ?? 'PEN';
  const nombre = job.sourceFileName ?? 'El documento';
  const ocupado = borrado.isPending;

  function descartar(choice: ReviewDiscard): void {
    setEleccion(choice);
    borrado.mutate(
      { statementId: job.statementId },
      {
        onSuccess: () => {
          notify({
            id: `revision:${job.jobId}`,
            variant: choice === 'reintentar' ? 'info' : 'success',
            title:
              choice === 'reintentar'
                ? `Sube otra vez ${job.sourceFileName ? `«${job.sourceFileName}»` : 'el PDF'}`
                : 'Se canceló la conversión',
            description:
              choice === 'reintentar'
                ? 'Se borró la conversión anterior. Descarga el PDF de nuevo desde tu banca por internet: a veces sale con páginas incompletas.'
                : 'Se borró con su Excel y sus CSV; no ocupa tu cupo.',
          });
          onDiscarded(choice);
        },
      },
    );
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(abierto) => {
        // Cerrar no borra nada: conserva el resultado. Mientras borra, no se cierra.
        if (!abierto && !ocupado) {
          onContinue();
        }
      }}
    >
      <DialogContent
        // En un móvil el aviso entero no cabe: se desplaza dentro de la pantalla.
        className="max-h-[calc(100dvh-2rem)] max-w-lg overflow-y-auto"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          continuarRef.current?.focus();
        }}
      >
        <DialogTitle className="flex items-start gap-2 pr-6 leading-snug">
          <AlertTriangle aria-hidden className="mt-0.5 size-5 shrink-0 text-warning" />
          {esDescuadre(job)
            ? 'El resultado no cuadra con los totales del banco'
            : 'El resultado requiere revisión'}
        </DialogTitle>
        <DialogDescription>
          <strong className="break-words text-foreground [overflow-wrap:anywhere]">{nombre}</strong>{' '}
          se convirtió y el Excel está listo, pero conviene que sepas esto antes de usarlo:
        </DialogDescription>

        <ul className="max-h-[30vh] space-y-2 overflow-y-auto text-sm">
          {motivosDeRevision(job).map((motivo) => (
            <li
              key={motivo}
              className="rounded-lg border border-warning/25 bg-warning/8 p-3 text-warning-foreground"
            >
              {motivo}
            </li>
          ))}
        </ul>

        {diferencia ? (
          <div className="space-y-2 text-sm">
            <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 rounded-lg border border-border/60 bg-muted/40 p-3">
              <dt className="text-muted-foreground">Saldo final según el banco</dt>
              <dd className="text-right tabular-nums">
                {formatMoney(diferencia.segunBanco, moneda)}
              </dd>
              <dt className="text-muted-foreground">Saldo final con lo leído</dt>
              <dd className="text-right tabular-nums">
                {formatMoney(diferencia.segunMovimientos, moneda)}
              </dd>
              <dt className="font-semibold text-foreground">Diferencia</dt>
              <dd className="text-right font-semibold text-warning-foreground tabular-nums">
                {formatMoney(Math.abs(diferencia.diferencia), moneda)}
              </dd>
            </dl>
            <p className="text-foreground">
              Lo más probable: faltan {diferencia.diferencia > 0 ? 'abonos' : 'cargos'} por{' '}
              <strong>{formatMoney(Math.abs(diferencia.diferencia), moneda)}</strong> que el PDF no
              muestra.
            </p>
          </div>
        ) : null}

        <p className="text-sm text-muted-foreground">
          <strong className="text-foreground">Continuar</strong> conserva el Excel con este aviso.{' '}
          <strong className="text-foreground">Volver a intentar</strong> borra esta conversión para
          que subas el PDF otra vez, descargado de nuevo de tu banca por internet.{' '}
          <strong className="text-foreground">Cancelar conversión</strong> la borra sin subir otro.
        </p>

        {borrado.isError ? (
          <Alert variant="destructive" title={describeError(borrado.error)}>
            <SupportDetails error={borrado.error} />
          </Alert>
        ) : null}

        <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            disabled={ocupado}
            onClick={() => {
              descartar('cancelar');
            }}
            className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          >
            {ocupado && eleccion === 'cancelar' ? (
              <Loader2 aria-hidden className="animate-spin" />
            ) : null}
            Cancelar conversión
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={ocupado}
            onClick={() => {
              descartar('reintentar');
            }}
          >
            {ocupado && eleccion === 'reintentar' ? (
              <Loader2 aria-hidden className="animate-spin" />
            ) : (
              <RotateCcw aria-hidden />
            )}
            Volver a intentar
          </Button>
          <Button ref={continuarRef} type="button" disabled={ocupado} onClick={onContinue}>
            Continuar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
