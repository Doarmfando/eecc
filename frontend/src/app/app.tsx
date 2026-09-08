import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { FileClock, FileSpreadsheet, Home, LogOut, Users } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { JobPage } from '@/pages/job-page';
import { LoginPage } from '@/pages/login-page';
import { MembersPage } from '@/pages/members-page';
import { UploadPage } from '@/pages/upload-page';

import { createQueryClient } from './query-client';
import { SessionProvider } from './session-provider';
import { useSession } from './use-session';

const ETIQUETAS_DE_ROL: Record<string, string> = {
  OWNER: 'Propietario',
  ADMIN: 'Administrador',
  MEMBER: 'Miembro',
  VIEWER: 'Lectura',
};

function Header(): ReactNode {
  const { usuario, cerrar } = useSession();

  return (
    <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center justify-between border-b border-border bg-card px-4 sm:px-6">
      <Link to="/" className="flex items-center gap-2 text-base font-semibold text-foreground">
        <FileSpreadsheet aria-hidden className="size-5 text-primary" />
        Conversor de estados de cuenta
      </Link>

      {usuario ? (
        <div className="flex items-center gap-4">
          <div className="hidden text-right text-xs leading-tight sm:block">
            <div className="font-medium text-foreground">{usuario.displayName}</div>
            <div className="text-muted-foreground">
              {usuario.organizationName} · {ETIQUETAS_DE_ROL[usuario.role] ?? usuario.role}
            </div>
          </div>
          <Button
            variant="outline"
            onClick={() => {
              void cerrar();
            }}
          >
            <LogOut aria-hidden className="size-4" />
            Salir
          </Button>
        </div>
      ) : null}
    </header>
  );
}

const navLinkClass =
  'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground';

function Sidebar(): ReactNode {
  const { puedeAdministrar } = useSession();

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
      <Link to={{ pathname: '/', hash: '#documentos-procesados' }} className={navLinkClass}>
        <FileClock aria-hidden className="size-4" />
        Historial
      </Link>
      {puedeAdministrar ? (
        <NavLink
          to="/personas"
          className={({ isActive }) =>
            cn(navLinkClass, isActive && 'bg-accent text-accent-foreground')
          }
        >
          <Users aria-hidden className="size-4" />
          Personas
        </NavLink>
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
        <main className="mx-auto w-full max-w-5xl flex-1 p-6">{children}</main>
      </div>
      <Footer />
    </div>
  );
}

/**
 * Puerta de las rutas con sesión.
 *
 * Mientras el estado es `cargando` no se decide nada: redirigir en ese momento
 * expulsaría al login a quien sí tiene sesión cada vez que recarga la página,
 * porque la cookie es httpOnly y solo el servidor puede confirmarla.
 */
function RutaProtegida({
  children,
  soloAdmin,
}: {
  children: ReactNode;
  soloAdmin?: boolean;
}): ReactNode {
  const { estado, puedeAdministrar } = useSession();
  const location = useLocation();

  if (estado === 'cargando') {
    return <p className="text-sm text-muted-foreground">Comprobando la sesión...</p>;
  }
  if (estado === 'anonimo') {
    // Se recuerda a dónde iba para volver ahí después de entrar.
    return <Navigate to="/entrar" replace state={{ desde: location.pathname }} />;
  }
  if (soloAdmin && !puedeAdministrar) {
    return (
      <Alert variant="warning" title="No tienes permisos para esta sección">
        Solo quien administra la organización puede gestionar personas.
      </Alert>
    );
  }
  return children;
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

/** El login queda fuera del armazón: sin sesión no hay navegación que mostrar. */
function Contenido(): ReactNode {
  return (
    <Routes>
      <Route path="/entrar" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <Layout>
            <RutaProtegida>
              <UploadPage />
            </RutaProtegida>
          </Layout>
        }
      />
      <Route
        path="/jobs/:jobId"
        element={
          <Layout>
            <RutaProtegida>
              <JobPage />
            </RutaProtegida>
          </Layout>
        }
      />
      <Route
        path="/personas"
        element={
          <Layout>
            <RutaProtegida soloAdmin>
              <MembersPage />
            </RutaProtegida>
          </Layout>
        }
      />
      <Route
        path="*"
        element={
          <Layout>
            <NotFoundPage />
          </Layout>
        }
      />
    </Routes>
  );
}

export function App({ queryClient }: { queryClient?: QueryClient }): ReactNode {
  const [client] = useState(() => queryClient ?? createQueryClient());

  return (
    <QueryClientProvider client={client}>
      <SessionProvider>
        <Contenido />
      </SessionProvider>
    </QueryClientProvider>
  );
}
