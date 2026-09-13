import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  FileText,
  KeyRound,
  Pencil,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  UserX,
  type LucideIcon,
} from 'lucide-react';
import { useId, useMemo, useState, type ReactNode } from 'react';

import { useSession } from '@/app/use-session';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { mensajeDeError } from '@/features/users/error-messages';
import {
  CLAVE_MIEMBROS,
  ClaveDialog,
  CredencialDialog,
  CrearCuentaDialog,
  EditarCuentaDialog,
  EliminarDialog,
  type Credencial,
} from '@/features/users/member-dialogs';
import { ETIQUETA_ROL } from '@/features/users/roles';
import { fetchMembers, updateMember, type Member } from '@/lib/session-client';
import { cn } from '@/lib/utils';

type Filtro = 'todos' | 'admins' | 'usuarios' | 'desactivados';

const FILTROS: { valor: Filtro; etiqueta: string }[] = [
  { valor: 'todos', etiqueta: 'Todos' },
  { valor: 'admins', etiqueta: 'Administradores' },
  { valor: 'usuarios', etiqueta: 'Usuarios' },
  { valor: 'desactivados', etiqueta: 'Desactivados' },
];

function cumpleFiltro(miembro: Member, filtro: Filtro): boolean {
  switch (filtro) {
    case 'admins':
      return miembro.role === 'ADMIN';
    case 'usuarios':
      return miembro.role === 'MEMBER';
    case 'desactivados':
      return miembro.membershipStatus === 'REVOKED';
    case 'todos':
      return true;
  }
}

function formatearFecha(iso: string | null): string {
  if (!iso) {
    return 'Nunca';
  }
  return new Date(iso).toLocaleString('es-PE', { dateStyle: 'medium', timeStyle: 'short' });
}

function contar(cantidad: number, singular: string, plural: string): string {
  return `${String(cantidad)} ${cantidad === 1 ? singular : plural}`;
}

function iniciales(nombre: string): string {
  const partes = nombre.trim().split(/\s+/);
  const primera = partes[0]?.[0] ?? '';
  const ultima = partes.length > 1 ? (partes[partes.length - 1]?.[0] ?? '') : '';
  return (primera + ultima).toUpperCase() || '?';
}

function Indicador({
  Icono,
  etiqueta,
  valor,
  detalle,
}: {
  Icono: LucideIcon;
  etiqueta: string;
  valor: number;
  detalle: string;
}): ReactNode {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border/70 bg-card px-3 py-3 sm:px-4 sm:py-3.5">
      <span className="hidden size-9 shrink-0 items-center justify-center rounded-lg bg-primary/8 text-primary sm:flex">
        <Icono aria-hidden className="size-4" />
      </span>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{etiqueta}</p>
        <p className="text-lg leading-tight font-semibold text-foreground">
          {valor.toLocaleString('es-PE')}
        </p>
        <p className="truncate text-xs text-muted-foreground">{detalle}</p>
      </div>
    </div>
  );
}

function InsigniaRol({ miembro }: { miembro: Member }): ReactNode {
  const admin = miembro.role === 'ADMIN';
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
        admin ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground',
      )}
    >
      {admin ? <ShieldCheck aria-hidden className="size-3.5" /> : null}
      {ETIQUETA_ROL[miembro.role]}
    </span>
  );
}

function InsigniaEstado({ activa }: { activa: boolean }): ReactNode {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium',
        activa ? 'bg-success/12 text-success' : 'bg-muted text-muted-foreground',
      )}
    >
      <span
        aria-hidden
        className={cn('size-1.5 rounded-full', activa ? 'bg-success' : 'bg-slate-400')}
      />
      {activa ? 'Activa' : 'Desactivada'}
    </span>
  );
}

