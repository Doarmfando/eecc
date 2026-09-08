import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { useSession } from '@/app/use-session';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api-error';
import {
  createMember,
  fetchMembers,
  resetMemberPassword,
  updateMember,
  type Member,
  type SessionUser,
} from '@/lib/session-client';

const ROLES: { valor: SessionUser['role']; etiqueta: string; descripcion: string }[] = [
  {
    valor: 'OWNER',
    etiqueta: 'Propietario',
    descripcion: 'Control total, incluidos otros propietarios',
  },
  {
    valor: 'ADMIN',
    etiqueta: 'Administrador',
    descripcion: 'Gestiona personas y procesa documentos',
  },
  { valor: 'MEMBER', etiqueta: 'Miembro', descripcion: 'Procesa documentos y ve el historial' },
  { valor: 'VIEWER', etiqueta: 'Lectura', descripcion: 'Solo consulta el historial' },
];

const nuevoMiembroSchema = z.object({
  displayName: z.string().trim().min(2, 'Escribe el nombre completo').max(160),
  email: z.string().trim().min(1, 'Escribe el correo').email('Ese correo no es válido'),
  role: z.enum(['OWNER', 'ADMIN', 'MEMBER', 'VIEWER']),
});

type NuevoMiembro = z.infer<typeof nuevoMiembroSchema>;

const MENSAJES: Record<string, string> = {
  MEMBER_ALREADY_EXISTS: 'Esa persona ya pertenece a la organización.',
  LAST_OWNER: 'No puedes dejar la organización sin ningún propietario activo.',
  INSUFFICIENT_ROLE: 'Tu rol no permite hacer este cambio.',
};

function mensajeDeError(error: unknown): string {
  if (error instanceof ApiError) {
    return MENSAJES[error.code] ?? 'No se pudo completar la operación.';
  }
  return 'No se pudo completar la operación.';
}

function formatearFecha(iso: string | null): string {
  if (!iso) {
    return 'Nunca';
  }
  return new Date(iso).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' });
}

