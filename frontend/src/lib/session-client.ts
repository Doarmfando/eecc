import { ApiError } from './api-error';

export interface SessionUser {
  userId: string;
  email: string;
  displayName: string;
  organizationId: string;
  organizationName: string;
  role: 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER';
  /** Documentos que conserva cada persona antes de que se borre el más antiguo. */
  retainedStatementsPerUser: number;
}

export interface Member {
  userId: string;
  email: string;
  displayName: string;
  role: SessionUser['role'];
  status: string;
  membershipStatus: string;
  lastLoginAt: string | null;
  createdAt: string;
}

function joinUrl(baseUrl: string, path: string): string {
  if (!baseUrl) {
    return `/${path}`;
  }
  return new URL(path, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).toString();
}

async function readError(response: Response): Promise<ApiError> {
  const raw: unknown = await response.json().catch(() => null);
  if (typeof raw === 'object' && raw !== null && 'code' in raw && typeof raw.code === 'string') {
    return new ApiError(raw.code, response.status);
  }
  return new ApiError('REQUEST_FAILED', response.status);
}

/**
 * Petición autenticada por cookie.
 *
 * `credentials: 'include'` es lo que hace que la cookie httpOnly viaje. El token
 * no se toca desde JavaScript en ningún momento: por eso un XSS no puede robarlo.
 */
async function pedir(
  baseUrl: string,
  path: string,
  init: { method: 'GET' | 'POST' | 'PATCH'; body?: unknown; signal?: AbortSignal },
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(joinUrl(baseUrl, path), {
      method: init.method,
      credentials: 'include',
      ...(init.body === undefined
        ? {}
        : { headers: { 'content-type': 'application/json' }, body: JSON.stringify(init.body) }),
      ...(init.signal ? { signal: init.signal } : {}),
    });
  } catch {
    throw new ApiError('NETWORK_ERROR', 0);
  }

  if (!response.ok) {
    throw await readError(response);
  }
  if (response.status === 204) {
    return null;
  }
  return response.json();
}

export async function login(
  baseUrl: string,
  email: string,
  password: string,
): Promise<SessionUser> {
  return (await pedir(baseUrl, 'v1/auth/login', {
    method: 'POST',
    body: { email, password },
  })) as SessionUser;
}

export async function logout(baseUrl: string): Promise<void> {
  await pedir(baseUrl, 'v1/auth/logout', { method: 'POST' });
}

export async function fetchSession(baseUrl: string, signal?: AbortSignal): Promise<SessionUser> {
  return (await pedir(baseUrl, 'v1/auth/me', {
    method: 'GET',
    ...(signal ? { signal } : {}),
  })) as SessionUser;
}

export async function changePassword(
  baseUrl: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  await pedir(baseUrl, 'v1/auth/password', {
    method: 'POST',
    body: { currentPassword, newPassword },
  });
}

export async function fetchMembers(baseUrl: string, signal?: AbortSignal): Promise<Member[]> {
  return (await pedir(baseUrl, 'v1/users', {
    method: 'GET',
    ...(signal ? { signal } : {}),
  })) as Member[];
}

export async function createMember(
  baseUrl: string,
  datos: { email: string; displayName: string; role: SessionUser['role'] },
): Promise<{ member: Member; temporaryPassword: string }> {
  return (await pedir(baseUrl, 'v1/users', { method: 'POST', body: datos })) as {
    member: Member;
    temporaryPassword: string;
  };
}

export async function updateMember(
  baseUrl: string,
  userId: string,
  cambios: { role?: SessionUser['role']; membershipStatus?: 'ACTIVE' | 'REVOKED' },
): Promise<Member> {
  return (await pedir(baseUrl, `v1/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: cambios,
  })) as Member;
}

export async function resetMemberPassword(
  baseUrl: string,
  userId: string,
): Promise<{ temporaryPassword: string }> {
  return (await pedir(baseUrl, `v1/users/${encodeURIComponent(userId)}/password-reset`, {
    method: 'POST',
  })) as { temporaryPassword: string };
}
