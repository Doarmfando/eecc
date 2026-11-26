import { z } from 'zod';

import { ApiError } from './api-error';
import {
  commercialReportSchema,
  type CommercialReport,
  type ReportFilters,
} from './commercial-report';
import {
  parsePageBalance,
  parsePageLot,
  parsePageLots,
  type PageBalance,
  type PageLot,
} from './page-balance';

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
  /** Precio publicado en céntimos; nulo si no se vende por catálogo (ADR-0019). */
  priceCents: number | null;
  currency: string;
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
  /** Céntimos; nulo quita el precio publicado. */
  priceCents?: number | null;
  features?: string[];
}

/** Igual que al crear, pero todo opcional: solo se cambia lo que se envía. */
export type UpdatePlanInput = Partial<Omit<CreatePlanInput, 'code'>>;

/** `PER_PAGE`: se cobra por página (Recargas). `PACKAGE`: paquete cerrado (Profesional). */
export type CommercialPricing = 'PER_PAGE' | 'PACKAGE';

/** Producto de saldo del catálogo comercial (ADR-0019). */
export interface CommercialProduct {
  code: string;
  name: string;
  description: string;
  pricing: CommercialPricing;
  /** Páginas del paquete (`PACKAGE`). */
  pageQuantity: number | null;
  /** Mínimo de páginas por compra (`PER_PAGE`). */
  minimumPages: number | null;
  /** Céntimos: del paquete entero o de una página, según `pricing`. */
  priceCents: number;
  currency: string;
  /** Días que dura el saldo desde que se registra la compra. */
  validityDays: number;
}

export interface CommercialProductAdmin extends CommercialProduct {
  isActive: boolean;
  sortOrder: number;
}

export interface CreateCommercialProductInput {
  code: string;
  name: string;
  description: string;
  pricing: CommercialPricing;
  pageQuantity?: number | null;
  minimumPages?: number | null;
  priceCents: number;
  validityDays: number;
  isActive?: boolean;
  sortOrder?: number;
}

/** Cuánto cuesta una compra y, si conviene, un paquete que dé más por no más dinero. */
export interface Quote {
  productCode: string;
  pages: number;
  priceCents: number;
  currency: string;
  validityDays: number;
  suggestion: {
    productCode: string;
    name: string;
    pages: number;
    priceCents: number;
    savingsCents: number;
  } | null;
}

/** Saldo de una cuenta y el historial de sus lotes, para quien la administra. */
export interface MemberPageBalance {
  balance: PageBalance;
  history: PageLot[];
}

export interface RegisterPurchaseInput {
  productCode: string;
  /** Páginas de una recarga; en un paquete no aplica. */
  pages?: number;
  paymentReference?: string;
  note?: string;
}

/** El código y la forma de precio no se cambian: un paquete por página es otro producto. */
export type UpdateCommercialProductInput = Partial<
  Omit<CreateCommercialProductInput, 'code' | 'pricing' | 'pageQuantity' | 'minimumPages'>
> & { pageQuantity?: number; minimumPages?: number };

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

