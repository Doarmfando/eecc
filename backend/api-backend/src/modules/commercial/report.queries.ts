import { Prisma } from '@prisma/client';

import type { ReportStatus } from './report.dto';

export interface Scope {
  org: string;
  user: string | null;
  product: string | null;
  status: ReportStatus | null;
  from: Date;
  to: Date;
  now: Date;
  today: string;
  zone: string;
  holdSince: Date;
}

export interface AccountsRow {
  registered: bigint;
  free: bigint;
  personalActive: bigint;
  expired: bigint;
  cancelled: bigint;
  freeCohort: bigint;
  converted: bigint;
}

export interface SaleRow {
  product: string;
  kind: string;
  currency: string;
  payments: bigint;
  pagesSold: bigint;
  revenue: Prisma.Decimal;
  activeMonthly: Prisma.Decimal;
}

export interface CreditRow {
  product: string;
  granted: bigint;
  available: Prisma.Decimal;
  held: Prisma.Decimal;
  expired: Prisma.Decimal;
  consumed: Prisma.Decimal;
}

export interface OperationRow {
  userId: string | null;
  status: ReportStatus;
  total: bigint;
  pages: Prisma.Decimal;
}

export function accountsQuery(db: Prisma.TransactionClient, s: Scope): Promise<AccountsRow[]> {
  return db.$queryRaw(Prisma.sql`
    WITH members AS (
      SELECT m.id, m.user_id, m.status, m.plan_code, m.plan_expires_on, m.personal_renewal_cancelled_at
      FROM organization_memberships m
      WHERE m.organization_id = ${s.org}::uuid AND (${s.user}::uuid IS NULL OR m.user_id = ${s.user}::uuid)
    ), cohort AS (
      SELECT m.id, m.user_id, min(e.occurred_at) AS cohort_start
      FROM members m
      JOIN audit_events e ON e.entity_id = m.user_id AND e.organization_id = ${s.org}::uuid
      WHERE e.action = 'member.created' AND e.entity_type = 'user' AND e.metadata->>'planCode' = 'GRATUITO'
        AND e.occurred_at >= ${s.from} AND e.occurred_at < ${s.to}
      GROUP BY m.id, m.user_id
    )
    SELECT count(*) AS registered,
      count(*) FILTER (WHERE plan_code = 'GRATUITO') AS free,
      count(*) FILTER (WHERE plan_code = 'PERSONAL' AND status = 'ACTIVE' AND (plan_expires_on IS NULL OR plan_expires_on >= ${s.today}::date)) AS "personalActive",
      count(*) FILTER (WHERE plan_code = 'PERSONAL' AND status = 'ACTIVE' AND plan_expires_on < ${s.today}::date) AS expired,
      count(*) FILTER (WHERE plan_code = 'PERSONAL' AND personal_renewal_cancelled_at IS NOT NULL) AS cancelled,
      (SELECT count(*) FROM cohort) AS "freeCohort",
      (SELECT count(*) FROM cohort c WHERE
        EXISTS (SELECT 1 FROM personal_payments p WHERE p.organization_id = ${s.org}::uuid AND p.membership_id = c.id
          AND p.recorded_at >= c.cohort_start AND p.recorded_at < ${s.to}) OR
        EXISTS (SELECT 1 FROM page_lots l WHERE l.organization_id = ${s.org}::uuid AND l.user_id = c.user_id
          AND l.source = 'PURCHASE' AND l.price_paid > 0 AND l.created_at >= c.cohort_start AND l.created_at < ${s.to})
      ) AS converted
    FROM members
  `);
}

