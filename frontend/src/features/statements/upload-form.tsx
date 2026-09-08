import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, Upload } from 'lucide-react';
import { useId, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
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

  return (
    <form
      className="space-y-4"
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
        <Input
          id={fileInputId}
          type="file"
          accept="application/pdf,.pdf"
          className="mt-2"
          aria-invalid={errors.document ? true : undefined}
          aria-describedby={fileErrorId}
          {...register('document')}
        />
        <p id={fileErrorId} className="mt-1 text-xs text-muted-foreground">
          {errors.document ? (
            <span role="alert" className="text-destructive">
              {errors.document.message}
            </span>
          ) : selected ? (
            `${selected.name} · ${formatBytes(selected.size)}`
          ) : (
            `Solo estados de cuenta bancarios reconocidos, hasta ${formatBytes(MAX_CLIENT_BYTES)}.`
          )}
        </p>
      </div>

      <div>
        <Label htmlFor={yearInputId}>
          Año del periodo <span className="font-normal text-muted-foreground">(opcional)</span>
        </Label>
        <Input
          id={yearInputId}
          inputMode="numeric"
          placeholder="2026"
          className="mt-2 w-32"
          aria-invalid={errors.defaultYear ? true : undefined}
          aria-describedby={yearErrorId}
          {...register('defaultYear')}
        />
        <p id={yearErrorId} className="mt-1 text-xs text-muted-foreground">
          {errors.defaultYear ? (
            <span role="alert" className="text-destructive">
              {errors.defaultYear.message}
            </span>
          ) : (
            'Úsalo solo si el documento no declara el año en su periodo.'
          )}
        </p>
      </div>

      <Button type="submit" disabled={disabled || pending}>
        {pending ? <Loader2 aria-hidden className="animate-spin" /> : <Upload aria-hidden />}
        {pending ? 'Procesando…' : 'Procesar estado de cuenta'}
      </Button>

      {pending ? (
        <div className="space-y-1" aria-live="polite">
          <Progress aria-label="Procesando el documento" />
          <p className="text-xs text-muted-foreground">
            Extrayendo, validando invariantes y publicando los archivos…
          </p>
        </div>
      ) : null}
    </form>
  );
}
