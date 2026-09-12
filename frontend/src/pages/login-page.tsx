import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { Eye, EyeOff, Lock, User } from 'lucide-react';
import { useId, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { useSession } from '@/app/use-session';
import { ApiError } from '@/lib/api-error';
import { login } from '@/lib/session-client';

import './login-page.css';

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
  const { baseUrl, estado, establecer, aviso } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const emailId = useId();
  const passwordId = useId();
  const [mostrarPassword, setMostrarPassword] = useState(false);

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
    <div className="asm-login-screen">
      <div className="asm-login-shapes" aria-hidden>
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>

      <div className="asm-login-shell">
        <aside className="asm-login-left" aria-label="Identidad de la aplicación">
          <img className="asm-login-left-image" src="/login-assets/panel.jpg" alt="" aria-hidden />
          <div className="asm-login-left-overlay" />
        </aside>

        <main className="asm-login-main">
          <section className="asm-login-card" aria-labelledby="login-title">
            <h1 id="login-title">Inicia sesión</h1>
            {/* Sin esto, en móvil —donde el panel lateral se oculta— la pantalla no
                dice a qué aplicación se está entrando. */}
            <p className="asm-login-subtitle">Conversor de estados de cuenta</p>

            {/* Tras cambiar la contraseña el servidor cierra todas las sesiones: sin
                este aviso, volver aquí parecería un fallo. */}
            {aviso ? (
              <div className="asm-login-notice" role="status">
                {aviso}
              </div>
            ) : null}

            {mutation.isError ? (
              <div className="asm-login-error" role="alert">
                {mensajeDeError(mutation.error)}
              </div>
            ) : null}

            <form
              className="asm-login-form"
              onSubmit={(event) => {
                void handleSubmit((values) => {
                  mutation.mutate(values);
                })(event);
              }}
              noValidate
            >
              <div className="asm-login-field">
                <User aria-hidden className="asm-login-field-icon" />
                <input
                  id={emailId}
                  type="email"
                  autoComplete="username"
                  autoFocus
                  placeholder="Correo electrónico"
                  aria-label="Correo electrónico"
                  aria-invalid={errors.email ? true : undefined}
                  {...register('email')}
                />
              </div>
              {errors.email ? <p className="asm-login-validation">{errors.email.message}</p> : null}

              <div className="asm-login-field">
                <Lock aria-hidden className="asm-login-field-icon" />
                <input
                  id={passwordId}
                  type={mostrarPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="Contraseña"
                  aria-label="Contraseña"
                  aria-invalid={errors.password ? true : undefined}
                  {...register('password')}
                />
                <button
                  type="button"
                  className="asm-login-eye"
                  onClick={() => {
                    setMostrarPassword((actual) => !actual);
                  }}
                  aria-label={mostrarPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  disabled={mutation.isPending}
                >
                  {mostrarPassword ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
                </button>
              </div>
              {errors.password ? (
                <p className="asm-login-validation">{errors.password.message}</p>
              ) : null}

              <button type="submit" className="asm-login-submit" disabled={mutation.isPending}>
                {mutation.isPending ? 'Accediendo...' : 'Acceder'}
              </button>

              {/* No hay recuperación por correo: las cuentas las gestiona un
                  administrador, así que se dice a quién acudir en vez de ofrecer
                  algo que parece un enlace y no lleva a ningún sitio. */}
              <p className="asm-login-recovery">
                ¿Olvidaste tu contraseña? Pide a un administrador que te asigne una nueva.
              </p>
            </form>
          </section>
        </main>

        <footer className="asm-login-footer" aria-label="Créditos">
          <span className="asm-login-footer-brand">
            <img src="/login-assets/atlas-isotipo.png" alt="" aria-hidden />
          </span>
        </footer>
      </div>
    </div>
  );
}
