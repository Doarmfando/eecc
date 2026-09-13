import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { CircleUser, KeyRound, LogOut } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';

import { useSession } from '@/app/use-session';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { FieldError, PasswordInput } from '@/features/users/form-fields';
import { clavePropiaSchema, type ClavePropia } from '@/features/users/member-schemas';
import { ETIQUETA_ROL } from '@/features/users/roles';
import { ApiError } from '@/lib/api-error';
import { changePassword } from '@/lib/session-client';
import { cn } from '@/lib/utils';

const AVISO_CLAVE_CAMBIADA =
  'Contraseña cambiada. Por seguridad se cerraron tus sesiones: entra con la nueva.';

function mensajeDeError(error: unknown): string {
  if (error instanceof ApiError && error.code === 'INVALID_CREDENTIALS') {
    return 'La contraseña actual no es correcta.';
  }
  return 'No se pudo cambiar la contraseña. Inténtalo de nuevo.';
}

function CambiarClave({ onCancelar }: { onCancelar: () => void }): ReactNode {
  const { baseUrl, cerrar } = useSession();
  const actualId = useId();
  const nuevaId = useId();
  const repetirId = useId();

  const form = useForm<ClavePropia>({
    resolver: zodResolver(clavePropiaSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmation: '' },
  });
  const errores = form.formState.errors;

  const cambio = useMutation({
    mutationFn: (valores: ClavePropia) =>
      changePassword(baseUrl, valores.currentPassword, valores.newPassword),
    // El servidor cierra todas las sesiones al cambiarla, también esta. Seguir con
    // la interfaz abierta solo llevaría a errores en la siguiente petición.
    onSuccess: () => cerrar(AVISO_CLAVE_CAMBIADA),
  });

  return (
    <form
      className="mt-4 space-y-4"
      noValidate
      onSubmit={(event) => {
        void form.handleSubmit((valores) => {
          cambio.mutate(valores);
        })(event);
      }}
    >
      <div className="space-y-2">
        <Label htmlFor={actualId}>Contraseña actual</Label>
        <PasswordInput
          id={actualId}
          autoComplete="current-password"
          aria-invalid={errores.currentPassword ? true : undefined}
          {...form.register('currentPassword')}
        />
        <FieldError message={errores.currentPassword?.message} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={nuevaId}>Nueva contraseña</Label>
        <PasswordInput
          id={nuevaId}
          aria-invalid={errores.newPassword ? true : undefined}
          {...form.register('newPassword')}
        />
        <FieldError message={errores.newPassword?.message} />
      </div>
      <div className="space-y-2">
        <Label htmlFor={repetirId}>Repite la nueva</Label>
        <PasswordInput
          id={repetirId}
          aria-invalid={errores.confirmation ? true : undefined}
          {...form.register('confirmation')}
        />
        <FieldError message={errores.confirmation?.message} />
      </div>

      {cambio.isError ? (
        <Alert variant="destructive" title="No se pudo cambiar">
          {mensajeDeError(cambio.error)}
        </Alert>
      ) : null}

      <div className="flex gap-2">
        <Button type="button" variant="outline" className="flex-1" onClick={onCancelar}>
          Cancelar
        </Button>
        <Button type="submit" className="flex-1" disabled={cambio.isPending}>
          {cambio.isPending ? 'Guardando…' : 'Guardar'}
        </Button>
      </div>
    </form>
  );
}

/**
 * Botón de cuenta en la cabecera: quién ha entrado, cambiar la contraseña y salir.
 *
 * El detalle vive en un diálogo y no en la barra para no competir con lo que
 * importa —el documento que se está procesando—, pero el punto de color deja ver
 * de un vistazo si hay sesión sin necesidad de abrirlo.
 */
export function AccountMenu(): ReactNode {
  const { usuario, cerrar } = useSession();
  const [abierto, setAbierto] = useState(false);
  const [cambiandoClave, setCambiandoClave] = useState(false);
  const conectado = usuario !== null;

  return (
    <Dialog
      open={abierto}
      onOpenChange={(valor) => {
        setAbierto(valor);
        if (!valor) {
          setCambiandoClave(false);
        }
      }}
    >
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={conectado ? `Cuenta de ${usuario.displayName}` : 'Cuenta: sin sesión'}
          className="relative inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-white/15 bg-white/10 text-white transition-colors hover:bg-white/15"
        >
          <CircleUser aria-hidden className="size-5" />
          <span
            aria-hidden
            className={cn(
              'absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full border-2 border-slate-900',
              conectado ? 'bg-success' : 'bg-slate-500',
            )}
          />
        </button>
      </DialogTrigger>

      <DialogContent aria-describedby={undefined}>
        <DialogTitle className="text-base font-semibold">
          {cambiandoClave ? 'Cambiar mi contraseña' : 'Cuenta'}
        </DialogTitle>

        {usuario ? (
          cambiandoClave ? (
            <CambiarClave
              onCancelar={() => {
                setCambiandoClave(false);
              }}
            />
          ) : (
            <div className="mt-4 space-y-5">
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Nombre</dt>
                  <dd className="font-medium text-foreground">{usuario.displayName}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Correo</dt>
                  <dd className="text-foreground">{usuario.email}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Organización</dt>
                  <dd className="text-foreground">
                    {usuario.organizationName} · {ETIQUETA_ROL[usuario.role]}
                  </dd>
                </div>
              </dl>

              <div className="grid gap-2">
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setCambiandoClave(true);
                  }}
                >
                  <KeyRound aria-hidden className="size-4" />
                  Cambiar contraseña
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => {
                    setAbierto(false);
                    void cerrar();
                  }}
                >
                  <LogOut aria-hidden className="size-4" />
                  Salir
                </Button>
              </div>
            </div>
          )
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">
            No hay ninguna sesión activa. Entra con el correo y la contraseña que te haya facilitado
            tu organización.
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