export async function fetchCommercialReport(
  baseUrl: string,
  organizationId: string,
  filters: ReportFilters,
  signal: AbortSignal,
): Promise<CommercialReport> {
  const query = new URLSearchParams({ organizationId });
  for (const [key, value] of Object.entries(filters)) {
    if (value) query.set(key, value);
  }
  const result = commercialReportSchema.safeParse(
    await pedir(baseUrl, `v1/commercial-report?${query.toString()}`, { method: 'GET', signal }),
  );
  if (!result.success) throw new ApiError('RESPONSE_CONTRACT_MISMATCH', 200);
  return result.data;
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

/** Productos de saldo que se ofrecen hoy; cualquier persona con sesión. */
export async function fetchCommercialProducts(
  baseUrl: string,
  signal?: AbortSignal,
): Promise<CommercialProduct[]> {
  return (await pedir(baseUrl, 'v1/commercial-products', {
    method: 'GET',
    ...(signal ? { signal } : {}),
  })) as CommercialProduct[];
}

/** Sin `pages`, la API cotiza el mínimo de una recarga; en un paquete no aplica. */
export async function fetchQuote(
  baseUrl: string,
  code: string,
  pages?: number,
  signal?: AbortSignal,
): Promise<Quote> {
  const consulta = pages === undefined ? '' : `?pages=${String(pages)}`;
  return (await pedir(
    baseUrl,
    `v1/commercial-products/${encodeURIComponent(code)}/quote${consulta}`,
    { method: 'GET', ...(signal ? { signal } : {}) },
  )) as Quote;
}

/** Saldo e historial de lotes de una cuenta (ADR-0019). */
export async function fetchMemberPageBalance(
  baseUrl: string,
  userId: string,
  signal?: AbortSignal,
): Promise<MemberPageBalance> {
  const respuesta = await pedir(baseUrl, `v1/users/${encodeURIComponent(userId)}/page-balance`, {
    method: 'GET',
    ...(signal ? { signal } : {}),
  });
  const cuerpo = (respuesta ?? {}) as { balance?: unknown; history?: unknown };
  const balance = parsePageBalance(cuerpo.balance);
  if (!balance) {
    throw new ApiError('RESPONSE_CONTRACT_MISMATCH', 200);
  }
  return { balance, history: parsePageLots(cuerpo.history) };
}

/** Registra una compra ya cobrada por Yape: el saldo se activa en el acto. */
export async function registerPurchase(
  baseUrl: string,
  userId: string,
  datos: RegisterPurchaseInput,
): Promise<PageLot> {
  const lote = parsePageLot(
    await pedir(baseUrl, `v1/users/${encodeURIComponent(userId)}/page-lots`, {
      method: 'POST',
      body: datos,
    }),
  );
  if (!lote) {
    throw new ApiError('RESPONSE_CONTRACT_MISMATCH', 201);
  }
  return lote;
}

const personalPaymentSchema = z.object({
  id: z.string().uuid(),
  priceCents: z.number().int().positive(),
  currency: z.string().length(3),
  pages: z.number().int().positive(),
  startsOn: z.string().date(),
  paidThrough: z.string().date(),
  recordedAt: z.string().datetime(),
});
const personalStateSchema = z.object({
  canRegister: z.boolean(),
  currentPlan: z.string(),
  expiresOn: z.string().date().nullable(),
  renewalCancelledAt: z.string().datetime().nullable(),
  priceCents: z.number().int().nullable(),
  currency: z.string().length(3).nullable(),
  payments: z.array(personalPaymentSchema),
});

export type PersonalState = z.infer<typeof personalStateSchema>;
export type PersonalPaymentInput = { reference: string; priceCents: number; currency: string };

export async function fetchPersonalState(
  baseUrl: string,
  userId: string | undefined,
  signal: AbortSignal,
): Promise<PersonalState> {
  const path = userId ? `v1/personal/users/${encodeURIComponent(userId)}` : 'v1/personal';
  const result = personalStateSchema.safeParse(
    await pedir(baseUrl, path, { method: 'GET', signal }),
  );
  if (!result.success) throw new ApiError('RESPONSE_CONTRACT_MISMATCH', 200);
  return result.data;
}

export async function recordPersonalPayment(
  baseUrl: string,
  userId: string,
  input: PersonalPaymentInput,
): Promise<void> {
  const result = personalPaymentSchema.safeParse(
    await pedir(baseUrl, `v1/personal/users/${encodeURIComponent(userId)}/payments`, {
      method: 'POST',
      body: input,
    }),
  );
  if (!result.success) throw new ApiError('RESPONSE_CONTRACT_MISMATCH', 201);
}

export async function cancelPersonalRenewal(baseUrl: string): Promise<void> {
  await pedir(baseUrl, 'v1/personal/cancel-renewal', { method: 'POST' });
}

/** Todo el catálogo de saldo, activo o retirado; solo con el permiso `PLANS_MANAGE`. */
export async function fetchCommercialProductsForAdmin(
  baseUrl: string,
  signal?: AbortSignal,
): Promise<CommercialProductAdmin[]> {
  return (await pedir(baseUrl, 'v1/commercial-products/admin', {
    method: 'GET',
    ...(signal ? { signal } : {}),
  })) as CommercialProductAdmin[];
}

export async function createCommercialProduct(
  baseUrl: string,
  datos: CreateCommercialProductInput,
): Promise<CommercialProductAdmin> {
  return (await pedir(baseUrl, 'v1/commercial-products', {
    method: 'POST',
    body: datos,
  })) as CommercialProductAdmin;
}

export async function updateCommercialProduct(
  baseUrl: string,
  code: string,
  cambios: UpdateCommercialProductInput,
): Promise<CommercialProductAdmin> {
  return (await pedir(baseUrl, `v1/commercial-products/${encodeURIComponent(code)}`, {
    method: 'PATCH',
    body: cambios,
  })) as CommercialProductAdmin;
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