export function MembersPage(): ReactNode {
  const { baseUrl, usuario } = useSession();
  const queryClient = useQueryClient();
  const nombreId = useId();
  const correoId = useId();
  const rolId = useId();
  const [claveTemporal, setClaveTemporal] = useState<{ correo: string; clave: string } | null>(
    null,
  );

  const miembros = useQuery({
    queryKey: ['miembros'],
    queryFn: ({ signal }) => fetchMembers(baseUrl, signal),
  });

  const form = useForm<NuevoMiembro>({
    resolver: zodResolver(nuevoMiembroSchema),
    defaultValues: { displayName: '', email: '', role: 'MEMBER' },
  });

  const invalidar = (): void => {
    void queryClient.invalidateQueries({ queryKey: ['miembros'] });
  };

  const alta = useMutation({
    mutationFn: (valores: NuevoMiembro) => createMember(baseUrl, valores),
    onSuccess: (resultado) => {
      invalidar();
      form.reset({ displayName: '', email: '', role: 'MEMBER' });
      if (resultado.temporaryPassword) {
        setClaveTemporal({ correo: resultado.member.email, clave: resultado.temporaryPassword });
      }
    },
  });

  const cambio = useMutation({
    mutationFn: ({
      userId,
      cambios,
    }: {
      userId: string;
      cambios: { role?: SessionUser['role']; membershipStatus?: 'ACTIVE' | 'REVOKED' };
    }) => updateMember(baseUrl, userId, cambios),
    onSuccess: invalidar,
  });

  const restablecer = useMutation({
    mutationFn: (miembro: Member) =>
      resetMemberPassword(baseUrl, miembro.userId).then((resultado) => ({
        correo: miembro.email,
        clave: resultado.temporaryPassword,
      })),
    onSuccess: (resultado) => {
      invalidar();
      setClaveTemporal(resultado);
    },
  });

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold text-foreground">Personas</h1>
        <p className="text-sm text-muted-foreground">
          Quien pertenece a {usuario?.organizationName ?? 'la organización'} y con qué permisos.
        </p>
      </div>

      {claveTemporal ? (
        <Alert variant="warning" title="Contraseña temporal">
          <p className="mb-2">
            Entrégasela a <strong>{claveTemporal.correo}</strong>. No vuelve a mostrarse y deberá
            cambiarla al entrar.
          </p>
          <code className="block rounded-md border border-border bg-muted px-3 py-2 font-mono text-sm">
            {claveTemporal.clave}
          </code>
          <Button
            variant="outline"
            className="mt-3"
            onClick={() => {
              setClaveTemporal(null);
            }}
          >
            Entendido
          </Button>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Dar de alta</CardTitle>
          <CardDescription>
            Se genera una contraseña temporal que se muestra una sola vez.
          </CardDescription>
        </CardHeader>

        <form
          className="mt-6 grid gap-4 sm:grid-cols-2"
          onSubmit={(event) => {
            void form.handleSubmit((valores) => {
              alta.mutate(valores);
            })(event);
          }}
          noValidate
        >
          <div className="space-y-2">
            <Label htmlFor={nombreId}>Nombre</Label>
            <Input id={nombreId} autoComplete="off" {...form.register('displayName')} />
            {form.formState.errors.displayName ? (
              <p className="text-sm text-destructive">
                {form.formState.errors.displayName.message}
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor={correoId}>Correo</Label>
            <Input id={correoId} type="email" autoComplete="off" {...form.register('email')} />
            {form.formState.errors.email ? (
              <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor={rolId}>Rol</Label>
            <select
              id={rolId}
              className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
              {...form.register('role')}
            >
              {ROLES.map((opcion) => (
                <option key={opcion.valor} value={opcion.valor}>
                  {opcion.etiqueta} — {opcion.descripcion}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <Button type="submit" disabled={alta.isPending}>
              {alta.isPending ? 'Creando...' : 'Crear cuenta'}
            </Button>
          </div>

          {alta.isError ? (
            <div className="sm:col-span-2">
              <Alert variant="destructive" title="No se pudo crear">
                {mensajeDeError(alta.error)}
              </Alert>
            </div>
          ) : null}
        </form>
      </Card>

      {cambio.isError ? (
        <Alert variant="destructive" title="No se pudo aplicar el cambio">
          {mensajeDeError(cambio.error)}
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Cuentas</CardTitle>
        </CardHeader>

        {miembros.isPending ? (
          <p className="mt-4 text-sm text-muted-foreground">Cargando...</p>
        ) : null}
        {miembros.isError ? (
          <Alert variant="destructive" title="No se pudo cargar la lista">
            {mensajeDeError(miembros.error)}
          </Alert>
        ) : null}

        {miembros.data ? (
          // La tabla se desborda en horizontal dentro de su propio contenedor: con
          // seis columnas, estrecharlas las volvería ilegibles.
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[52rem] border-collapse text-sm">
              <thead>
                <tr className="border-b border-border text-left text-muted-foreground">
                  <th className="py-2 pr-4 font-medium">Nombre</th>
                  <th className="py-2 pr-4 font-medium">Correo</th>
                  <th className="py-2 pr-4 font-medium">Rol</th>
                  <th className="py-2 pr-4 font-medium">Estado</th>
                  <th className="py-2 pr-4 font-medium">Último acceso</th>
                  <th className="py-2 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {miembros.data.map((miembro) => {
                  const esYo = miembro.userId === usuario?.userId;
                  const revocado = miembro.membershipStatus === 'REVOKED';
                  return (
                    <tr key={miembro.userId} className="border-b border-border last:border-0">
                      <td className="py-3 pr-4">
                        {miembro.displayName}
                        {esYo ? <span className="text-muted-foreground"> (tú)</span> : null}
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">{miembro.email}</td>
                      <td className="py-3 pr-4">
                        <select
                          aria-label={`Rol de ${miembro.displayName}`}
                          className="h-8 rounded-md border border-border bg-background px-2 text-sm"
                          value={miembro.role}
                          disabled={esYo || revocado || cambio.isPending}
                          onChange={(event) => {
                            cambio.mutate({
                              userId: miembro.userId,
                              cambios: { role: event.target.value as SessionUser['role'] },
                            });
                          }}
                        >
                          {ROLES.map((opcion) => (
                            <option key={opcion.valor} value={opcion.valor}>
                              {opcion.etiqueta}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-3 pr-4">
                        {revocado ? (
                          <span className="text-muted-foreground">Sin acceso</span>
                        ) : (
                          <span className="text-success">Activa</span>
                        )}
                      </td>
                      <td className="py-3 pr-4 text-muted-foreground">
                        {formatearFecha(miembro.lastLoginAt)}
                      </td>
                      <td className="py-3">
                        <div className="flex flex-wrap gap-2">
                          <Button
                            variant="outline"
                            disabled={esYo || cambio.isPending}
                            onClick={() => {
                              cambio.mutate({
                                userId: miembro.userId,
                                cambios: { membershipStatus: revocado ? 'ACTIVE' : 'REVOKED' },
                              });
                            }}
                          >
                            {revocado ? 'Reactivar' : 'Quitar acceso'}
                          </Button>
                          <Button
                            variant="outline"
                            disabled={restablecer.isPending}
                            onClick={() => {
                              restablecer.mutate(miembro);
                            }}
                          >
                            Restablecer contraseña
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
