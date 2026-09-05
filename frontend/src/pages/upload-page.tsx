import type { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';

import { useApiConfig } from '@/app/use-api-config';
import { Alert } from '@/components/ui/alert';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CredentialForm } from '@/features/auth/credential-form';
import { JobHistory } from '@/features/statements/job-history';
import { JobSummary } from '@/features/statements/job-summary';
import { UploadForm, type UploadFormValues } from '@/features/statements/upload-form';
import { useUploadStatement } from '@/features/statements/queries';
import { describeError } from '@/lib/api-error';

export function UploadPage(): ReactNode {
  const { apiKey } = useApiConfig();
  const navigate = useNavigate();
  const upload = useUploadStatement();

  function handleSubmit(values: UploadFormValues): void {
    upload.mutate(values, {
      onSuccess: (job) => {
        void navigate(`/jobs/${job.jobId}`, { state: { job } });
      },
    });
  }

  return (
    <div className="space-y-6">
      <CredentialForm />

      <Card>
        <CardHeader>
          <CardTitle>Convertir un estado de cuenta</CardTitle>
          <CardDescription>
            El documento se procesa, se valida contra invariantes financieras y se publica en Excel
            y CSV.
          </CardDescription>
        </CardHeader>
        <div>
          <UploadForm
            disabled={apiKey.length === 0}
            pending={upload.isPending}
            onSubmit={handleSubmit}
          />
        </div>
        {apiKey.length === 0 ? (
          <p className="mt-3 text-sm text-slate-600">
            Escribe tu credencial para habilitar el envío.
          </p>
        ) : null}
      </Card>

      {upload.isError ? (
        <Alert variant="destructive" title={describeError(upload.error)}>
          {upload.error.requestId ? (
            <p className="font-mono text-xs">Referencia: {upload.error.requestId}</p>
          ) : null}
        </Alert>
      ) : null}

      {upload.isSuccess ? <JobSummary job={upload.data} /> : null}

      {apiKey.length === 0 ? null : <JobHistory />}
    </div>
  );
}
