import { ApiError } from './api-error';

/**
 * Código de rol del catálogo de la API (`SUPER_ADMIN`, `ADMIN`, `MEMBER` y los que
 * se creen). La interfaz decide con permisos, rango y funciones, no con el código.
 */
export type Role = string;

/** Membresía de quien tiene la sesión: vistas habilitadas y límites (ADR-0016). */
export interface SessionPlan {
  code: string;
  name: string;
  /** Tope técnico de seguridad por PDF. Nulo: sin tope. */
  maxPagesPerDocument: number | null;
  /** Páginas acumuladas al mes que decide el cobro. Nulo: sin tope fijo, se cotiza. */
  monthlyPageQuota?: number | null;
  /** La prueba se consume una sola vez y no se renueva cada mes. */
  trialOneTime?: boolean;
  /** Si todavía puede consumir esa prueba única. */
  trialAvailable?: boolean;
  features: string[];
  /** Último día de vigencia (`YYYY-MM-DD`); nulo si no vence (ADR-0017). */
  expiresOn?: string | null;
  /** Ya venció: no puede convertir hasta que la renueven. */
  expired?: boolean;
}

export interface SessionUser {
  userId: string;
  email: string;
  displayName: string;
  organizationId: string;
  organizationName: string;
  role: Role;
  roleName?: string;
  roleRank?: number;
  /**
   * Permisos del rol. Opcionales para convivir con una API anterior a ADR-0016:
   * sin ellos se deduce del rol, como antes.
   */
  permissions?: string[];
  /** Sin plan (API anterior) no se bloquea ninguna vista. */
  plan?: SessionPlan;
  /** Documentos que conserva antes de reemplazar uno: el cupo de su membresía. */
  retainedStatementsPerUser: number;
  /** Teléfono de soporte para los avisos de error. */
  supportPhone?: string | null;
  /** Dominios de correo admitidos en las altas. Vacío: cualquiera. */
  allowedEmailDomains?: string[];
}

/** Lo que quien consulta puede hacer con una cuenta. Lo decide la API por rangos. */
export type MemberAction =
  'EDIT_PROFILE' | 'CHANGE_PLAN' | 'CHANGE_ROLE' | 'CHANGE_STATUS' | 'RESET_PASSWORD' | 'DELETE';

export interface Member {
  userId: string;
  email: string;
  displayName: string;
  role: Role;
  roleName?: string;
  roleRank?: number;
  planCode?: string;
  planName?: string;
  maxPagesPerDocument?: number | null;
  monthlyPageQuota?: number | null;
  /** Recarga puesta a mano por un administrador; nulo usa la del plan. */
  monthlyPageQuotaOverride?: number | null;
  planChangedAt?: string;
  /** Último día de vigencia (`YYYY-MM-DD`); nulo si no vence. */
  planExpiresOn?: string | null;
  planExpired?: boolean;
  /** Si su rol lleva vencimiento: los administradores no vencen. */
  planExpiryRequired?: boolean;
  status: string;
  membershipStatus: 'ACTIVE' | 'REVOKED';
  /** Documentos que conserva en la organización. */
  documentCount: number;
  lastLoginAt: string | null;
  createdAt: string;
  /** Sin este campo (API anterior) se aplican las reglas de siempre. */
  actions?: MemberAction[];
}

/** Igual que `Member`, más cuánto lleva consumido del acumulado de 30 días (ADR-0018). */
export interface MemberDetail extends Member {
  pagesUsed: number;
}

export interface MemberChanges {
  displayName?: string;
  email?: string;
  role?: Role;
  planCode?: string;
  /** `YYYY-MM-DD` para renovar o cambiar la vigencia; `null` la quita. */
  planExpiresOn?: string | null;
  /** Recarga de páginas al mes; `null` la quita y vuelve a la del plan. */
  monthlyPageQuotaOverride?: number | null;
  membershipStatus?: 'ACTIVE' | 'REVOKED';
}

/** Membresía del catálogo, tal como la ofrece la API para asignarla. */
export interface PlanOption {
  code: string;
  name: string;
  description: string;
  maxPagesPerDocument: number | null;
  monthlyPageQuota: number | null;
  trialOneTime: boolean;
  features: string[];
  isDefault: boolean;
}

/** Igual que `PlanOption`, más si se ofrece y en qué orden: la vista de administrarlo. */
export interface PlanAdminOption extends PlanOption {
  isActive: boolean;
  sortOrder: number;
}

/** Lo que hace falta para crear un plan nuevo en el catálogo. */
export interface CreatePlanInput {
  code: string;
  name: string;
  description: string;
  maxPagesPerDocument?: number | null;
  monthlyPageQuota?: number | null;
  trialOneTime?: boolean;
  isDefault?: boolean;
  isActive?: boolean;
  sortOrder?: number;
  features?: string[];
}

