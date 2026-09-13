import { Check, CloudUpload, Cog, Download, ScrollText } from 'lucide-react';
import { useState, type ComponentType, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

import { Alert } from '@/components/ui/alert';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BankSelector, BANK_NAMES, type BankId } from '@/features/statements/bank-selector';
import { JobSummary } from '@/features/statements/job-summary';
import { RetentionNotice } from '@/features/statements/retention-notice';
import { UploadForm, type UploadFormValues } from '@/features/statements/upload-form';
import { useUploadStatement } from '@/features/statements/queries';
import { describeError } from '@/lib/api-error';
import { cn } from '@/lib/utils';

const FLOW_STEPS: ReadonlyArray<{ label: string; Icon: ComponentType<{ className?: string }> }> = [
  { label: 'Subir', Icon: CloudUpload },
  { label: 'Procesar', Icon: Cog },
  { label: 'Resultado', Icon: ScrollText },
  { label: 'Descargar', Icon: Download },
];

function FlowSteps({ current }: { current: number }): ReactNode {
  return (
    <ol className="flex items-center">
      {FLOW_STEPS.map((step, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li key={step.label} className="flex flex-1 items-center last:flex-none">
            <div className="flex flex-col items-center gap-1.5">
              <span
                className={cn(
                  'flex size-9 items-center justify-center rounded-full border-2 transition-colors',
                  done
                    ? 'border-primary bg-primary text-primary-foreground'
                    : active
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-muted text-muted-foreground',
                )}
              >
                {done ? (
                  <Check aria-hidden className="size-4" />
                ) : (
                  <step.Icon aria-hidden className="size-4" />
                )}
              </span>
              <span
                className={cn(
                  'text-xs font-medium whitespace-nowrap',
                  active || done ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {step.label}
              </span>
            </div>
            {index < FLOW_STEPS.length - 1 ? (
              <span
                aria-hidden
                className={cn(
                  'mx-2 mb-5 h-0.5 flex-1 rounded-full transition-colors',
                  done ? 'bg-primary' : 'bg-border',
                )}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

export function UploadPage(): ReactNode {
  const navigate = useNavigate();
  const upload = useUploadStatement();
  const [selectedBank, setSelectedBank] = useState<BankId>('bcp');

  function handleSubmit(values: UploadFormValues): void {
    upload.mutate(values, {
      onSuccess: (job) => {
        void navigate(`/jobs/${job.jobId}`, { state: { job } });
      },
    });
  }

  const currentStep = upload.isSuccess ? 3 : upload.isPending ? 1 : 0;

  return (
    <div className="mx-auto w-full max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          Convertir un estado de cuenta
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Sube el PDF, lo procesamos y validamos contra invariantes financieras, y descargas el
          resultado en Excel y CSV.
        </p>
        <div className="mt-6">
          <FlowSteps current={currentStep} />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Selecciona tu banco y sube el documento</CardTitle>
          <CardDescription>Por ahora procesamos estados de cuenta de BCP en PDF.</CardDescription>
        </CardHeader>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
          <div className="md:col-span-4">
            <BankSelector value={selectedBank} onChange={setSelectedBank} />
          </div>

          <div className="md:col-span-8">
            <p className="text-xs font-bold tracking-wider text-slate-400 uppercase">
              2. Sube tu estado de cuenta
            </p>

            {selectedBank === 'bcp' ? (
              <>
                <span className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                  Cargando archivo para: {BANK_NAMES[selectedBank]}
                </span>
                <div className="mt-3">
                  <UploadForm pending={upload.isPending} onSubmit={handleSubmit} />
                </div>
              </>
            ) : (
              <p className="mt-3 rounded-lg border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
                Este banco todavía no está disponible. Selecciona BCP para continuar.
              </p>
            )}
          </div>
        </div>

        <div className="mt-3">
          <RetentionNotice />
        </div>
      </Card>

      {upload.isError ? (
        <Alert variant="destructive" title={describeError(upload.error)}>
          {upload.error.requestId ? (
            <p className="font-mono text-xs">Referencia: {upload.error.requestId}</p>
          ) : null}
        </Alert>
      ) : null}

      {upload.isSuccess ? <JobSummary job={upload.data} /> : null}
    </div>
  );
}