export function salesQuery(db: Prisma.TransactionClient, s: Scope): Promise<SaleRow[]> {
  return db.$queryRaw(Prisma.sql`
    WITH receipts AS (
      SELECT 'PERSONAL' AS product, 'MEMBERSHIP' AS kind, p.currency, p.amount, p.pages,
        p.recorded_at AS recorded,
        coalesce(m.status = 'ACTIVE' AND m.plan_code = 'PERSONAL' AND m.plan_expires_on >= ${s.today}::date
          AND p.starts_on <= ${s.today}::date AND p.ends_on > ${s.today}::date, false) AS recurring
      FROM personal_payments p
      LEFT JOIN organization_memberships m ON m.id = p.membership_id AND m.organization_id = p.organization_id
      WHERE p.organization_id = ${s.org}::uuid AND (${s.user}::uuid IS NULL OR m.user_id = ${s.user}::uuid)
        AND ((p.recorded_at >= ${s.from} AND p.recorded_at < ${s.to}) OR (p.starts_on <= ${s.today}::date AND p.ends_on > ${s.today}::date))
      UNION ALL
      SELECT l.product_code, c.pricing::text, l.currency, l.price_paid, l.quantity, l.created_at, false
      FROM page_lots l
      JOIN commercial_products c ON c.code = l.product_code
      WHERE l.organization_id = ${s.org}::uuid AND (${s.user}::uuid IS NULL OR l.user_id = ${s.user}::uuid)
        AND l.source = 'PURCHASE' AND l.created_at >= ${s.from} AND l.created_at < ${s.to}
    )
    SELECT product, kind, currency,
      count(*) FILTER (WHERE recorded >= ${s.from} AND recorded < ${s.to}) AS payments,
      coalesce(sum(pages) FILTER (WHERE recorded >= ${s.from} AND recorded < ${s.to}), 0) AS "pagesSold",
      coalesce(sum(amount) FILTER (WHERE recorded >= ${s.from} AND recorded < ${s.to}), 0) AS revenue,
      coalesce(sum(amount) FILTER (WHERE recurring), 0) AS "activeMonthly"
    FROM receipts
    WHERE ${s.product}::text IS NULL OR product = ${s.product}
    GROUP BY product, kind, currency ORDER BY product, currency
  `);
}

export function creditsQuery(db: Prisma.TransactionClient, s: Scope): Promise<CreditRow[]> {
  return db.$queryRaw(Prisma.sql`
    WITH credits AS (
      SELECT l.id, l.user_id, coalesce(l.product_code, l.plan_code, 'AJUSTE') AS product, l.source::text AS source,
        l.quantity, l.carried_over_pages, l.starts_at, l.expires_at
      FROM page_lots l
      WHERE l.organization_id = ${s.org}::uuid AND (${s.user}::uuid IS NULL OR l.user_id = ${s.user}::uuid)
        AND l.starts_at <= ${s.now}
        AND (l.expires_at IS NULL OR l.expires_at >= ${s.from} OR l.starts_at >= ${s.from}
          OR EXISTS (SELECT 1 FROM page_lot_allocations a JOIN page_reservations r ON r.id = a.reservation_id
            WHERE a.lot_id = l.id AND r.status = 'COMMITTED' AND r.settled_at >= ${s.from} AND r.settled_at < ${s.to}))
      UNION ALL
      -- Los pagos conceden páginas desde su inicio, incluso antes de crear el lote al primer uso.
      SELECT NULL::uuid, m.user_id, 'PERSONAL', 'MEMBERSHIP_PERIOD', p.pages, 0,
        p.starts_on::timestamp AT TIME ZONE ${s.zone}, p.ends_on::timestamp AT TIME ZONE ${s.zone}
      FROM personal_payments p
      LEFT JOIN organization_memberships m ON m.id = p.membership_id AND m.organization_id = p.organization_id
      WHERE p.organization_id = ${s.org}::uuid AND (${s.user}::uuid IS NULL OR m.user_id = ${s.user}::uuid)
        AND p.starts_on <= ${s.today}::date AND (p.ends_on::timestamp AT TIME ZONE ${s.zone}) >= ${s.from}
        AND NOT EXISTS (SELECT 1 FROM page_lots l WHERE l.organization_id = p.organization_id AND l.user_id = m.user_id
          AND l.plan_code = 'PERSONAL' AND l.period_key = 'PERIOD:' || to_char(p.starts_on, 'YYYY-MM-DD'))
        AND m.id IS NOT NULL
    ), balance AS (
      SELECT c.*,
        (m.id IS NOT NULL AND m.status = 'ACTIVE' AND (c.expires_at IS NULL OR c.expires_at > ${s.now})
          AND (c.source IN ('PURCHASE', 'ADJUSTMENT') OR ((m.plan_expires_on IS NULL OR m.plan_expires_on >= ${s.today}::date)
            AND (c.source = 'TRIAL' OR m.plan_code = c.product)))) AS usable,
        greatest(0, c.quantity - c.carried_over_pages - coalesce(a.consumed, 0)) AS remaining,
        coalesce(a.held, 0) AS reserved,
        coalesce(a.used_window, 0) AS used_window
      FROM credits c
      LEFT JOIN organization_memberships m ON m.user_id = c.user_id AND m.organization_id = ${s.org}::uuid
      LEFT JOIN LATERAL (
        SELECT sum(a.consumed_pages) FILTER (WHERE r.status = 'COMMITTED') AS consumed,
          sum(a.reserved_pages) FILTER (WHERE r.status = 'PENDING' AND r.created_at >= ${s.holdSince}) AS held,
          sum(a.consumed_pages) FILTER (WHERE r.status = 'COMMITTED' AND r.settled_at >= ${s.from} AND r.settled_at < ${s.to}) AS used_window
        FROM page_lot_allocations a JOIN page_reservations r ON r.id = a.reservation_id
        WHERE a.lot_id = c.id AND r.organization_id = ${s.org}::uuid
      ) a ON true
      WHERE ${s.product}::text IS NULL OR c.product = ${s.product}
    )
    SELECT product,
      coalesce(sum(quantity) FILTER (WHERE starts_at >= ${s.from} AND starts_at < ${s.to}), 0) AS granted,
      coalesce(sum(greatest(0, remaining - reserved)) FILTER (WHERE usable), 0) AS available,
      coalesce(sum(reserved) FILTER (WHERE usable), 0) AS held,
      coalesce(sum(remaining) FILTER (WHERE expires_at <= ${s.now} AND expires_at >= ${s.from} AND expires_at < ${s.to}), 0) AS expired,
      coalesce(sum(used_window), 0) AS consumed
    FROM balance GROUP BY product ORDER BY product
  `);
}