/** Documentos que conserva frente al cupo: la barra deja ver quién está al límite. */
function Documentos({ cantidad, limite }: { cantidad: number; limite: number }): ReactNode {
  const proporcion = limite > 0 ? Math.min(cantidad / limite, 1) : 0;
  return (
    <div className="flex min-w-24 flex-col gap-1">
      <span className="text-sm text-foreground">
        {cantidad} <span className="text-muted-foreground">de {limite}</span>
      </span>
      <span aria-hidden className="h-1 w-full overflow-hidden rounded-full bg-muted">
        <span
          className={cn(
            'block h-full rounded-full',
            proporcion >= 1 ? 'bg-warning' : 'bg-primary/60',
          )}
          style={{ width: `${String(proporcion * 100)}%` }}
        />
      </span>
    </div>
  );
}

function BotonAccion({
  etiqueta,
  Icono,
  onClick,
  disabled,
  peligro,
}: {
  etiqueta: string;
  Icono: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  peligro?: boolean;
}): ReactNode {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      aria-label={etiqueta}
      title={etiqueta}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        'size-8 px-0 text-muted-foreground',
        peligro && 'hover:bg-destructive/10 hover:text-destructive',
      )}
    >
      <Icono aria-hidden className="size-4" />
    </Button>
  );
}

type Dialogo =
  | { tipo: 'crear' }
  | { tipo: 'editar'; miembro: Member }
  | { tipo: 'clave'; miembro: Member }
  | { tipo: 'eliminar'; miembro: Member };

/**
 * Gestión de cuentas. Solo la ve un administrador (la ruta lo exige), y el
 * servidor vuelve a comprobarlo en cada petición: esconder un botón no es una
 * medida de seguridad, solo evita ofrecer lo que se va a rechazar.
 */
