import { Check, CloudUpload, Cog, Download, ScrollText } from 'lucide-react';
import { useState, type ComponentType, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

import { useSession } from '@/app/use-session';

import { useNotifications, useNotifyError } from '@/components/notifications/notifications-context';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { cupoDe } from '@/features/access/access';
import { AvisoDeVigencia } from '@/features/access/plan-gate';
import {
  AVAILABLE_BANKS,
  AVAILABLE_BANKS_LABEL,
  BankSelector,
  BANK_NAMES,
  type BankId,
} from '@/features/statements/bank-selector';
import { JobSummary } from '@/features/statements/job-summary';
import { ReplaceStatementDialog } from '@/features/statements/replace-statement-dialog';
import { replaceableStatements } from '@/features/statements/replaceable-statements';
import { RetentionNotice } from '@/features/statements/retention-notice';
import {
  UploadForm,
  type PasswordProblem,
  type UploadFormValues,
} from '@/features/statements/upload-form';
import { useJobHistory, useUploadStatement } from '@/features/statements/queries';
import type { ApiError } from '@/lib/api-error';
import { cn } from '@/lib/utils';
import type { Job } from '@/types/job';

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

/** El worker distingue un PDF sin contraseña de uno con la contraseña equivocada. */
function passwordProblemOf(error: ApiError | null): PasswordProblem | null {
  if (error?.code === 'PDF_PASSWORD_REQUIRED') {
    return 'required';
  }
  if (error?.code === 'PDF_PASSWORD_INCORRECT') {
    return 'incorrect';
  }
  return null;
}

/** «Junio.pdf» o, si el documento no tiene nombre guardado, uno genérico. */
function nombreDe(nombre: string | null | undefined): string {
  return nombre ? `«${nombre}»` : 'un documento sin nombre';
}

export function UploadPage(): ReactNode {
  const navigate = useNavigate();
  const upload = useUploadStatement();
  const { usuario } = useSession();
  const { notify } = useNotifications();
  const notifyError = useNotifyError();
  const history = useJobHistory();
  const [selectedBank, setSelectedBank] = useState<BankId>('bcp');
  // Envío en espera de que la persona elija qué documento reemplazar.
  const [awaitingChoice, setAwaitingChoice] = useState<UploadFormValues | null>(null);

  const cupo = cupoDe(usuario);
  // Vencida, la API rechaza la carga: el formulario no se ofrece para algo que fallará.
  const vencida = usuario?.plan?.expired === true;
  const replaceable = replaceableStatements(history.data?.items ?? []);

  /** Lo que pasó, dicho en pantalla: convertido, reutilizado y qué se reemplazó. */
  function avisarResultado(job: Job, fileName: string): void {
    notify({
      id: `subida:${job.jobId}`,
      variant: job.status === 'FAILED' ? 'warning' : 'success',
      title: job.reused ? `${fileName} ya estaba convertido` : `${fileName} convertido`,
      description: job.reused
        ? 'Se reutilizó el resultado anterior: no se borró ningún documento.'
        : 'Revisa las validaciones y descarga el Excel o los CSV.',
    });
    const reemplazados = job.replacedStatements ?? [];
    if (reemplazados.length > 0) {
      notify({
        id: `reemplazo:${job.jobId}`,
        variant: 'warning',
        title:
          reemplazados.length === 1
            ? `Se reemplazó ${nombreDe(reemplazados[0]?.sourceFileName)}`
            : `Se reemplazaron ${String(reemplazados.length)} documentos`,
        description: `Tu membresía guarda ${String(cupo)} documentos: ${reemplazados
          .map((documento) => nombreDe(documento.sourceFileName))
          .join(', ')} ${
          reemplazados.length === 1 ? 'se borró' : 'se borraron'
        } con sus archivos para guardar el nuevo.`,
      });
    }
  }

  function send(values: UploadFormValues, replaceStatementId?: string): void {
    upload.mutate(
      { ...values, ...(replaceStatementId ? { replaceStatementId } : {}) },
      {
        onSuccess: (job) => {
          avisarResultado(job, values.file.name);
          void navigate(`/jobs/${job.jobId}`, { state: { job } });
        },
        onError: (error) => {
          // Siempre un aviso con el porqué y los datos para soporte; si es la
          // contraseña, además se marca su campo.
          notifyError(error, `No se pudo procesar «${values.file.name}»`);
        },
      },
    );
  }

  function handleSubmit(values: UploadFormValues): void {
    // En el cupo, antes de subir se pregunta cuál se reemplaza: después ya sería tarde.
    if (cupo > 0 && replaceable.length >= cupo) {
      setAwaitingChoice(values);
      return;
    }
    send(values);
  }

  const currentStep = upload.isSuccess ? 3 : upload.isPending ? 1 : 0;

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8">
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

      <AvisoDeVigencia />

      <Card>
        <CardHeader>
          <CardTitle>Selecciona tu banco y sube el documento</CardTitle>
          <CardDescription>
            Por ahora se procesan estados de cuenta de {AVAILABLE_BANKS_LABEL} en PDF.
          </CardDescription>
        </CardHeader>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-12">
          <div className="md:col-span-4">
            <BankSelector value={selectedBank} onChange={setSelectedBank} />
          </div>

          <div className="md:col-span-8">
            <p className="text-xs font-bold tracking-wider text-slate-400 uppercase">
              2. Sube tu estado de cuenta
            </p>

            {AVAILABLE_BANKS.has(selectedBank) ? (
              <>
                <span className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
                  Cargando archivo para: {BANK_NAMES[selectedBank]}
                </span>
                <div className="mt-3">
                  <UploadForm
                    disabled={vencida}
                    pending={upload.isPending}
                    passwordProblem={passwordProblemOf(upload.error)}
                    onSubmit={handleSubmit}
                  />
                </div>
              </>
            ) : (
              <p className="mt-3 rounded-lg border border-border/60 bg-muted/20 p-4 text-sm text-muted-foreground">
                Este banco todavía no está disponible. Elige {AVAILABLE_BANKS_LABEL} para continuar.
              </p>
            )}
          </div>
        </div>

        <div className="mt-3">
          <RetentionNotice />
        </div>
      </Card>

      {upload.isSuccess ? <JobSummary job={upload.data} /> : null}

      <ReplaceStatementDialog
        open={awaitingChoice !== null}
        fileName={awaitingChoice?.file.name ?? ''}
        cupo={cupo}
        planName={usuario?.plan?.name}
        documents={replaceable}
        onConfirm={(statementId) => {
          if (awaitingChoice) {
            send(awaitingChoice, statementId);
          }
          setAwaitingChoice(null);
        }}
        onCancel={() => {
          setAwaitingChoice(null);
        }}
      />
    </div>
  );
}
