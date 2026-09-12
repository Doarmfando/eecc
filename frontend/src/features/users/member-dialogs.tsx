import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Copy } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { Controller, useForm, useWatch, type UseFormRegisterReturn } from 'react-hook-form';

import { useSession } from '@/app/use-session';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  createMember,
  deleteMember,
  setMemberPassword,
  updateMember,
  type Member,
  type MemberChanges,
} from '@/lib/session-client';

import { mensajeDeError } from './error-messages';
import { ChoiceCard, FieldError, PasswordInput, RoleChoice } from './form-fields';
import {
  claveSchema,
  edicionSchema,
  MIN_PASSWORD_LENGTH,
  nuevaCuentaSchema,
  type CambioDeClave,
  type Edicion,
  type NuevaCuenta,
} from './member-schemas';

export const CLAVE_MIEMBROS = ['miembros'] as const;

/** Contraseña recién generada que hay que entregar a su dueño. */
export interface Credencial {
  correo: string;
  clave: string;
}

// Los formularios largos se desplazan dentro del diálogo en pantallas bajas, en vez
// de quedar cortados fuera de la vista.
const contenidoClass = 'max-h-[calc(100dvh-2rem)] max-w-lg overflow-y-auto';

function Encabezado({
  titulo,
  descripcion,
}: {
  titulo: string;
  descripcion: ReactNode;
}): ReactNode {
  return (
    <div className="space-y-1.5 pr-6">
      <DialogTitle>{titulo}</DialogTitle>
      <DialogDescription>{descripcion}</DialogDescription>
    </div>
  );
}

function Acciones({ children }: { children: ReactNode }): ReactNode {
  return (
    <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">{children}</div>
  );
}

/** Elegir entre contraseña generada o escrita; se comparte entre alta y cambio de clave. */
function ModoDeClave({
  modo,
  registroModo,
  registroClave,
  error,
  campoId,
  etiqueta,
}: {
  modo: 'generar' | 'elegir';
  registroModo: UseFormRegisterReturn;
  registroClave: UseFormRegisterReturn;
  error: string | undefined;
  campoId: string;
  etiqueta: string;
}): ReactNode {
  return (
    <fieldset className="space-y-2">
      <legend className="mb-2 text-sm font-medium">Contraseña</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        <ChoiceCard
          title="Generar una temporal"
          description="Se muestra una sola vez para que se la entregues."
          value="generar"
          {...registroModo}
        />
        <ChoiceCard
          title="Escribirla yo"
          description={`Al menos ${String(MIN_PASSWORD_LENGTH)} caracteres.`}
          value="elegir"
          {...registroModo}
        />
      </div>
      {modo === 'elegir' ? (
        <div className="space-y-2 pt-2">
          <Label htmlFor={campoId}>{etiqueta}</Label>
          <PasswordInput id={campoId} aria-invalid={error ? true : undefined} {...registroClave} />
          <FieldError message={error} />
        </div>
      ) : null}
    </fieldset>
  );
}

const NUEVA_CUENTA: NuevaCuenta = {
  displayName: '',
  email: '',
  role: 'MEMBER',
  modoClave: 'generar',
  password: '',
};