export function MembersPage(): ReactNode {
  const { baseUrl, usuario } = useSession();
  const queryClient = useQueryClient();
  const busquedaId = useId();
  const [busqueda, setBusqueda] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [dialogo, setDialogo] = useState<Dialogo | null>(null);
  const [credencial, setCredencial] = useState<Credencial | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const limite = usuario?.retainedStatementsPerUser ?? 3;

  const miembros = useQuery({
    queryKey: CLAVE_MIEMBROS,
    queryFn: ({ signal }) => fetchMembers(baseUrl, signal),
  });

  const acceso = useMutation({
    mutationFn: (miembro: Member) =>
      updateMember(baseUrl, miembro.userId, {
        membershipStatus: miembro.membershipStatus === 'REVOKED' ? 'ACTIVE' : 'REVOKED',
      }),
    onMutate: () => {
      setAviso(null);
    },
    onSuccess: (actualizado) => {
      void queryClient.invalidateQueries({ queryKey: CLAVE_MIEMBROS });
      setAviso(
        actualizado.membershipStatus === 'REVOKED'
          ? `${actualizado.displayName} ya no puede entrar. Sus sesiones abiertas se cerraron.`
          : `${actualizado.displayName} puede volver a entrar.`,
      );
    },
  });

  const lista = useMemo(() => miembros.data ?? [], [miembros.data]);

  const visibles = useMemo(() => {
    const texto = busqueda.trim().toLowerCase();
    return lista.filter(
      (miembro) =>
        cumpleFiltro(miembro, filtro) &&
        (texto === '' ||
          miembro.displayName.toLowerCase().includes(texto) ||
          miembro.email.includes(texto)),
    );
  }, [lista, busqueda, filtro]);

  const administradores = lista.filter((miembro) => miembro.role === 'ADMIN').length;
  const activas = lista.filter((miembro) => miembro.membershipStatus === 'ACTIVE').length;
  const documentos = lista.reduce((total, miembro) => total + miembro.documentCount, 0);

  function abrir(nuevo: Dialogo): void {
    setAviso(null);
    acceso.reset();
    setDialogo(nuevo);
  }

  function cerrarDialogo(): void {
    setDialogo(null);
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Usuarios</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Crea las cuentas de {usuario?.organizationName ?? 'la organización'} y decide quién
            puede entrar.
          </p>
        </div>
        <Button
          onClick={() => {
            abrir({ tipo: 'crear' });
          }}
        >
          <UserPlus aria-hidden />
          Nuevo usuario
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Indicador
          Icono={Users}
          etiqueta="Cuentas"
          valor={lista.length}
          detalle={contar(lista.length - administradores, 'usuario', 'usuarios')}
        />
        <Indicador
          Icono={ShieldCheck}
          etiqueta="Administradores"
          valor={administradores}
          detalle="No se pueden eliminar"
        />
        <Indicador
          Icono={UserCheck}
          etiqueta="Activas"
          valor={activas}
          detalle={contar(lista.length - activas, 'desactivada', 'desactivadas')}
        />
        <Indicador
          Icono={FileText}
          etiqueta="Documentos cargados"
          valor={documentos}
          detalle={`Hasta ${String(limite)} por persona`}
        />
      </div>

      {aviso ? <Alert title={aviso} /> : null}
      {acceso.isError ? (
        <Alert variant="destructive" title="No se pudo cambiar el acceso">
          {mensajeDeError(acceso.error)}
        </Alert>
      ) : null}

      <Card className="gap-0 p-0 sm:p-0">
        <div className="flex flex-col gap-3 border-b border-border/70 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div className="relative w-full sm:max-w-xs">
            <label htmlFor={busquedaId} className="sr-only">
              Buscar por nombre o correo
            </label>
            <Search
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              id={busquedaId}
              type="search"
              placeholder="Buscar por nombre o correo"
              className="pl-9"
              value={busqueda}
              onChange={(event) => {
                setBusqueda(event.target.value);
              }}
            />
          </div>
          <div
            role="group"
            aria-label="Filtrar cuentas"
            className="inline-flex flex-wrap gap-1 rounded-lg bg-muted p-1"
          >
            {FILTROS.map((opcion) => (
              <button
                key={opcion.valor}
                type="button"
                aria-pressed={filtro === opcion.valor}
                onClick={() => {
                  setFiltro(opcion.valor);
                }}
                className={cn(
                  'cursor-pointer rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                  filtro === opcion.valor
                    ? 'bg-card text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {opcion.etiqueta}
              </button>
            ))}
          </div>
        </div>

        {miembros.isPending ? (
          <p className="p-6 text-sm text-muted-foreground">Cargando cuentas…</p>
        ) : null}
        {miembros.isError ? (
          <div className="p-5">
            <Alert variant="destructive" title="No se pudo cargar la lista">
              {mensajeDeError(miembros.error)}
            </Alert>
          </div>
        ) : null}

        {miembros.data ? (
          visibles.length === 0 ? (
            <p className="p-6 text-sm text-muted-foreground">
              {lista.length === 0
                ? 'Todavía no hay cuentas.'
                : 'Ninguna cuenta coincide con la búsqueda.'}
            </p>
          ) : (
            // La tabla se desborda en horizontal dentro de su contenedor: con seis
            // columnas, estrecharlas las volvería ilegibles.
            <div className="overflow-x-auto">
              <table className="w-full min-w-[56rem] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-border/70 text-left text-xs text-muted-foreground">
                    <th className="px-5 py-3 font-medium">Usuario</th>
                    <th className="px-3 py-3 font-medium">Rol</th>
                    <th className="px-3 py-3 font-medium">Estado</th>
                    <th className="px-3 py-3 font-medium">Documentos</th>
                    <th className="px-3 py-3 font-medium">Último acceso</th>
                    <th className="px-5 py-3 text-right font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((miembro) => {
                    const esYo = miembro.userId === usuario?.userId;
                    const activa = miembro.membershipStatus === 'ACTIVE';
                    const esAdmin = miembro.role === 'ADMIN';
                    const nombre = miembro.displayName;
                    return (
                      <tr
                        key={miembro.userId}
                        className={cn(
                          'border-b border-border/60 transition-colors last:border-0 hover:bg-accent/40',
                          !activa && 'text-muted-foreground',
                        )}
                      >
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <span
                              aria-hidden
                              className={cn(
                                'flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                                esAdmin
                                  ? 'bg-primary text-primary-foreground'
                                  : 'bg-primary/10 text-primary',
                                !activa && 'opacity-50',
                              )}
                            >
                              {iniciales(nombre)}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate font-medium text-foreground">
                                {nombre}
                                {esYo ? (
                                  <span className="font-normal text-muted-foreground"> (tú)</span>
                                ) : null}
                              </p>
                              <p className="truncate text-xs text-muted-foreground">
                                {miembro.email}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <InsigniaRol miembro={miembro} />
                        </td>
                        <td className="px-3 py-3">
                          <InsigniaEstado activa={activa} />
                        </td>
                        <td className="px-3 py-3">
                          <Documentos cantidad={miembro.documentCount} limite={limite} />
                        </td>
                        <td className="px-3 py-3 whitespace-nowrap text-muted-foreground">
                          {formatearFecha(miembro.lastLoginAt)}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex justify-end gap-0.5">
                            <BotonAccion
                              etiqueta={`Editar a ${nombre}`}
                              Icono={Pencil}
                              onClick={() => {
                                abrir({ tipo: 'editar', miembro });
                              }}
                            />
                            {/* La propia contraseña se cambia desde la cuenta, que pide la actual. */}
                            <BotonAccion
                              etiqueta={`Cambiar la contraseña de ${nombre}`}
                              Icono={KeyRound}
                              disabled={esYo}
                              onClick={() => {
                                abrir({ tipo: 'clave', miembro });
                              }}
                            />
                            <BotonAccion
                              etiqueta={activa ? `Desactivar a ${nombre}` : `Activar a ${nombre}`}
                              Icono={activa ? UserX : UserCheck}
                              disabled={esYo || acceso.isPending}
                              onClick={() => {
                                setAviso(null);
                                acceso.mutate(miembro);
                              }}
                            />
                            <BotonAccion
                              etiqueta={
                                esAdmin
                                  ? `${nombre} es administrador y no se puede eliminar`
                                  : `Eliminar a ${nombre}`
                              }
                              Icono={Trash2}
                              peligro
                              disabled={esAdmin}
                              onClick={() => {
                                abrir({ tipo: 'eliminar', miembro });
                              }}
                            />
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : null}
      </Card>

      <p className="text-xs text-muted-foreground">
        Los administradores no se pueden eliminar ni pasar a usuario; sí desactivar. Eliminar un
        usuario borra también sus documentos y archivos.
      </p>

      <CrearCuentaDialog
        open={dialogo?.tipo === 'crear'}
        onOpenChange={(abierto) => {
          if (!abierto) {
            cerrarDialogo();
          }
        }}
        onCreada={(miembro, clave) => {
          cerrarDialogo();
          if (clave) {
            setCredencial({ correo: miembro.email, clave });
          } else {
            setAviso(`Cuenta creada para ${miembro.email}.`);
          }
        }}
      />
      <EditarCuentaDialog
        miembro={dialogo?.tipo === 'editar' ? dialogo.miembro : null}
        esYo={dialogo?.tipo === 'editar' && dialogo.miembro.userId === usuario?.userId}
        onClose={cerrarDialogo}
        onGuardada={(miembro) => {
          cerrarDialogo();
          setAviso(`Cambios guardados para ${miembro.displayName}.`);
        }}
      />
      <ClaveDialog
        miembro={dialogo?.tipo === 'clave' ? dialogo.miembro : null}
        onClose={cerrarDialogo}
        onHecho={(miembro, clave) => {
          cerrarDialogo();
          if (clave) {
            setCredencial({ correo: miembro.email, clave });
          } else {
            setAviso(`Contraseña cambiada para ${miembro.displayName}. Sus sesiones se cerraron.`);
          }
        }}
      />
      <EliminarDialog
        miembro={dialogo?.tipo === 'eliminar' ? dialogo.miembro : null}
        onClose={cerrarDialogo}
        onEliminada={(miembro) => {
          cerrarDialogo();
          setAviso(`${miembro.displayName} fue eliminado junto con sus documentos.`);
        }}
      />
      <CredencialDialog
        credencial={credencial}
        onClose={() => {
          setCredencial(null);
        }}
      />
    </div>
  );
}
