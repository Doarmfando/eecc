import { CircleUser, LogOut } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { useSession } from '@/app/use-session';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

const ETIQUETAS_DE_ROL: Record<string, string> = {
  OWNER: 'Propietario',
  ADMIN: 'Administrador',
  MEMBER: 'Miembro',
  VIEWER: 'Lectura',
};

/**
 * Botón de cuenta en la cabecera: quién ha entrado y por dónde salir.
 *
 * El detalle vive en un diálogo y no en la barra para no competir con lo que
 * importa —el documento que se está procesando—, pero el punto de color deja ver
 * de un vistazo si hay sesión sin necesidad de abrirlo.
 */
export function AccountMenu(): ReactNode {
  const { usuario, cerrar } = useSession();
  const [abierto, setAbierto] = useState(false);
  const conectado = usuario !== null;

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={conectado ? `Cuenta de ${usuario.displayName}` : 'Cuenta: sin sesión'}
          className="relative inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-white/15 bg-white/10 text-white transition-colors hover:bg-white/15"
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

      <DialogContent>
        <DialogTitle className="text-base font-semibold">Cuenta</DialogTitle>

        {usuario ? (
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
                  {usuario.organizationName} · {ETIQUETAS_DE_ROL[usuario.role] ?? usuario.role}
                </dd>
              </div>
            </dl>

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
