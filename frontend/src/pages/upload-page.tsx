import { useEffect, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { Alert } from '@/components/ui/alert';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { JobHistory } from '@/features/statements/job-history';
import { JobSummary } from '@/features/statements/job-summary';
import { UploadForm, type UploadFormValues } from '@/features/statements/upload-form';
import { useUploadStatement } from '@/features/statements/queries';
import { describeError } from '@/lib/api-error';

export function UploadPage(): ReactNode {
  const navigate = useNavigate();
  const location = useLocation();
  const upload = useUploadStatement();

  useEffect(() => {
    if (!location.hash) {
      return;
    }
    document.querySelector(location.hash)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [location.hash]);

  function handleSubmit(values: UploadFormValues): void {
    upload.mutate(values, {
      onSuccess: (job) => {
        void navigate(`/jobs/${job.jobId}`, { state: { job } });
      },
    });
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Convertir un estado de cuenta</CardTitle>
          <CardDescription>
            El documento se procesa, se valida contra invariantes financieras y se publica en Excel
            y CSV.
          </CardDescription>
        </CardHeader>
        <div>
          <UploadForm pending={upload.isPending} onSubmit={handleSubmit} />
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

      <div id="documentos-procesados" className="scroll-mt-20">
        <JobHistory />
      </div>
    </div>
  );
}
