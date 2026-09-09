import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { FileClock, Home, Users } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';

import logo from '@/assets/logo.svg';
import { Alert } from '@/components/ui/alert';
import { AccountMenu } from '@/features/auth/account-menu';
import { cn } from '@/lib/utils';
import { HistoryPage } from '@/pages/history-page';
import { JobPage } from '@/pages/job-page';
import { LoginPage } from '@/pages/login-page';
import { MembersPage } from '@/pages/members-page';
import { UploadPage } from '@/pages/upload-page';

import { createQueryClient } from './query-client';
import { SessionProvider } from './session-provider';
import { useSession } from './use-session';

function Header(): ReactNode {
  return (
    <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center justify-between bg-slate-900 px-4 sm:px-6">
      <Link to="/" className="flex items-center gap-2 text-base font-semibold text-white">
        <img src={logo} alt="" aria-hidden className="h-7 w-auto" />
        Conversor de estados de cuenta
      </Link>
      <AccountMenu />
    </header>
  );
}

const navLinkClass =
  'flex items-center gap-3 rounded-lg border-l-2 border-transparent px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground';

const navLinkActiveClass =
  'border-primary bg-primary/8 text-primary hover:bg-primary/8 hover:text-primary';

function Sidebar(): ReactNode {
  const { puedeAdministrar } = useSession();

  return (
    <aside
      aria-label="Navegación principal"
      className="hidden w-60 shrink-0 flex-col border-r border-border/70 p-4 md:flex"
    >
      <p className="px-3 pb-2 text-[11px] font-semibold tracking-wide text-muted-foreground/70 uppercase">
        Menú
      </p>
      <nav className="flex flex-col gap-1">
        <NavLink
          to="/"
          end
          className={({ isActive }) => cn(navLinkClass, isActive && navLinkActiveClass)}
        >
          <Home aria-hidden className="size-4" />
          Nuevo documento
        </NavLink>
        <NavLink
          to="/historial"
          className={({ isActive }) => cn(navLinkClass, isActive && navLinkActiveClass)}
        >
          <FileClock aria-hidden className="size-4" />
          Historial
        </NavLink>
        {/* Solo se ofrece a quien puede usarla: un enlace que lleva a un aviso de
            permisos no informa, entorpece. */}
        {puedeAdministrar ? (
          <NavLink
            to="/personas"
            className={({ isActive }) => cn(navLinkClass, isActive && navLinkActiveClass)}
          >
            <Users aria-hidden className="size-4" />
            Personas
          </NavLink>
        ) : null}
      </nav>
    </aside>
  );
}

function Footer(): ReactNode {
  return (
    <footer className="border-t border-border px-4 py-4 text-xs text-muted-foreground sm:px-6">
      Los documentos contienen información financiera. No compartas los archivos generados fuera de
      tu organización.
    </footer>
  );
}

function Layout({ children }: { children: ReactNode }): ReactNode {
  return (
    <div className="flex min-h-screen flex-col bg-slate-900">
      <Header />
      <div className="flex flex-1 flex-col px-2 pb-2">
        <div className="flex flex-1 flex-col overflow-hidden rounded-[18px] bg-card shadow-sm md:flex-row">
          <Sidebar />
          <div className="flex flex-1 flex-col">
            <main className="w-full flex-1 p-6 sm:p-8 lg:p-10">{children}</main>
            <Footer />
          </div>
        </div>
      </div>
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
    <div className="mx-auto w-full max-w-3xl">
      <Alert variant="warning" title="Esa página no existe">
        <Link to="/" className="underline">
          Volver al inicio
        </Link>
      </Alert>
    </div>
  );
}

/** Cada ruta con sesión comparte armazón; solo cambia lo de dentro. */
function Protegida({
  children,
  soloAdmin,
}: {
  children: ReactNode;
  soloAdmin?: boolean;
}): ReactNode {
  return (
    <Layout>
      <RutaProtegida soloAdmin={soloAdmin}>{children}</RutaProtegida>
    </Layout>
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
          <Protegida>
            <UploadPage />
          </Protegida>
        }
      />
      <Route
        path="/historial"
        element={
          <Protegida>
            <HistoryPage />
          </Protegida>
        }
      />
      <Route
        path="/jobs/:jobId"
        element={
          <Protegida>
            <JobPage />
          </Protegida>
        }
      />
      <Route
        path="/personas"
        element={
          <Protegida soloAdmin>
            <MembersPage />
          </Protegida>
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
