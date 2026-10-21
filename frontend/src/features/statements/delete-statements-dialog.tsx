import { Loader2, Trash2 } from 'lucide-react';
import type { ReactNode } from 'react';

import { useNotifications } from '@/components/notifications/notifications-context';
import { SupportDetails } from '@/components/shared/support-details';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { describeError } from '@/lib/api-error';

import { useDeleteStatements } from './queries';

/** Qué se va a borrar: un documento concreto o todo el historial propio. */
export type DeleteTarget = { statementId: string; name: string } | { all: true; count: number };

/**
 * Confirma antes de borrar del historial. El borrado no se puede deshacer: el
 * documento se va con su PDF, su Excel y sus CSV. El foco queda en «Cancelar»
 * para que un Enter distraído no borre nada.
 */
export function DeleteStatementsDialog({
  target,
  onClose,
  onDeleted,
}: {
  target: DeleteTarget | null;
  onClose: () => void;
  /** Tras borrar: por ejemplo, salir de la página de un documento que ya no existe. */
  onDeleted?: (deletedCount: number) => void;
}): ReactNode {
  const borrado = useDeleteStatements();
  const { notify } = useNotifications();
  const todos = target !== null && 'all' in target;

  function cerrar(): void {
    borrado.reset();
    onClose();
  }

  function confirmar(): void {
    if (!target) {
      return;
    }
    borrado.mutate(todos ? {} : { statementId: target.statementId }, {
      onSuccess: ({ deletedCount }) => {
        notify({
          variant: 'success',
          title: todos
            ? `Se ${deletedCount === 1 ? 'borró 1 documento' : `borraron ${String(deletedCount)} documentos`} del historial`
            : `Se borró «${target.name}»`,
          description:
            deletedCount === 0
              ? 'Ya no estaba en tu historial.'
              : 'Se borró con su PDF y sus archivos. Puedes volver a subirlo cuando quieras.',
        });
        borrado.reset();
        onClose();
        onDeleted?.(deletedCount);
      },
    });
  }

  return (
    <Dialog
      open={target !== null}
      onOpenChange={(abierto) => {
        if (!abierto) {
          cerrar();
        }
      }}
    >
      {target ? (
        <DialogContent className="max-w-md">
          <DialogTitle>{todos ? 'Vaciar el historial' : 'Borrar este documento'}</DialogTitle>
          <DialogDescription>
            {todos ? (
              <>
                Se borrarán tus{' '}
                <strong className="text-foreground">
                  {target.count} {target.count === 1 ? 'documento' : 'documentos'}
                </strong>{' '}
                con sus PDF, Excel y CSV, y dejarán de verse en el Centro Financiero y el
                Calendario.
              </>
            ) : (
              <>
                Se borrará{' '}
                <strong className="break-words text-foreground [overflow-wrap:anywhere]">
                  {target.name}
                </strong>{' '}
                con su PDF, su Excel y sus CSV.
              </>
            )}{' '}
            No se puede deshacer: descarga antes lo que necesites.
          </DialogDescription>

          {borrado.isError ? (
            <Alert variant="destructive" title={describeError(borrado.error)}>
              <SupportDetails error={borrado.error} />
            </Alert>
          ) : null}

          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={cerrar} autoFocus>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={borrado.isPending}
              onClick={confirmar}
            >
              {borrado.isPending ? (
                <Loader2 aria-hidden className="animate-spin" />
              ) : (
                <Trash2 aria-hidden />
              )}
              {todos ? 'Vaciar historial' : 'Borrar documento'}
            </Button>
          </div>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