/** Igual que al crear, pero todo opcional: solo se cambia lo que se envía. */
export type UpdatePlanInput = Partial<Omit<CreatePlanInput, 'code'>>;

/** Rol que quien consulta puede asignar: de rango igual o inferior al suyo. */
export interface RoleOption {
  code: string;
  name: string;
  description: string;
  rank: number;
  /** Plan que se propone al elegir este rol. Nulo: hay que elegirlo. */
  defaultPlanCode: string | null;
  /** Si su membresía lleva fecha de vencimiento. */
  planExpiryRequired?: boolean;
  permissions: string[];
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
    // La referencia es lo que soporte necesita para encontrar el fallo en el registro.
    const requestId =
      'requestId' in raw && typeof raw.requestId === 'string' ? raw.requestId : undefined;
    return new ApiError(raw.code, response.status, requestId);
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
  init: { method: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown; signal?: AbortSignal },
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

export async function fetchMemberDetail(
  baseUrl: string,
  userId: string,
  signal?: AbortSignal,
): Promise<MemberDetail> {
  return (await pedir(baseUrl, `v1/users/${encodeURIComponent(userId)}`, {
    method: 'GET',
    ...(signal ? { signal } : {}),
  })) as MemberDetail;
}

export async function fetchPlans(baseUrl: string, signal?: AbortSignal): Promise<PlanOption[]> {
  return (await pedir(baseUrl, 'v1/plans', {
    method: 'GET',
    ...(signal ? { signal } : {}),
  })) as PlanOption[];
}

/** Todo el catálogo, activo o retirado; solo con el permiso `PLANS_MANAGE`. */
export async function fetchPlansForAdmin(
  baseUrl: string,
  signal?: AbortSignal,
): Promise<PlanAdminOption[]> {
  return (await pedir(baseUrl, 'v1/plans/admin', {
    method: 'GET',
    ...(signal ? { signal } : {}),
  })) as PlanAdminOption[];
}

export async function createPlan(
  baseUrl: string,
  datos: CreatePlanInput,
): Promise<PlanAdminOption> {
  return (await pedir(baseUrl, 'v1/plans', { method: 'POST', body: datos })) as PlanAdminOption;
}

export async function updatePlan(
  baseUrl: string,
  code: string,
  cambios: UpdatePlanInput,
): Promise<PlanAdminOption> {
  return (await pedir(baseUrl, `v1/plans/${encodeURIComponent(code)}`, {
    method: 'PATCH',
    body: cambios,
  })) as PlanAdminOption;
}

export async function fetchRoles(baseUrl: string, signal?: AbortSignal): Promise<RoleOption[]> {
  return (await pedir(baseUrl, 'v1/roles', {
    method: 'GET',
    ...(signal ? { signal } : {}),
  })) as RoleOption[];
}

/** Pública: la usa también la pantalla de entrada, donde no hay sesión. */
export async function fetchSupportContact(
  baseUrl: string,
  signal?: AbortSignal,
): Promise<{ phone: string | null }> {
  const respuesta = (await pedir(baseUrl, 'v1/support', {
    method: 'GET',
    ...(signal ? { signal } : {}),
  })) as { phone?: unknown } | null;
  return { phone: typeof respuesta?.phone === 'string' ? respuesta.phone : null };
}

/** Sin `password`, el servidor genera una temporal y la devuelve una sola vez. */
export async function createMember(
  baseUrl: string,
  datos: {
    email: string;
    displayName: string;
    role: Role;
    planCode?: string;
    planExpiresOn?: string;
    password?: string;
  },
): Promise<{ member: Member; temporaryPassword: string | null }> {
  return (await pedir(baseUrl, 'v1/users', { method: 'POST', body: datos })) as {
    member: Member;
    temporaryPassword: string | null;
  };
}

export async function updateMember(
  baseUrl: string,
  userId: string,
  cambios: MemberChanges,
): Promise<Member> {
  return (await pedir(baseUrl, `v1/users/${encodeURIComponent(userId)}`, {
    method: 'PATCH',
    body: cambios,
  })) as Member;
}

/** Sin `password`, el servidor genera una temporal y la devuelve una sola vez. */
export async function setMemberPassword(
  baseUrl: string,
  userId: string,
  password?: string,
): Promise<{ temporaryPassword: string | null }> {
  return (await pedir(baseUrl, `v1/users/${encodeURIComponent(userId)}/password-reset`, {
    method: 'POST',
    body: password === undefined ? {} : { password },
  })) as { temporaryPassword: string | null };
}

/** Elimina la cuenta y sus documentos. El servidor rechaza hacerlo con un administrador. */
export async function deleteMember(baseUrl: string, userId: string): Promise<void> {
  await pedir(baseUrl, `v1/users/${encodeURIComponent(userId)}`, { method: 'DELETE' });
}
