import { useRef, useState, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { BANK_ACCENTS, bankFromExtractor } from '@/features/financial-center/bank-accent';
import { cn } from '@/lib/utils';
import type { JobListItem } from '@/types/job';

import { formatProcessedAt } from './format-processed-at';

/**
 * Al llegar al cupo, pregunta qué documento se reemplaza antes de subir otro.
 *
 * El más antiguo viene elegido y el botón principal recibe el foco: un Enter
 * basta para seguir como hasta ahora. Elegir otro solo cambia cuál se borra;
 * la API ignora una elección que no sea de quien sube (ADR-0014).
 */
export function ReplaceStatementDialog({
  open,
  fileName,
  cupo,
  planName,
  documents,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  fileName: string;
  cupo: number;
  /** Membresía de quien sube, para decir de dónde sale el cupo. */
  planName?: string | undefined;
  /** Del más antiguo al más reciente, como los da `replaceableStatements`. */
  documents: readonly JobListItem[];
  onConfirm: (statementId: string) => void;
  onCancel: () => void;
}): ReactNode {
  const oldest = documents[0]?.statementId ?? '';
  const [chosen, setChosen] = useState(oldest);
  const confirmRef = useRef<HTMLButtonElement>(null);
  // Si la lista cambia mientras está abierto, la elección vuelve al más antiguo.
  const selected = documents.some((job) => job.statementId === chosen) ? chosen : oldest;
  // Tras bajar de membresía puede sobrar más de uno: el elegido y los más antiguos.
  const extra = Math.max(documents.length - cupo, 0);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onCancel();
        }
      }}
    >
      <DialogContent
        className="max-w-lg"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          setChosen(oldest);
          confirmRef.current?.focus();
        }}
      >
        <DialogTitle>Ya tienes tus {cupo} documentos guardados</DialogTitle>
        <DialogDescription>
          {planName ? `Tu membresía ${planName} guarda ${String(cupo)}. ` : null}
          Para procesar{' '}
          <strong className="break-words text-foreground [overflow-wrap:anywhere]">
            {fileName}
          </strong>{' '}
          hay que reemplazar uno: viene elegido el primero que subiste y basta Enter para seguir, o
          elige otro. Se borra con sus archivos; descarga antes lo que necesites. Si ese PDF ya
          estaba procesado, no se borra nada.
        </DialogDescription>
        {extra > 0 ? (
          <p className="text-sm text-warning-foreground">
            Tienes más documentos de los que guarda tu membresía: además del elegido se borrarán los{' '}
            {extra} más antiguos.
          </p>
        ) : null}

        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (selected) {
              onConfirm(selected);
            }
          }}
        >
          {/* Con 20 documentos (Atlas) la lista se desplaza dentro del diálogo. */}
          <fieldset className="max-h-[45vh] space-y-2 overflow-y-auto pr-1">
            <legend className="mb-2 text-sm font-medium text-foreground">
              Documento a reemplazar
            </legend>
            {documents.map((job, index) => {
              const checked = job.statementId === selected;
              const bank = BANK_ACCENTS[bankFromExtractor(job.extractorId)].name;
              return (
                <label
                  key={job.statementId}
                  className={cn(
                    'flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors',
                    checked
                      ? 'border-primary/40 bg-primary/5'
                      : 'border-border hover:border-primary/30',
                  )}
                >
                  <input
                    type="radio"
                    name="replace-statement"
                    value={job.statementId}
                    checked={checked}
                    onChange={() => {
                      setChosen(job.statementId);
                    }}
                    onKeyDown={(event) => {
                      // Enter sobre la opción confirma, igual que sobre el botón.
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        event.currentTarget.form?.requestSubmit();
                      }
                    }}
                    className="mt-1 size-4 accent-primary"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium break-words text-foreground [overflow-wrap:anywhere]">
                      {job.sourceFileName ?? bank}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      {bank} · subido el {formatProcessedAt(job.createdAt)}
                      {index === 0 ? ' · el más antiguo' : ''}
                    </span>
                  </span>
                </label>
              );
            })}
          </fieldset>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancelar
            </Button>
            <Button ref={confirmRef} type="submit">
              Reemplazar y procesar
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
