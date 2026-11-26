import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { useSession } from '@/app/use-session';
import { SupportDetails } from '@/components/shared/support-details';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useCommercialProducts } from '@/features/balance/queries';
import { mensajeDeError } from '@/features/users/error-messages';
import {
  commercialReportCsv,
  productMargin,
  REPORT_KINDS,
  REPORT_STATUS,
  reportTotals,
  type CommercialReport,
  type ReportFilters,
} from '@/lib/commercial-report';
import { formatCount, formatPrice } from '@/lib/format';
import { formatearDia } from '@/lib/plan-dates';
import { saveBlob } from '@/lib/save-file';
import { fetchCommercialReport, fetchMembers, type Member } from '@/lib/session-client';

const EMPTY: ReportFilters = { from: '', to: '', userId: '', product: '', status: '' };
const selectClass = 'h-9 w-full rounded-md border border-input bg-background px-3 text-sm';
const cell = 'px-3 py-2.5';

function ReportTable({
  title,
  columns,
  rows,
}: {
  title: string;
  columns: string[];
  rows: { key: string; values: ReactNode[] }[];
}): ReactNode {
  return (
    <Card>
      <CardTitle>{title}</CardTitle>
      {rows.length === 0 ? (
        <CardDescription>Sin registros para estos filtros.</CardDescription>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-max text-left text-sm tabular-nums">
            <thead className="border-b border-border text-muted-foreground">
              <tr>
                {columns.map((column) => (
                  <th key={column} scope="col" className={cell}>
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/70">
              {rows.map((row) => (
                <tr key={row.key}>
                  {row.values.map((value, index) => (
                    <td key={columns[index]} className={cell}>
                      {value}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

function AccountSummary({ accounts }: { accounts: CommercialReport['accounts'] }): ReactNode {
  const entries = [
    ['Cuentas registradas', accounts.registered],
    ['Gratuito', accounts.free],
    ['Personal activo', accounts.personalActive],
    ['Personal vencido', accounts.expired],
    ['Renovación cancelada', accounts.cancelled],
  ] as const;
  const rate = accounts.freeCohort
    ? new Intl.NumberFormat('es-PE', { style: 'percent', maximumFractionDigits: 1 }).format(
        accounts.converted / accounts.freeCohort,
      )
    : '—';
  return (
    <Card>
      <CardTitle>Cuentas</CardTitle>
      <CardDescription>
        Corte de hoy. La conversión usa las altas auditadas del periodo.
      </CardDescription>
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-6">
        {entries.map(([name, value]) => (
          <div key={name} className="rounded-md bg-muted/45 p-3">
            <dt className="text-sm text-muted-foreground">{name}</dt>
            <dd className="mt-1 text-xl font-semibold tabular-nums">{formatCount(value)}</dd>
          </div>
        ))}
        <div className="rounded-md bg-muted/45 p-3">
          <dt className="text-sm text-muted-foreground">Conversión de Gratuito</dt>
          <dd className="mt-1 text-xl font-semibold tabular-nums">{rate}</dd>
          <dd className="text-xs text-muted-foreground">
            {formatCount(accounts.converted)} de {formatCount(accounts.freeCohort)} altas auditadas
          </dd>
        </div>
      </dl>
    </Card>
  );
}

function ReportContent({
  report,
  members,
}: {
  report: CommercialReport;
  members: Member[];
}): ReactNode {
  const labels = new Map(members.map((member) => [member.userId, member.displayName]));
  const money = (cents: number | null, currency = 'PEN'): string =>
    cents === null ? '—' : formatPrice(cents, currency);
  return (
    <>
      <p className="text-sm text-muted-foreground">
        {formatearDia(report.window.from)} a {formatearDia(report.window.to)} · {report.window.zone}
      </p>
      <AccountSummary accounts={report.accounts} />
      <ReportTable
        title="Ingresos confirmados"
        columns={['Moneda', 'Ingresos', 'Pagos', 'Ticket promedio', 'Mensual vigente']}
        rows={reportTotals(report).map((row) => ({
          key: row.currency,
          values: [
            row.currency,
            money(row.revenue, row.currency),
            formatCount(row.payments),
            money(row.average, row.currency),
            money(row.monthly, row.currency),
          ],
        }))}
      />
      <ReportTable
        title="Ventas por producto"
        columns={['Producto', 'Categoría', 'Pagos', 'Páginas vendidas', 'Ingresos']}
        rows={[...report.sales]
          .sort((a, b) => b.payments - a.payments)
          .map((row) => ({
            key: `${row.product}-${row.currency}`,
            values: [
              row.product,
              REPORT_KINDS[row.kind] ?? row.kind,
              formatCount(row.payments),
              formatCount(row.pagesSold),
              money(row.revenueCents, row.currency),
            ],
          }))}
      />
      <ReportTable
        title="Páginas por producto"
        columns={[
          'Producto',
          'Otorgadas',
          'Disponibles hoy',
          'Reservadas hoy',
          'Vencidas',
          'Consumidas',
          'Costo estimado',
          'Margen estimado',
        ]}
        rows={report.credits.map((row) => ({
          key: row.product,
          values: [
            row.product,
            formatCount(row.granted),
            formatCount(row.available),
            formatCount(row.held),
            formatCount(row.expired),
            formatCount(row.consumed),
            money(row.estimatedCostCents),
            money(productMargin(report, row.product)),
          ],
        }))}
      />
      {report.estimatedCostPerPagePen ? (
        <p className="text-sm text-muted-foreground">
          Estimación variable en PEN a partir de S/ {report.estimatedCostPerPagePen} por página
          registrada.
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          Para ver estimaciones de costo y margen se requiere un costo por página configurado.
        </p>
      )}
      <ReportTable
        title="Procesamientos"
        columns={['Estado', 'Casos', 'Páginas con conteo']}
        rows={report.operations.map((row) => ({
          key: row.status,
          values: [REPORT_STATUS[row.status], formatCount(row.count), formatCount(row.pages)],
        }))}
      />
      <ReportTable
        title="Páginas procesadas por cuenta"
        columns={['Cuenta', 'Páginas con conteo', 'Costo estimado']}
        rows={report.users.slice(0, 30).map((row) => ({
          key: row.userId ?? 'sin-cuenta',
          values: [
            row.userId
              ? (labels.get(row.userId) ?? 'Cuenta sin nombre disponible')
              : 'Sin cuenta asociada',
            formatCount(row.pages),
            money(row.estimatedCostCents),
          ],
        }))}
      />
      {report.users.length > 30 ? (
        <p className="text-sm text-muted-foreground">
          Se muestran 30 cuentas. El CSV incluye las {formatCount(report.users.length)} del informe.
        </p>
      ) : null}
    </>
  );
}

export function CommercialReportPage(): ReactNode {
  const { usuario, baseUrl } = useSession();
  const organizationId = usuario?.organizationId ?? '';
  const [draft, setDraft] = useState(EMPTY);
  const [filters, setFilters] = useState(EMPTY);
  const report = useQuery({
    queryKey: ['commercial-report', organizationId, filters],
    enabled: organizationId !== '',
    retry: false,
    queryFn: ({ signal }) => fetchCommercialReport(baseUrl, organizationId, filters, signal),
  });
  const members = useQuery({
    queryKey: ['commercial-report-members', organizationId],
    enabled: organizationId !== '',
    retry: false,
    staleTime: 60_000,
    queryFn: ({ signal }) => fetchMembers(baseUrl, signal),
  });
  const catalog = useCommercialProducts();
  const products = new Set([
    'GRATUITO',
    'PERSONAL',
    ...(catalog.data ?? []).map((row) => row.code),
    ...(report.data?.sales ?? []).map((row) => row.product),
    ...(report.data?.credits ?? []).map((row) => row.product),
  ]);
  function change(key: keyof ReportFilters, value: string): void {
    setDraft((previous) => ({ ...previous, [key]: value }));
  }
  return (
    <div className="mx-auto w-full max-w-6xl space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Panel comercial</h1>
          <p className="mt-1 text-sm text-muted-foreground">{usuario?.organizationName}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={!report.data || report.isFetching}
          onClick={() => {
            if (report.data)
              saveBlob(
                commercialReportCsv(report.data),
                `atlas-comercial-${report.data.window.from}-${report.data.window.to}.csv`,
              );
          }}
        >
          <Download aria-hidden /> Exportar CSV
        </Button>
      </div>
      <Card>
        <form
          aria-label="Filtros del panel comercial"
          className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault();
            setFilters({ ...draft, product: draft.product.trim().toUpperCase() });
          }}
        >
          <label className="space-y-1 text-sm">
            <span>Desde</span>
            <Input
              type="date"
              value={draft.from}
              onChange={(event) => {
                change('from', event.target.value);
              }}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span>Hasta</span>
            <Input
              type="date"
              value={draft.to}
              onChange={(event) => {
                change('to', event.target.value);
              }}
            />
          </label>
          <label className="space-y-1 text-sm">
            <span>Cuenta</span>
            <select
              className={selectClass}
              value={draft.userId}
              onChange={(event) => {
                change('userId', event.target.value);
              }}
            >
              <option value="">Todas las cuentas</option>
              {(members.data ?? []).map((member) => (
                <option key={member.userId} value={member.userId}>
                  {member.displayName}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            <span>Producto</span>
            <Input
              list="commercial-products"
              placeholder="Todos los productos"
              value={draft.product}
              onChange={(event) => {
                change('product', event.target.value);
              }}
            />
            <datalist id="commercial-products">
              {[...products].map((product) => (
                <option key={product} value={product} />
              ))}
            </datalist>
          </label>
          <label className="space-y-1 text-sm">
            <span>Estado del procesamiento</span>
            <select
              className={selectClass}
              value={draft.status}
              onChange={(event) => {
                change('status', event.target.value);
              }}
            >
              <option value="">Todos los estados</option>
              {Object.entries(REPORT_STATUS).map(([key, value]) => (
                <option key={key} value={key}>
                  {value}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit">Aplicar filtros</Button>
        </form>
      </Card>
      {members.isError ? (
        <Alert title="No se pudo cargar la lista de cuentas">
          Puedes consultar el total de tu organización.
        </Alert>
      ) : null}
      {report.isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          Cargando indicadores…
        </p>
      ) : null}
      {report.isError ? (
        <Alert variant="destructive" title="No se pudo cargar el panel comercial">
          {mensajeDeError(report.error)}
          <SupportDetails error={report.error} />
        </Alert>
      ) : null}
      {report.data ? <ReportContent report={report.data} members={members.data ?? []} /> : null}
    </div>
  );
}
