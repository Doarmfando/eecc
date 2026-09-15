import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { CalendarDays, ChartColumn, FileClock, Home, Users, type LucideIcon } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';

import excelIcon from '@/assets/files/excel.svg';
import pdfIcon from '@/assets/files/pdf.svg';
import logo from '@/assets/logo.svg';
import { Alert } from '@/components/ui/alert';
import { AccountMenu } from '@/features/auth/account-menu';
import { cn } from '@/lib/utils';
import { FinancialCalendarPage } from '@/pages/financial-calendar-page';
import { FinancialCenterPage } from '@/pages/financial-center-page';
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
  'relative flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-all duration-200 ease-in-out will-change-transform hover:bg-accent hover:text-foreground';

/** Barrita vertical antes que el borde: no reserva espacio en el estado inactivo. */
const navLinkActiveClass =
  'bg-primary/8 text-primary before:absolute before:top-1/2 before:left-0 before:h-5 before:w-1 before:-translate-y-1/2 before:rounded-r-full before:bg-primary hover:bg-primary/8 hover:text-primary';

/** Solo el ítem inactivo se desliza al pasar el cursor; el activo ya destaca con su barrita. */
const navLinkHoverShiftClass = 'hover:translate-x-1';

const seccionClass =
  'px-3 pb-2 text-[11px] font-semibold tracking-wide text-muted-foreground/70 uppercase';

interface Enlace {
  to: string;
  etiqueta: string;
  Icono: LucideIcon;
  end?: boolean;
}

const ENLACES: Enlace[] = [
  { to: '/', etiqueta: 'Nuevo documento', Icono: Home, end: true },
  { to: '/historial', etiqueta: 'Historial', Icono: FileClock },
  { to: '/centro-financiero', etiqueta: 'Centro Financiero', Icono: ChartColumn },
  { to: '/calendario-financiero', etiqueta: 'Calendario', Icono: CalendarDays },
];

const ENLACES_ADMINISTRACION: Enlace[] = [{ to: '/usuarios', etiqueta: 'Usuarios', Icono: Users }];

/**
 * Ilustración conceptual del pie del sidebar: un PDF se desvanece hacia abajo
 * mientras un Excel aparece desde arriba, en loop. Puramente decorativa —sin
 * datos, sin red— y directamente sobre el fondo del sidebar, sin tarjeta.
 */
function SidebarConversionArt(): ReactNode {
  return (
    <div className="mt-auto border-t border-border/60 px-2 pt-6 pb-2">
      <div className="relative mx-auto flex h-16 w-16 items-center justify-center">
        {/* Rayado de hoja de cálculo, apenas insinuado: sin caja, sin borde. */}
        <div
          aria-hidden
          className="absolute inset-x-1 top-1/2 flex -translate-y-1/2 flex-col gap-2"
        >
          <span className="h-px w-full bg-border/70" />
          <span className="h-px w-full bg-border/70" />
          <span className="h-px w-full bg-border/70" />
        </div>

        {/* Barrido del escáner, sincronizado con la fase "PDF" del ciclo. */}
        <span
          aria-hidden
          className="absolute inset-x-1 h-px animate-doc-scan bg-primary shadow-[0_0_6px_1px_var(--color-primary)] will-change-transform motion-reduce:hidden"
        />

        <img
          src={pdfIcon}
          alt=""
          aria-hidden
          className="absolute size-8 animate-doc-pdf opacity-100 will-change-transform motion-reduce:animate-none"
        />
        <img
          src={excelIcon}
          alt=""
          aria-hidden
          className="absolute size-8 animate-doc-excel opacity-0 will-change-transform motion-reduce:hidden"
        />
      </div>
    </div>
  );
}

function Sidebar(): ReactNode {
  const { puedeAdministrar } = useSession();

  return (
    <aside
      aria-label="Navegación principal"
      className="hidden w-60 shrink-0 flex-col gap-6 overflow-y-auto border-r border-border/70 p-4 md:flex"
    >
      <div>
        <p className={seccionClass}>Menú</p>
        <nav className="flex flex-col gap-1">
          {ENLACES.map(({ to, etiqueta, Icono, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(navLinkClass, isActive ? navLinkActiveClass : navLinkHoverShiftClass)
              }
            >
              <Icono aria-hidden className="size-4" />
              {etiqueta}
            </NavLink>
          ))}
        </nav>
      </div>
      {/* Solo se ofrece a quien puede usarla: un enlace que lleva a un aviso de
          permisos no informa, entorpece. */}
      {puedeAdministrar ? (
        <div>
          <p className={seccionClass}>Administración</p>
          <nav aria-label="Administración" className="flex flex-col gap-1">
            {ENLACES_ADMINISTRACION.map(({ to, etiqueta, Icono }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(navLinkClass, isActive ? navLinkActiveClass : navLinkHoverShiftClass)
                }
              >
                <Icono aria-hidden className="size-4" />
                {etiqueta}
              </NavLink>
            ))}
          </nav>
        </div>
      ) : null}

      <SidebarConversionArt />
    </aside>
  );
}

/** En pantallas estrechas la barra lateral no cabe; sin esto no habría forma de navegar. */
function NavegacionMovil(): ReactNode {
  const { puedeAdministrar } = useSession();
  const enlaces = puedeAdministrar ? [...ENLACES, ...ENLACES_ADMINISTRACION] : ENLACES;

  return (
    <nav
      aria-label="Navegación"
      className="flex gap-1 overflow-x-auto border-b border-border/70 px-3 py-2 md:hidden"
    >
      {enlaces.map(({ to, etiqueta, Icono, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          aria-label={etiqueta}
          title={etiqueta}
          className={({ isActive }) =>
            cn(
              'flex shrink-0 items-center justify-center gap-2 rounded-lg px-3.5 py-2.5 text-sm font-medium text-muted-foreground',
              isActive ? 'bg-primary/8 text-primary' : 'hover:bg-accent hover:text-foreground',
            )
          }
        >
          <Icono aria-hidden className="size-5 shrink-0 sm:size-4" />
          {/* Solo el ícono en el celular más angosto: con cinco enlaces, el texto ya no cabe
              sin forzar scroll horizontal. Desde `sm` hay sitio de sobra para el rótulo. */}
          <span className="hidden sm:inline">{etiqueta}</span>
        </NavLink>
      ))}
    </nav>
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
    <div className="flex h-screen flex-col overflow-hidden bg-slate-900">
      <Header />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-2 pb-2">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[18px] bg-card shadow-sm md:flex-row">
          <Sidebar />
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <NavegacionMovil />
            <main className="w-full flex-1 overflow-y-auto p-6 sm:p-8 lg:p-10">{children}</main>
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
        Solo un administrador puede gestionar usuarios.
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
        path="/centro-financiero"
        element={
          <Protegida>
            <FinancialCenterPage />
          </Protegida>
        }
      />
      <Route
        path="/calendario-financiero"
        element={
          <Protegida>
            <FinancialCalendarPage />
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
        path="/usuarios"
        element={
          <Protegida soloAdmin>
            <MembersPage />
          </Protegida>
        }
      />
      {/* La sección se llamó «Personas»: un marcador guardado no debe acabar en 404. */}
      <Route path="/personas" element={<Navigate to="/usuarios" replace />} />
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
