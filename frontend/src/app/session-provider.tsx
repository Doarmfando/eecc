import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

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
      puedeAdministrar: usuario?.role === 'ADMIN',
    }),
    [resolvedBaseUrl, estado, usuario, establecer, cerrar, aviso],
  );

  return <SessionContext value={value}>{children}</SessionContext>;
}
