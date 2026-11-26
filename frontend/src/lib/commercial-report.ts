import { z } from 'zod';

const count = z.number().int().nonnegative().safe();
const amount = z.number().int().safe();

export const commercialReportSchema = z.object({
  window: z.object({
    from: z.string().date(),
    to: z.string().date(),
    asOf: z.string().datetime(),
    zone: z.string(),
  }),
  accounts: z.object({
    registered: count,
    free: count,
    personalActive: count,
    expired: count,
    cancelled: count,
    freeCohort: count,
    converted: count,
  }),
  sales: z.array(
    z.object({
      product: z.string(),
      kind: z.string(),
      currency: z.string().length(3),
      payments: count,
      pagesSold: count,
      revenueCents: amount,
      activeMonthlyCents: amount,
    }),
  ),
  credits: z.array(
    z.object({
      product: z.string(),
      granted: count,
      available: count,
      held: count,
      expired: count,
      consumed: count,
      estimatedCostCents: amount.nullable(),
    }),
  ),
  operations: z.array(
    z.object({
      status: z.enum(['SUCCEEDED', 'NEEDS_REVIEW', 'FAILED', 'REJECTED']),
      count,
      pages: count,
    }),
  ),
  users: z.array(
    z.object({
      userId: z.string().uuid().nullable(),
      pages: count,
      estimatedCostCents: amount.nullable(),
    }),
  ),
  estimatedCostPerPagePen: z.string().nullable(),
});

export type CommercialReport = z.infer<typeof commercialReportSchema>;
export type ReportFilters = {
  from: string;
  to: string;
  userId: string;
  product: string;
  status: string;
};

export const REPORT_STATUS = {
  SUCCEEDED: 'Exitosos',
  NEEDS_REVIEW: 'Requieren revisión',
  FAILED: 'Fallidos registrados',
  REJECTED: 'Solicitudes rechazadas',
} as const;
export const REPORT_KINDS: Record<string, string> = {
  MEMBERSHIP: 'Membresías',
  PER_PAGE: 'Recargas',
  PACKAGE: 'Profesional',
};

export function reportTotals(report: CommercialReport) {
  const totals = new Map<
    string,
    { currency: string; revenue: number; payments: number; monthly: number }
  >();
  for (const sale of report.sales) {
    const row = totals.get(sale.currency) ?? {
      currency: sale.currency,
      revenue: 0,
      payments: 0,
      monthly: 0,
    };
    row.revenue += sale.revenueCents;
    row.payments += sale.payments;
    row.monthly += sale.activeMonthlyCents;
    totals.set(sale.currency, row);
  }
  return [...totals.values()].map((row) => ({
    ...row,
    average: row.payments ? Math.round(row.revenue / row.payments) : null,
  }));
}

export function productMargin(report: CommercialReport, product: string): number | null {
  const sales = report.sales.filter((row) => row.product === product && row.payments > 0);
  const cost = report.credits.find((row) => row.product === product)?.estimatedCostCents;
  if (!sales.length || sales.some((row) => row.currency !== 'PEN') || cost == null) return null;
  return sales.reduce((total, row) => total + row.revenueCents, 0) - cost;
}

export function commercialReportCsv(report: CommercialReport): Blob {
  const rows: (string | number | null)[][] = [
    ['Desde', report.window.from, 'Hasta', report.window.to, 'Zona', report.window.zone],
    ['Corte del saldo', report.window.asOf],
    ['Costo estimado por página en PEN', report.estimatedCostPerPagePen],
    [],
    [
      'Cuentas',
      'Gratuito',
      'Personal activo',
      'Personal vencido',
      'Renovación cancelada',
      'Altas Gratuito auditadas',
      'Altas convertidas',
    ],
    [
      report.accounts.registered,
      report.accounts.free,
      report.accounts.personalActive,
      report.accounts.expired,
      report.accounts.cancelled,
      report.accounts.freeCohort,
      report.accounts.converted,
    ],
    [],
    [
      'Moneda',
      'Ingresos en céntimos',
      'Pagos',
      'Ticket en céntimos',
      'Equivalente mensual vigente en céntimos',
    ],
    ...reportTotals(report).map((row) => [
      row.currency,
      row.revenue,
      row.payments,
      row.average,
      row.monthly,
    ]),
    [],
    ['Producto', 'Categoría', 'Moneda', 'Pagos', 'Páginas vendidas', 'Ingreso en céntimos'],
    ...report.sales.map((row) => [
      row.product,
      REPORT_KINDS[row.kind] ?? row.kind,
      row.currency,
      row.payments,
      row.pagesSold,
      row.revenueCents,
    ]),
    [],
    [
      'Producto',
      'Páginas otorgadas',
      'Disponibles',
      'Reservadas',
      'Vencidas',
      'Consumo atribuido',
      'Costo estimado en céntimos PEN',
      'Margen bruto estimado en céntimos PEN',
    ],
    ...report.credits.map((row) => [
      row.product,
      row.granted,
      row.available,
      row.held,
      row.expired,
      row.consumed,
      row.estimatedCostCents,
      productMargin(report, row.product),
    ]),
    [],
    ['Estado', 'Procesamientos', 'Páginas con conteo'],
    ...report.operations.map((row) => [REPORT_STATUS[row.status], row.count, row.pages]),
    [],
    ['Cuenta', 'Páginas procesadas con conteo', 'Costo estimado en céntimos PEN'],
    ...report.users.map((row) => [row.userId, row.pages, row.estimatedCostCents]),
  ];
  const contenido = rows
    .map((row) =>
      row
        .map((value) => {
          if (typeof value === 'number') return String(value);
          const text = value ?? '';
          const escaped = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
          return `"${escaped.replaceAll('"', '""')}"`;
        })
        .join(';'),
    )
    .join('\r\n');
  return new Blob(['\uFEFF', contenido], { type: 'text/csv;charset=utf-8' });
}
