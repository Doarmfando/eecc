import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Check, Copy } from 'lucide-react';
import { useId, useMemo, useState, type ReactNode } from 'react';
import { Controller, useForm, useWatch, type UseFormRegisterReturn } from 'react-hook-form';

import { useSession } from '@/app/use-session';
import { SupportDetails } from '@/components/shared/support-details';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePlans, useRoles } from '@/features/access/queries';
import { diasHasta, hoyLocal, sumarMeses } from '@/lib/plan-dates';
import {
  createMember,
  deleteMember,
  setMemberPassword,
  updateMember,
  type Member,
  type MemberChanges,
  type PlanOption,
  type RoleOption,
} from '@/lib/session-client';

import { mensajeDeError } from './error-messages';
import {
  ChoiceCard,
  FieldError,
  PasswordInput,
  PlanChoice,
  RoleChoice,
  VigenciaField,
} from './form-fields';
import { accionesSobre, nombreDeRol } from './roles';
import {
  claveSchema,
  describirDominios,
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

// Referencia estable: una lista nueva en cada render rehace el esquema sin motivo.
const SIN_DOMINIOS: readonly string[] = [];

/** Qué correos admite la organización, visible antes de equivocarse. */
function DominiosAdmitidos({ dominios }: { dominios: readonly string[] }): ReactNode {
  if (dominios.length === 0) {
    return null;
  }
  return <p className="text-xs text-muted-foreground">Admitidos: {describirDominios(dominios)}</p>;
}

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

/** Error de un diálogo: el porqué y los datos para soporte. */
function ErrorDeDialogo({ titulo, error }: { titulo: string; error: unknown }): ReactNode {
  return (
    <Alert variant="destructive" title={titulo}>
      {mensajeDeError(error)}
      <SupportDetails error={error} />
    </Alert>
  );
}

/** Catálogos de rol y membresía: el formulario no se puede enviar sin ellos. */
function EstadoDelCatalogo({ cargando, error }: { cargando: boolean; error: unknown }): ReactNode {
  if (error) {
    return (
      <ErrorDeDialogo titulo="No se pudieron cargar los roles y las membresías" error={error} />
    );
  }
  return cargando ? (
    <p className="text-sm text-muted-foreground">Cargando roles y membresías…</p>
  ) : null;
}

/**
 * Si la membresía nueva guarda menos documentos de los que ya tiene, lo dice: el
 * exceso no se borra al cambiarla, sino al subir el siguiente documento.
 */
function AvisoDeCupo({
  plan,
  documentos,
}: {
  plan: PlanOption | undefined;
  documentos: number;
}): ReactNode {
  if (!plan || documentos <= plan.maxRetainedStatements) {
    return null;
  }
  return (
    <p className="mt-2 text-xs text-warning-foreground">
      Tiene {documentos} documentos y {plan.name} guarda {plan.maxRetainedStatements}: al subir el
      próximo se borrarán los más antiguos que sobren.
    </p>
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

// Sin rol ni membresía elegidos: el alta los pide siempre (el rol propone un plan).
const NUEVA_CUENTA: NuevaCuenta = {
  displayName: '',
  email: '',
  role: '',
  planCode: '',
  planExpiresOn: '',
  modoClave: 'generar',
  password: '',
};

/** Roles del catálogo cuya membresía lleva fecha de vencimiento. */
function rolesQueVencen(roles: readonly RoleOption[] | undefined): Set<string> {
  return new Set((roles ?? []).filter((rol) => rol.planExpiryRequired).map((rol) => rol.code));
}

const SIN_ROLES: readonly RoleOption[] = [];
const SIN_PLANES: readonly PlanOption[] = [];

export function CrearCuentaDialog({
  open,
  onOpenChange,
  onCreada,
}: {
  open: boolean;
  onOpenChange: (abierto: boolean) => void;
  onCreada: (miembro: Member, claveGenerada: string | null) => void;
}): ReactNode {
  const { baseUrl, usuario } = useSession();
  const queryClient = useQueryClient();
  const nombreId = useId();
  const correoId = useId();
  const claveId = useId();
  const vigenciaId = useId();
  const dominios = usuario?.allowedEmailDomains ?? SIN_DOMINIOS;
  const roles = useRoles();
  const planes = usePlans();
  const conVigencia = useMemo(() => rolesQueVencen(roles.data), [roles.data]);
  const schema = useMemo(() => nuevaCuentaSchema(dominios, conVigencia), [dominios, conVigencia]);

  const form = useForm<NuevaCuenta>({
    resolver: zodResolver(schema),
    defaultValues: NUEVA_CUENTA,
  });
  const errores = form.formState.errors;
  const modo = useWatch({ control: form.control, name: 'modoClave' });
  const rolElegido = useWatch({ control: form.control, name: 'role' });
  const pideVigencia = conVigencia.has(rolElegido);

  const alta = useMutation({
    mutationFn: (valores: NuevaCuenta) =>
      createMember(baseUrl, {
        displayName: valores.displayName,
        email: valores.email,
        role: valores.role,
        planCode: valores.planCode,
        // Solo para los roles que vencen: a un administrador nunca se le envía.
        ...(conVigencia.has(valores.role) ? { planExpiresOn: valores.planExpiresOn } : {}),
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
              {errores.email ? (
                <FieldError message={errores.email.message} />
              ) : (
                <DominiosAdmitidos dominios={dominios} />
              )}
            </div>
          </div>

          <EstadoDelCatalogo
            cargando={roles.isPending || planes.isPending}
            error={roles.error ?? planes.error}
          />

          <fieldset>
            <legend className="mb-2 text-sm font-medium">Rol</legend>
            <Controller
              control={form.control}
              name="role"
              render={({ field }) => (
                <RoleChoice
                  name={field.name}
                  roles={roles.data ?? SIN_ROLES}
                  value={field.value}
                  onChange={(rol) => {
                    field.onChange(rol.code);
                    // Un administrador usa todo el producto: su rol propone la
                    // membresía. Para un usuario no hay propuesta y se elige.
                    if (rol.defaultPlanCode) {
                      form.setValue('planCode', rol.defaultPlanCode, { shouldValidate: true });
                    }
                    // Un usuario normal nace con vencimiento: se propone un mes, a la
                    // vista y editable, para que el alta siga siendo rápida.
                    if (rol.planExpiryRequired && form.getValues('planExpiresOn') === '') {
                      form.setValue('planExpiresOn', sumarMeses(hoyLocal(), 1));
                    }
                  }}
                />
              )}
            />
            <FieldError message={errores.role?.message} />
          </fieldset>

          <fieldset>
            <legend className="mb-2 text-sm font-medium">Membresía</legend>
            <Controller
              control={form.control}
              name="planCode"
              render={({ field }) => (
                <PlanChoice
                  name={field.name}
                  plans={planes.data ?? SIN_PLANES}
                  value={field.value}
                  onChange={field.onChange}
                />
              )}
            />
            <FieldError message={errores.planCode?.message} />
          </fieldset>

          {pideVigencia ? (
            <fieldset>
              <legend className="mb-2 text-sm font-medium">
                <label htmlFor={vigenciaId}>Vence el</label>
              </legend>
              <Controller
                control={form.control}
                name="planExpiresOn"
                render={({ field }) => (
                  <VigenciaField
                    id={vigenciaId}
                    value={field.value}
                    onChange={field.onChange}
                    desde={hoyLocal()}
                    error={errores.planExpiresOn?.message}
                  />
                )}
              />
            </fieldset>
          ) : null}

          <ModoDeClave
            modo={modo}
            registroModo={form.register('modoClave')}
            registroClave={form.register('password')}
            error={errores.password?.message}
            campoId={claveId}
            etiqueta="Contraseña inicial"
          />

          {alta.isError ? (
            <ErrorDeDialogo titulo="No se pudo crear la cuenta" error={alta.error} />
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
  if (valores.planCode !== (miembro.planCode ?? '')) {
    cambios.planCode = valores.planCode;
  }
  const vigencia = valores.planExpiresOn === '' ? null : valores.planExpiresOn;
  if (vigencia !== (miembro.planExpiresOn ?? null)) {
    cambios.planExpiresOn = vigencia;
  }
  return cambios;
}

/**
 * Los roles que se ofrecen al editar: los asignables más el actual, aunque esté
 * por encima (no se puede cambiar, pero tiene que verse cuál es).
 */
function rolesParaEditar(asignables: readonly RoleOption[], miembro: Member): RoleOption[] {
  if (asignables.some((rol) => rol.code === miembro.role)) {
    return [...asignables];
  }
  return [
    ...asignables,
    {
      code: miembro.role,
      name: nombreDeRol(miembro.role, miembro.roleName),
      description: 'Rol actual.',
      rank: miembro.roleRank ?? 0,
      defaultPlanCode: null,
      permissions: [],
    },
  ];
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
  const { baseUrl, usuario } = useSession();
  const queryClient = useQueryClient();
  const nombreId = useId();
  const correoId = useId();
  const dominios = usuario?.allowedEmailDomains ?? SIN_DOMINIOS;
  const schema = useMemo(() => edicionSchema(dominios, miembro.email), [dominios, miembro.email]);

  const roles = useRoles();
  const planes = usePlans();
  const acciones = accionesSobre(miembro, esYo);

  const form = useForm<Edicion>({
    resolver: zodResolver(schema),
    defaultValues: {
      displayName: miembro.displayName,
      email: miembro.email,
      role: miembro.role,
      planCode: miembro.planCode ?? '',
      planExpiresOn: miembro.planExpiresOn ?? '',
    },
  });
  const errores = form.formState.errors;
  const planElegido = useWatch({ control: form.control, name: 'planCode' });
  const rolElegido = useWatch({ control: form.control, name: 'role' });
  const vigenciaId = useId();
  // La vigencia sigue al rol elegido: ascender a administrador la quita.
  const rolDelCatalogo = roles.data?.find((rol) => rol.code === rolElegido);
  const pideVigencia =
    rolDelCatalogo?.planExpiryRequired ??
    (rolElegido === miembro.role && miembro.planExpiryRequired === true);
  // Renovar cuenta desde el vencimiento actual si aún no pasó: no regala ni quita días.
  const hoy = hoyLocal();
  const desde =
    miembro.planExpiresOn && diasHasta(miembro.planExpiresOn, hoy) > 0
      ? miembro.planExpiresOn
      : hoy;

  const edicion = useMutation({
    mutationFn: (cambios: MemberChanges) => updateMember(baseUrl, miembro.userId, cambios),
    onSuccess: (actualizado) => {
      void queryClient.invalidateQueries({ queryKey: CLAVE_MIEMBROS });
      onGuardada(actualizado);
    },
  });

  const rolBloqueado = !acciones.has('CHANGE_ROLE');
  const planBloqueado = !acciones.has('CHANGE_PLAN');
  const datosBloqueados = !acciones.has('EDIT_PROFILE');

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
              readOnly={datosBloqueados}
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
              readOnly={datosBloqueados}
              aria-invalid={errores.email ? true : undefined}
              {...form.register('email')}
            />
            {errores.email ? (
              <FieldError message={errores.email.message} />
            ) : (
              <DominiosAdmitidos dominios={dominios} />
            )}
          </div>
        </div>

        <EstadoDelCatalogo
          cargando={roles.isPending || planes.isPending}
          error={roles.error ?? planes.error}
        />

        <fieldset>
          <legend className="mb-2 text-sm font-medium">Rol</legend>
          <Controller
            control={form.control}
            name="role"
            render={({ field }) => (
              <RoleChoice
                name={field.name}
                roles={rolesParaEditar(roles.data ?? SIN_ROLES, miembro)}
                value={field.value}
                onChange={(rol) => {
                  field.onChange(rol.code);
                }}
                disabled={rolBloqueado}
              />
            )}
          />
          {rolBloqueado ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {esYo
                ? 'No puedes cambiar tu propio rol.'
                : 'Solo alguien de rango superior puede cambiar el rol de esta cuenta.'}
            </p>
          ) : null}
        </fieldset>

        <fieldset>
          <legend className="mb-2 text-sm font-medium">Membresía</legend>
          <Controller
            control={form.control}
            name="planCode"
            render={({ field }) => (
              <PlanChoice
                name={field.name}
                plans={planes.data ?? SIN_PLANES}
                value={field.value}
                onChange={field.onChange}
                disabled={planBloqueado}
              />
            )}
          />
          <FieldError message={errores.planCode?.message} />
          <AvisoDeCupo
            plan={planes.data?.find((plan) => plan.code === planElegido)}
            documentos={miembro.documentCount}
          />
        </fieldset>

        {pideVigencia ? (
          <fieldset>
            <legend className="mb-2 text-sm font-medium">
              <label htmlFor={vigenciaId}>Vence el</label>
            </legend>
            <Controller
              control={form.control}
              name="planExpiresOn"
              render={({ field }) => (
                <VigenciaField
                  id={vigenciaId}
                  value={field.value}
                  onChange={field.onChange}
                  desde={desde}
                  error={errores.planExpiresOn?.message}
                  disabled={planBloqueado}
                  permitirQuitar
                />
              )}
            />
          </fieldset>
        ) : null}

        {edicion.isError ? (
          <ErrorDeDialogo titulo="No se pudieron guardar los cambios" error={edicion.error} />
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
          <ErrorDeDialogo titulo="No se pudo cambiar la contraseña" error={cambio.error} />
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
        <ErrorDeDialogo titulo="No se pudo eliminar" error={borrado.error} />
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
