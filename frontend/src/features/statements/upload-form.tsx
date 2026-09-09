import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2, FileUp, Loader2, UploadCloud } from 'lucide-react';
import { useId, useState, type DragEvent, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { formatBytes } from '@/lib/format';

import { uploadSchema, type UploadFormSchema } from './upload-schema';
import { MAX_CLIENT_BYTES } from './validate-file';

export interface UploadFormValues {
  file: File;
  defaultYear?: number;
}

export function UploadForm({
  disabled = false,
  pending,
  onSubmit,
}: {
  /** Reservado para estados en los que el envío no procede; por defecto, activo. */
  disabled?: boolean;
  pending: boolean;
  onSubmit: (values: UploadFormValues) => void;
}): ReactNode {
  const fileInputId = useId();
  const yearInputId = useId();
  const fileErrorId = useId();
  const yearErrorId = useId();
  const [isDragging, setDragging] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<UploadFormSchema>({
    resolver: zodResolver(uploadSchema),
    mode: 'onChange',
    defaultValues: { defaultYear: '' },
  });

  const selected = watch('document')?.item(0) ?? null;
  const hasError = Boolean(errors.document);

  function preventDrag(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
  }

  return (
    <form
      className="space-y-6"
      noValidate
      onSubmit={(event) => {
        void handleSubmit((values) => {
          const file = values.document?.item(0);
          if (!file) {
            return;
          }
          onSubmit({
            file,
            ...(values.defaultYear === '' ? {} : { defaultYear: Number(values.defaultYear) }),
          });
        })(event);
      }}
    >
      <div>
        <Label htmlFor={fileInputId}>Estado de cuenta en PDF</Label>
        <div
          onDragEnter={(event) => {
            preventDrag(event);
            setDragging(true);
          }}
          onDragOver={preventDrag}
          onDragLeave={(event) => {
            preventDrag(event);
            setDragging(false);
          }}
          onDrop={() => {
            setDragging(false);
          }}
          className={cn(
            'relative mt-2 flex flex-col items-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors sm:p-10',
            hasError
              ? 'border-destructive/40 bg-destructive/5'
              : selected
                ? 'border-success/40 bg-success/5'
                : isDragging
                  ? 'border-primary bg-primary/5'
                  : 'border-border bg-muted/30 hover:border-primary/40 hover:bg-primary/5',
          )}
        >
          <span
            className={cn(
              'flex size-12 items-center justify-center rounded-full',
              hasError
                ? 'bg-destructive/10 text-destructive'
                : selected
                  ? 'bg-success/10 text-success'
                  : 'bg-primary/10 text-primary',
            )}
          >
            {selected ? (
              <CheckCircle2 aria-hidden className="size-6" />
            ) : (
              <UploadCloud aria-hidden className="size-6" />
            )}
          </span>

          {selected ? (
            <>
              <p className="text-sm font-medium text-foreground">{selected.name}</p>
              <p className="text-xs text-muted-foreground">
                {formatBytes(selected.size)} · haz clic para cambiar el archivo
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium text-foreground">
                Arrastra tu PDF aquí o haz clic para seleccionarlo
              </p>
              <span
                aria-hidden
                className="pointer-events-none mt-1 inline-flex h-9 items-center gap-2 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow-sm"
              >
                <FileUp aria-hidden className="size-4" />
                Seleccionar archivo
              </span>
            </>
          )}

          <Input
            id={fileInputId}
            type="file"
            accept="application/pdf,.pdf"
            className="absolute inset-0 h-full w-full cursor-pointer border-0 bg-transparent p-0 opacity-0 shadow-none file:hidden"
            aria-invalid={hasError ? true : undefined}
            aria-describedby={fileErrorId}
            {...register('document')}
          />
        </div>
        <p id={fileErrorId} className="mt-2 text-xs text-muted-foreground">
          {errors.document ? (
            <span role="alert" className="text-destructive">
              {errors.document.message}
            </span>
          ) : (
            `Solo estados de cuenta bancarios reconocidos, hasta ${formatBytes(MAX_CLIENT_BYTES)}.`
          )}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-4 rounded-lg border border-border/60 bg-muted/20 p-4">
        <div>
          <Label htmlFor={yearInputId}>
            Año del periodo <span className="font-normal text-muted-foreground">(opcional)</span>
          </Label>
          <Input
            id={yearInputId}
            inputMode="numeric"
            placeholder="2026"
            className="mt-2 w-32 bg-card"
            aria-invalid={errors.defaultYear ? true : undefined}
            aria-describedby={yearErrorId}
            {...register('defaultYear')}
          />
        </div>
        <p id={yearErrorId} className="max-w-xs text-xs text-muted-foreground">
          {errors.defaultYear ? (
            <span role="alert" className="text-destructive">
              {errors.defaultYear.message}
            </span>
          ) : (
            'Úsalo solo si el documento no declara el año en su periodo.'
          )}
        </p>
      </div>

      <div className="space-y-3">
        <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={disabled || pending}>
          {pending ? <Loader2 aria-hidden className="animate-spin" /> : <FileUp aria-hidden />}
          {pending ? 'Procesando…' : 'Procesar estado de cuenta'}
        </Button>

        {pending ? (
          <div
            className="flex items-center gap-4 rounded-lg border border-primary/20 bg-primary/5 p-4"
            aria-live="polite"
          >
            <Loader2 aria-hidden className="size-5 shrink-0 animate-spin text-primary" />
            <div className="min-w-0 flex-1 space-y-2">
              <p className="text-sm font-medium text-foreground">Procesando tu documento</p>
              <Progress aria-label="Procesando el documento" />
              <p className="text-xs text-muted-foreground">
                Extrayendo, validando invariantes y publicando los archivos…
              </p>
            </div>
          </div>
        ) : null}
      </div>
    </form>
  );
}