export function CrearCuentaDialog({
  open,
  onOpenChange,
  onCreada,
}: {
  open: boolean;
  onOpenChange: (abierto: boolean) => void;
  onCreada: (miembro: Member, claveGenerada: string | null) => void;
}): ReactNode {
  const { baseUrl } = useSession();
  const queryClient = useQueryClient();
  const nombreId = useId();
  const correoId = useId();
  const claveId = useId();

  const form = useForm<NuevaCuenta>({
    resolver: zodResolver(nuevaCuentaSchema),
    defaultValues: NUEVA_CUENTA,
  });
  const errores = form.formState.errors;
  const modo = useWatch({ control: form.control, name: 'modoClave' });

  const alta = useMutation({
    mutationFn: (valores: NuevaCuenta) =>
      createMember(baseUrl, {
        displayName: valores.displayName,
        email: valores.email,
        role: valores.role,
        ...(valores.modoClave === 'elegir' ? { password: valores.password } : {}),
      }),
    onSuccess: (resultado) => {
      void queryClient.invalidateQueries({ queryKey: CLAVE_MIEMBROS });
      form.reset(NUEVA_CUENTA);
      onCreada(resultado.member, resultado.temporaryPassword);
    },
  });

  function cambiarApertura(abierto: boolean): void {
    if (!abierto) {
      form.reset(NUEVA_CUENTA);
      alta.reset();
    }
    onOpenChange(abierto);
  }

  return (
    <Dialog open={open} onOpenChange={cambiarApertura}>
      <DialogContent className={contenidoClass}>
        <Encabezado
          titulo="Nuevo usuario"
          descripcion="La cuenta queda activa al momento. No hay registro abierto: solo entra quien des de alta aquí."
        />

        <form
          className="space-y-5"
          noValidate
          onSubmit={(event) => {
            void form.handleSubmit((valores) => {
              alta.mutate(valores);
            })(event);
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor={nombreId}>Nombre</Label>
              <Input
                id={nombreId}
                autoComplete="off"
                aria-invalid={errores.displayName ? true : undefined}
                {...form.register('displayName')}
              />
              <FieldError message={errores.displayName?.message} />
            </div>
            <div className="space-y-2">
              <Label htmlFor={correoId}>Correo</Label>
              <Input
                id={correoId}
                type="email"
                autoComplete="off"
                aria-invalid={errores.email ? true : undefined}
                {...form.register('email')}
              />
              <FieldError message={errores.email?.message} />
            </div>
          </div>

          <fieldset>
            <legend className="mb-2 text-sm font-medium">Rol</legend>
            <Controller
              control={form.control}
              name="role"
              render={({ field }) => (
                <RoleChoice name={field.name} value={field.value} onChange={field.onChange} />
              )}
            />
          </fieldset>

          <ModoDeClave
            modo={modo}
            registroModo={form.register('modoClave')}
            registroClave={form.register('password')}
            error={errores.password?.message}
            campoId={claveId}
            etiqueta="Contraseña inicial"
          />

          {alta.isError ? (
            <Alert variant="destructive" title="No se pudo crear la cuenta">
              {mensajeDeError(alta.error)}
            </Alert>
          ) : null}

          <Acciones>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                cambiarApertura(false);
              }}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={alta.isPending}>
              {alta.isPending ? 'Creando…' : 'Crear usuario'}
            </Button>
          </Acciones>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Solo lo que cambió: reenviar el rol de un administrador se leería como degradarlo. */
function cambiosDe(miembro: Member, valores: Edicion): MemberChanges {
  const cambios: MemberChanges = {};
  if (valores.displayName !== miembro.displayName) {
    cambios.displayName = valores.displayName;
  }
  if (valores.email.toLowerCase() !== miembro.email) {
    cambios.email = valores.email;
  }
  if (valores.role !== miembro.role) {
    cambios.role = valores.role;
  }
  return cambios;
}

function EditarCuentaContenido({
  miembro,
  esYo,
  onCerrar,
  onGuardada,
}: {
  miembro: Member;
  esYo: boolean;
  onCerrar: () => void;
  onGuardada: (miembro: Member) => void;
}): ReactNode {
  const { baseUrl } = useSession();
  const queryClient = useQueryClient();
  const nombreId = useId();
  const correoId = useId();

  const form = useForm<Edicion>({
    resolver: zodResolver(edicionSchema),
    defaultValues: { displayName: miembro.displayName, email: miembro.email, role: miembro.role },
  });
  const errores = form.formState.errors;

  const edicion = useMutation({
    mutationFn: (cambios: MemberChanges) => updateMember(baseUrl, miembro.userId, cambios),
    onSuccess: (actualizado) => {
      void queryClient.invalidateQueries({ queryKey: CLAVE_MIEMBROS });
      onGuardada(actualizado);
    },
  });

  const rolBloqueado = esYo || miembro.role === 'ADMIN';

  return (
    <DialogContent className={contenidoClass}>
      <Encabezado
        titulo="Editar usuario"
        descripcion={
          <>
            Cambia los datos de <strong className="text-foreground">{miembro.displayName}</strong>.
            Si cambias el correo, avísale: es con lo que entra.
          </>
        }
      />

      <form
        className="space-y-5"
        noValidate
        onSubmit={(event) => {
          void form.handleSubmit((valores) => {
            const cambios = cambiosDe(miembro, valores);
            if (Object.keys(cambios).length === 0) {
              onCerrar();
              return;
            }
            edicion.mutate(cambios);
          })(event);
        }}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={nombreId}>Nombre</Label>
            <Input
              id={nombreId}
              autoComplete="off"
              aria-invalid={errores.displayName ? true : undefined}
              {...form.register('displayName')}
            />
            <FieldError message={errores.displayName?.message} />
          </div>
          <div className="space-y-2">
            <Label htmlFor={correoId}>Correo</Label>
            <Input
              id={correoId}
              type="email"
              autoComplete="off"
              aria-invalid={errores.email ? true : undefined}
              {...form.register('email')}
            />
            <FieldError message={errores.email?.message} />
          </div>
        </div>

        <fieldset>
          <legend className="mb-2 text-sm font-medium">Rol</legend>
          <Controller
            control={form.control}
            name="role"
            render={({ field }) => (
              <RoleChoice
                name={field.name}
                value={field.value}
                onChange={field.onChange}
                disabled={rolBloqueado}
              />
            )}
          />
          {rolBloqueado ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {esYo
                ? 'No puedes cambiar tu propio rol.'
                : 'Un administrador no puede pasar a ser usuario.'}
            </p>
          ) : null}
        </fieldset>

        {edicion.isError ? (
          <Alert variant="destructive" title="No se pudieron guardar los cambios">
            {mensajeDeError(edicion.error)}
          </Alert>
        ) : null}

        <Acciones>
          <Button type="button" variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button type="submit" disabled={edicion.isPending}>
            {edicion.isPending ? 'Guardando…' : 'Guardar cambios'}
          </Button>
        </Acciones>
      </form>
    </DialogContent>
  );
}

export function EditarCuentaDialog({
  miembro,
  esYo,
  onClose,
  onGuardada,
}: {
  miembro: Member | null;
  esYo: boolean;
  onClose: () => void;
  onGuardada: (miembro: Member) => void;
}): ReactNode {
  return (
    <Dialog
      open={miembro !== null}
      onOpenChange={(abierto) => {
        if (!abierto) {
          onClose();
        }
      }}
    >
      {/* La clave reinicia el formulario con los datos de cada persona. */}
      {miembro ? (
        <EditarCuentaContenido
          key={miembro.userId}
          miembro={miembro}
          esYo={esYo}
          onCerrar={onClose}
          onGuardada={onGuardada}
        />
      ) : null}
    </Dialog>
  );
}

function ClaveContenido({
  miembro,
  onCerrar,
  onHecho,
}: {
  miembro: Member;
  onCerrar: () => void;
  onHecho: (miembro: Member, claveGenerada: string | null) => void;
}): ReactNode {
  const { baseUrl } = useSession();
  const queryClient = useQueryClient();
  const claveId = useId();

  const form = useForm<CambioDeClave>({
    resolver: zodResolver(claveSchema),
    defaultValues: { modoClave: 'generar', password: '' },
  });
  const modo = useWatch({ control: form.control, name: 'modoClave' });

  const cambio = useMutation({
    mutationFn: (valores: CambioDeClave) =>
      setMemberPassword(
        baseUrl,
        miembro.userId,
        valores.modoClave === 'elegir' ? valores.password : undefined,
      ),
    onSuccess: (resultado) => {
      void queryClient.invalidateQueries({ queryKey: CLAVE_MIEMBROS });
      onHecho(miembro, resultado.temporaryPassword);
    },
  });

  return (
    <DialogContent className={contenidoClass}>
      <Encabezado
        titulo="Cambiar contraseña"
        descripcion={
          <>
            Nueva contraseña para <strong className="text-foreground">{miembro.displayName}</strong>
            . Se cerrarán sus sesiones abiertas y, si la cuenta estaba bloqueada por intentos
            fallidos, se desbloquea.
          </>
        }
      />

      <form
        className="space-y-5"
        noValidate
        onSubmit={(event) => {
          void form.handleSubmit((valores) => {
            cambio.mutate(valores);
          })(event);
        }}
      >
        <ModoDeClave
          modo={modo}
          registroModo={form.register('modoClave')}
          registroClave={form.register('password')}
          error={form.formState.errors.password?.message}
          campoId={claveId}
          etiqueta="Nueva contraseña"
        />

        {cambio.isError ? (
          <Alert variant="destructive" title="No se pudo cambiar la contraseña">
            {mensajeDeError(cambio.error)}
          </Alert>
        ) : null}

        <Acciones>
          <Button type="button" variant="outline" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button type="submit" disabled={cambio.isPending}>
            {cambio.isPending ? 'Guardando…' : 'Cambiar contraseña'}
          </Button>
        </Acciones>
      </form>
    </DialogContent>
  );
}

export function ClaveDialog({
  miembro,
  onClose,
  onHecho,
}: {
  miembro: Member | null;
  onClose: () => void;
  onHecho: (miembro: Member, claveGenerada: string | null) => void;
}): ReactNode {
  return (
    <Dialog
      open={miembro !== null}
      onOpenChange={(abierto) => {
        if (!abierto) {
          onClose();
        }
      }}
    >
      {miembro ? (
        <ClaveContenido
          key={miembro.userId}
          miembro={miembro}
          onCerrar={onClose}
          onHecho={onHecho}
        />
      ) : null}
    </Dialog>
  );
}

function EliminarContenido({
  miembro,
  onCerrar,
  onEliminada,
}: {
  miembro: Member;
  onCerrar: () => void;
  onEliminada: (miembro: Member) => void;
}): ReactNode {
  const { baseUrl } = useSession();
  const queryClient = useQueryClient();

  const borrado = useMutation({
    mutationFn: () => deleteMember(baseUrl, miembro.userId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CLAVE_MIEMBROS });
      onEliminada(miembro);
    },
  });

  const documentos = miembro.documentCount;

  return (
    <DialogContent className="max-w-md">
      <Encabezado
        titulo="Eliminar usuario"
        descripcion={
          <>
            Se borrará la cuenta de{' '}
            <strong className="text-foreground">{miembro.displayName}</strong> ({miembro.email})
            {documentos > 0
              ? ` y sus ${String(documentos)} ${documentos === 1 ? 'documento procesado' : 'documentos procesados'}, con sus archivos.`
              : '. No tiene documentos cargados.'}
          </>
        }
      />

      <p className="text-sm text-muted-foreground">
        No se puede deshacer. Si solo quieres impedirle el acceso, desactívala: se puede reactivar
        cuando quieras.
      </p>

      {borrado.isError ? (
        <Alert variant="destructive" title="No se pudo eliminar">
          {mensajeDeError(borrado.error)}
        </Alert>
      ) : null}

      <Acciones>
        <Button type="button" variant="outline" onClick={onCerrar}>
          Cancelar
        </Button>
        <Button
          type="button"
          variant="destructive"
          disabled={borrado.isPending}
          onClick={() => {
            borrado.mutate();
          }}
        >
          {borrado.isPending ? 'Eliminando…' : 'Eliminar usuario'}
        </Button>
      </Acciones>
    </DialogContent>
  );
}

