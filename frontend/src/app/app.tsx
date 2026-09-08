import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { FileClock, FileSpreadsheet, Home } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, NavLink, Route, Routes } from 'react-router-dom';

import { Alert } from '@/components/ui/alert';
import { cn } from '@/lib/utils';
import { JobPage } from '@/pages/job-page';
import { UploadPage } from '@/pages/upload-page';

import { ApiConfigProvider } from './api-config';
import { createQueryClient } from './query-client';
import { useApiConfig } from './use-api-config';

function Header(): ReactNode {
  const { apiKey } = useApiConfig();

  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-4 sm:px-6">
      <Link to="/" className="flex items-center gap-2 text-base font-semibold text-foreground">
        <FileSpreadsheet aria-hidden className="size-5 text-primary" />
        Conversor de estados de cuenta
      </Link>
      <span
        className={cn(
          'inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium',
          apiKey.length > 0
            ? 'border-success/40 bg-success/10 text-success'
            : 'border-border bg-muted text-muted-foreground',
        )}
      >
        {apiKey.length > 0 ? 'Conectado' : 'Sin credencial'}
      </span>
    </header>
  );
}

const navLinkClass =
  'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground';

function Sidebar(): ReactNode {
  const { apiKey } = useApiConfig();

  return (
    <aside
      aria-label="Navegación principal"
      className="sticky top-14 hidden h-[calc(100vh-3.5rem)] w-56 shrink-0 flex-col gap-1 overflow-y-auto border-r border-border bg-card p-4 md:flex"
    >
      <NavLink
        to="/"
        end
        className={({ isActive }) =>
          cn(navLinkClass, isActive && 'bg-accent text-accent-foreground')
        }
      >
        <Home aria-hidden className="size-4" />
        Nuevo documento
      </NavLink>
      {apiKey.length > 0 ? (
        <Link to={{ pathname: '/', hash: '#documentos-procesados' }} className={navLinkClass}>
          <FileClock aria-hidden className="size-4" />
          Historial
        </Link>
      ) : null}
    </aside>
  );
}

function Footer(): ReactNode {
  return (
    <footer className="border-t border-border bg-card px-4 py-4 text-xs text-muted-foreground sm:px-6">
      Los documentos contienen información financiera. No compartas los archivos generados fuera de
      tu organización.
    </footer>
  );
}

function Layout({ children }: { children: ReactNode }): ReactNode {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <Header />
      <div className="flex flex-1">
        <Sidebar />
        <main className="mx-auto w-full max-w-3xl flex-1 p-6">{children}</main>
      </div>
      <Footer />
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
