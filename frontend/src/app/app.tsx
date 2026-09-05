import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { FileSpreadsheet } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, Route, Routes } from 'react-router-dom';

import { Alert } from '@/components/ui/alert';
import { JobPage } from '@/pages/job-page';
import { UploadPage } from '@/pages/upload-page';

import { ApiConfigProvider } from './api-config';
import { createQueryClient } from './query-client';

function Layout({ children }: { children: ReactNode }): ReactNode {
  return (
    <div className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 p-6">
      <header className="flex items-center gap-3">
        <FileSpreadsheet aria-hidden className="size-6 text-brand-600" />
        <Link to="/" className="text-lg font-semibold text-slate-900">
          Conversor de estados de cuenta
        </Link>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="text-xs text-slate-500">
        Los documentos contienen información financiera. No compartas los archivos generados fuera
        de tu organización.
      </footer>
    </div>
  );
}

function NotFoundPage(): ReactNode {
  return (
    <Alert variant="warning" title="Esa página no existe">
      <Link to="/" className="underline">
        Volver al inicio
      </Link>
    </Alert>
  );
}

export function App({ queryClient }: { queryClient?: QueryClient }): ReactNode {
  const [client] = useState(() => queryClient ?? createQueryClient());

  return (
    <QueryClientProvider client={client}>
      <ApiConfigProvider>
        <Layout>
          <Routes>
            <Route path="/" element={<UploadPage />} />
            <Route path="/jobs/:jobId" element={<JobPage />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Layout>
      </ApiConfigProvider>
    </QueryClientProvider>
  );
}