export function EliminarDialog({
  miembro,
  onClose,
  onEliminada,
}: {
  miembro: Member | null;
  onClose: () => void;
  onEliminada: (miembro: Member) => void;
}): ReactNode {
  return (
    <Dialog
      open={miembro !== null}
      onOpenChange={(abierto) => {
        if (!abierto) {
          onClose();
        }
      }}
    >
      {miembro ? (
        <EliminarContenido
          key={miembro.userId}
          miembro={miembro}
          onCerrar={onClose}
          onEliminada={onEliminada}
        />
      ) : null}
    </Dialog>
  );
}

/**
 * Muestra una contraseña generada. Es la única vez que existe en claro fuera del
 * servidor: por eso se ofrece copiarla y se deja claro que no volverá a verse.
 */
export function CredencialDialog({
  credencial,
  onClose,
}: {
  credencial: Credencial | null;
  onClose: () => void;
}): ReactNode {
  const [copiada, setCopiada] = useState(false);

  async function copiar(clave: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(clave);
      setCopiada(true);
    } catch {
      // Sin portapapeles disponible la clave sigue a la vista para copiarla a mano.
    }
  }

  return (
    <Dialog
      open={credencial !== null}
      onOpenChange={(abierto) => {
        if (!abierto) {
          setCopiada(false);
          onClose();
        }
      }}
    >
      {credencial ? (
        <DialogContent className="max-w-md">
          <Encabezado
            titulo="Contraseña temporal"
            descripcion={
              <>
                Entrégasela a <strong className="text-foreground">{credencial.correo}</strong>. No
                volverá a mostrarse; si se pierde, genera otra.
              </>
            }
          />

          <div className="flex items-center gap-2 rounded-lg border border-border bg-muted px-3 py-2">
            <code className="flex-1 font-mono text-sm break-all text-foreground">
              {credencial.clave}
            </code>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                void copiar(credencial.clave);
              }}
            >
              {copiada ? <Check aria-hidden /> : <Copy aria-hidden />}
              {copiada ? 'Copiada' : 'Copiar'}
            </Button>
          </div>

          <Acciones>
            <Button
              type="button"
              onClick={() => {
                setCopiada(false);
                onClose();
              }}
            >
              Entendido
            </Button>
          </Acciones>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