export function operationsQuery(db: Prisma.TransactionClient, s: Scope): Promise<OperationRow[]> {
  return db.$queryRaw(Prisma.sql`
    WITH operations AS (
      SELECT e.user_id, e.counted_status::text AS status,
        CASE WHEN ${s.product}::text IS NULL THEN e.page_count ELSE a.pages END AS pages
      FROM page_consumption_entries e
      LEFT JOIN LATERAL (
        SELECT sum(a.consumed_pages) AS pages
        FROM page_lot_allocations a JOIN page_lots l ON l.id = a.lot_id
        WHERE ${s.product}::text IS NOT NULL AND a.reservation_id = e.reservation_id
          AND l.organization_id = ${s.org}::uuid AND coalesce(l.product_code, l.plan_code, 'AJUSTE') = ${s.product}
      ) a ON true
      WHERE e.organization_id = ${s.org}::uuid AND (${s.user}::uuid IS NULL OR e.user_id = ${s.user}::uuid)
        AND e.occurred_at >= ${s.from} AND e.occurred_at < ${s.to} AND (${s.product}::text IS NULL OR a.pages > 0)
      UNION ALL
      SELECT st.uploaded_by, a.status::text, a.page_count
      FROM job_attempts a
      JOIN jobs j ON j.id = a.job_id AND j.organization_id = a.organization_id
      JOIN statements st ON st.id = j.statement_id AND st.organization_id = j.organization_id
      WHERE ${s.product}::text IS NULL AND a.organization_id = ${s.org}::uuid
        AND a.status IN ('SUCCEEDED', 'NEEDS_REVIEW', 'FAILED')
        AND NOT EXISTS (SELECT 1 FROM page_consumption_entries e WHERE e.organization_id = a.organization_id AND e.job_attempt_id = a.id)
        AND (${s.user}::uuid IS NULL OR st.uploaded_by = ${s.user}::uuid)
        AND coalesce(a.finished_at, a.started_at) >= ${s.from} AND coalesce(a.finished_at, a.started_at) < ${s.to}
      UNION ALL
      SELECT e.actor_user_id, 'REJECTED', NULL::integer
      FROM audit_events e
      WHERE ${s.product}::text IS NULL AND e.organization_id = ${s.org}::uuid AND e.action = 'statement.request_failed'
        AND (${s.user}::uuid IS NULL OR e.actor_user_id = ${s.user}::uuid)
        AND e.occurred_at >= ${s.from} AND e.occurred_at < ${s.to}
    )
    SELECT user_id AS "userId", status, count(*) AS total, coalesce(sum(pages), 0) AS pages
    FROM operations WHERE ${s.status}::text IS NULL OR status = ${s.status}
    GROUP BY user_id, status
  `);
}
