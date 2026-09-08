import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { useId, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { useLocation, useNavigate, Navigate } from 'react-router-dom';
import { z } from 'zod';

import { useSession } from '@/app/use-session';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ApiError } from '@/lib/api-error';
import { login } from '@/lib/session-client';

const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Escribe tu correo')
    .email('Ese correo no tiene un formato válido'),
  password: z.string().min(1, 'Escribe tu contraseña'),
});

type LoginValues = z.infer<typeof loginSchema>;

/**
 * Mensajes por código. Ni "usuario inexistente" ni "contraseña incorrecta" se
 * distinguen a propósito: decirlo confirmaría qué correos están dados de alta.
 */
const MENSAJES: Record<string, string> = {
  INVALID_CREDENTIALS: 'El correo o la contraseña no son correctos.',
  ACCOUNT_LOCKED:
    'La cuenta está bloqueada temporalmente por varios intentos fallidos. Vuelve a intentarlo en unos minutos.',
  ACCOUNT_DISABLED: 'Esta cuenta está desactivada. Habla con quien administra tu organización.',
  NO_ACTIVE_MEMBERSHIP:
    'Tu cuenta no pertenece a ninguna organización activa. Habla con quien la administra.',
  NETWORK_ERROR: 'No se pudo contactar con el servidor. Comprueba que la API está levantada.',
};

function mensajeDeError(error: unknown): string {
  if (error instanceof ApiError) {
    return MENSAJES[error.code] ?? 'No se pudo iniciar sesión. Inténtalo de nuevo.';
  }
  return 'No se pudo iniciar sesión. Inténtalo de nuevo.';
}

export function LoginPage(): ReactNode {
  const { baseUrl, estado, establecer } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const emailId = useId();
  const passwordId = useId();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const mutation = useMutation({
    mutationFn: ({ email, password }: LoginValues) => login(baseUrl, email, password),
    onSuccess: (usuario) => {
      establecer(usuario);
      const destino = (location.state as { desde?: string } | null)?.desde ?? '/';
      void navigate(destino, { replace: true });
    },
  });

  if (estado === 'autenticado') {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-6 py-12">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold text-foreground">Conversor de estados de cuenta</h1>
        <p className="text-sm text-muted-foreground">
          Entra con la cuenta que te haya facilitado tu organización.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Iniciar sesión</CardTitle>
          <CardDescription>
            Si es tu primer acceso, usa la contraseña temporal que te entregaron y cámbiala después.
          </CardDescription>
        </CardHeader>

        <form
          className="mt-6 space-y-4"
          onSubmit={(event) => {
            void handleSubmit((values) => {
              mutation.mutate(values);
            })(event);
          }}
          noValidate
        >
          <div className="space-y-2">
            <Label htmlFor={emailId}>Correo</Label>
            <Input
              id={emailId}
              type="email"
              autoComplete="username"
              autoFocus
              aria-invalid={errors.email ? true : undefined}
              {...register('email')}
            />
            {errors.email ? (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            ) : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor={passwordId}>Contraseña</Label>
            <Input
              id={passwordId}
              type="password"
              autoComplete="current-password"
              aria-invalid={errors.password ? true : undefined}
              {...register('password')}
            />
            {errors.password ? (
              <p className="text-sm text-destructive">{errors.password.message}</p>
            ) : null}
          </div>

          {mutation.isError ? (
            <Alert variant="destructive" title="No se pudo entrar">
              {mensajeDeError(mutation.error)}
            </Alert>
          ) : null}

          <Button type="submit" className="w-full" disabled={mutation.isPending}>
            {mutation.isPending ? 'Entrando...' : 'Entrar'}
          </Button>
        </form>
      </Card>

      <p className="text-xs text-muted-foreground">
        Las cuentas las crea quien administra tu organización. No hay registro abierto.
      </p>
    </div>
  );
}
