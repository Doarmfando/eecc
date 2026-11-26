import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import {
  puedeAdministrarPlanes,
  puedeGestionarCuentas,
  tieneFuncion,
} from '@/features/access/access';
import { readBaseUrl } from '@/lib/env';
import { fetchSession, logout as cerrarEnServidor, type SessionUser } from '@/lib/session-client';

import { SessionContext, type SessionState, type SessionValue } from './session-context';

/**
 * Resuelve la sesión al cargar la aplicación.
 *
 * La cookie es httpOnly, así que el navegador no puede leerla: la única forma de
 * saber si hay sesión es preguntárselo al servidor. Mientras responde, el estado
 * es `cargando`, y por eso las rutas protegidas no redirigen todavía; hacerlo
 * expulsaría a quien sí tiene sesión en cada recarga.
 */
export function SessionProvider({
  children,
  baseUrl,
}: {
  children: ReactNode;
  baseUrl?: string;
}): ReactNode {
  const resolvedBaseUrl = baseUrl ?? readBaseUrl(import.meta.env);
  const [estado, setEstado] = useState<SessionState>('cargando');
  const [usuario, setUsuario] = useState<SessionUser | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    const controller = new AbortController();
    fetchSession(resolvedBaseUrl, controller.signal)
      .then((sesion) => {
        setUsuario(sesion);
        setEstado('autenticado');
      })
      .catch(() => {
        // Cualquier fallo aquí significa "no hay sesión utilizable". No se distingue
        // entre 401 y red caída: en ambos casos lo que toca es pedir credenciales.
        if (!controller.signal.aborted) {
          setUsuario(null);
          setEstado('anonimo');
        }
      });
    return () => {
      controller.abort();
    };
  }, [resolvedBaseUrl]);

  const accessEndsAt = usuario?.plan?.code === 'PERSONAL' ? usuario.plan.accessEndsAt : undefined;
  const userId = usuario?.userId;
  const organizationId = usuario?.organizationId;
  useEffect(() => {
    if (!accessEndsAt) return;
    const fin = Date.parse(accessEndsAt);
    if (!Number.isFinite(fin) || fin <= Date.now()) return;
    const controller = new AbortController();
    let timer: number | undefined;
    function esLaMismaSesion(actual: SessionUser | null): actual is SessionUser {
      return (
        actual !== null &&
        actual.userId === userId &&
        actual.organizationId === organizationId &&
        actual.plan?.accessEndsAt === accessEndsAt
      );
    }
    function revisar(): void {
      const faltan = fin - Date.now();
      if (faltan > 0) {
        timer = window.setTimeout(revisar, Math.min(faltan, 24 * 60 * 60 * 1000));
        return;
      }
      setUsuario((actual) =>
        esLaMismaSesion(actual) && actual.plan
          ? { ...actual, plan: { ...actual.plan, expired: true } }
          : actual,
      );
      void fetchSession(resolvedBaseUrl, controller.signal)
        .then((sesion) => {
          if (sesion.userId === userId && sesion.organizationId === organizationId) {
            setUsuario((actual) =>
              !controller.signal.aborted && esLaMismaSesion(actual) ? sesion : actual,
            );
          }
        })
        .catch(() => {
          // Una sesión sin conexión conserva el cierre local hasta volver a cargar.
        });
    }
    revisar();
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [accessEndsAt, organizationId, resolvedBaseUrl, userId]);

  const establecer = useCallback((sesion: SessionUser) => {
    setUsuario(sesion);
    setEstado('autenticado');
    setAviso(null);
  }, []);

  const cerrar = useCallback(
    async (motivo?: string) => {
      try {
        await cerrarEnServidor(resolvedBaseUrl);
      } finally {
        // El estado local se limpia pase lo que pase: si la petición falla, dejar la
        // interfaz como si siguiera dentro sería peor que cerrarla de más.
        setUsuario(null);
        setEstado('anonimo');
        setAviso(motivo ?? null);
        queryClient.clear();
      }
    },
    [resolvedBaseUrl, queryClient],
  );

  const value = useMemo<SessionValue>(
    () => ({
      baseUrl: resolvedBaseUrl,
      estado,
      usuario,
      establecer,
      cerrar,
      aviso,
      puedeAdministrar: puedeGestionarCuentas(usuario),
      puedeAdministrarPlanes: puedeAdministrarPlanes(usuario),
      tieneFuncion: (funcion) => tieneFuncion(usuario, funcion),
    }),
    [resolvedBaseUrl, estado, usuario, establecer, cerrar, aviso],
  );

  return <SessionContext value={value}>{children}</SessionContext>;
}
