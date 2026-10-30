import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Info,
  TriangleAlert,
} from 'lucide-react';
import type { ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { formatCount, formatMoney, type Currency } from '@/lib/format';
import { getMonthLabel, getMonthShortLabel } from '@/lib/month';
import { cn } from '@/lib/utils';

import { BANK_ACCENTS, type SourceBankId } from './bank-accent';
import { BankMark } from './bank-mark';
import type { LedgerRow } from './ledger';
import type { GroupBy, Scope, SortKey, Subtotal } from './ledger-filters';
import {
  accountLabel,
  DATE_KIND_LABELS,
  documentLabel,
  MOVEMENT_ISSUE_LABELS,
} from './ledger-labels';
import { SegmentedControl } from './segmented-control';
import { useLedgerTable, type LedgerTableState } from './use-ledger-table';

const selectClass =
  'h-9 rounded-md border border-input bg-card px-2.5 text-sm shadow-xs focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-1';

function formatDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  return year && month && day ? `${day}/${month}/${year}` : '—';
}

function Amount({
  cents,
  currency,
  tone,
}: {
  cents: number;
  currency: Currency;
  tone?: 'success' | 'muted';
}): ReactNode {
  if (cents === 0) {
    return <span className="text-muted-foreground/50">—</span>;
  }
  return (
    <span className={cn(tone === 'success' ? 'text-success' : 'text-foreground')}>
      {formatMoney(cents, currency)}
    </span>
  );
}

/** Lo que conviene mirar de una fila, en una frase por motivo. */
function rowNotes(row: LedgerRow): { warnings: string[]; notes: string[] } {
  const warnings = row.transaction.issues.map((issue) => MOVEMENT_ISSUE_LABELS[issue]);
  if (row.possibleRepeat) {
    warnings.push('Aparece igual en otro documento de la misma cuenta con periodo superpuesto');
  }
  if (row.statement.estado === 'NEEDS_REVIEW') {
    warnings.push('Su documento quedó en «Requiere revisión»');
  }
  const notes: string[] = [];
  if (row.transaction.outsidePeriod) {
    notes.push('La fecha cae fuera del periodo que declara su documento');
  }
  if (!row.statement.monedaDeclarada) {
    notes.push('El documento no declara su moneda; se supone soles');
  }
  return { warnings, notes };
}

function RowStatus({ row }: { row: LedgerRow }): ReactNode {
  const { warnings, notes } = rowNotes(row);
  if (warnings.length > 0) {
    const text = [...warnings, ...notes].join('. ');
    return (
      <span title={text} className="inline-flex text-warning">
        <TriangleAlert aria-hidden className="size-4" />
        <span className="sr-only">{text}</span>
      </span>
    );
  }
  if (notes.length > 0) {
    const text = notes.join('. ');
    return (
      <span title={text} className="inline-flex text-muted-foreground">
        <Info aria-hidden className="size-4" />
        <span className="sr-only">{text}</span>
      </span>
    );
  }
  if (row.transaction.reconciled) {
    return (
      <span title="El saldo impreso cuadra con el arrastre" className="inline-flex">
        <CheckCircle2 aria-hidden className="size-4 text-muted-foreground/60" />
        <span className="sr-only">Verificado</span>
      </span>
    );
  }
  return null;
}

const COLUMNS: readonly {
  key: SortKey;
  label: string;
  title?: string;
  align?: 'right';
  className?: string;
}[] = [
  {
    key: 'fecha',
    label: 'Fecha',
    title: 'La fecha principal que imprime cada banco: de proceso en BCP, de operación en BBVA',
    className: 'w-28',
  },
  {
    key: 'periodo',
    label: 'Periodo',
    title: 'El mes del estado de cuenta al que pertenece la fila, no el de su fecha',
    className: 'w-24',
  },
  { key: 'cuenta', label: 'Banco · cuenta', className: 'w-28' },
  { key: 'descripcion', label: 'Descripción' },
  { key: 'cargo', label: 'Cargo', align: 'right', className: 'w-28' },
  { key: 'abono', label: 'Abono', align: 'right', className: 'w-28' },
  {
    key: 'saldo',
    label: 'Saldo',
    title: 'El saldo que imprime el banco en esa fila. No se calcula.',
    align: 'right',
    className: 'w-28',
  },
  { key: 'documento', label: 'Documento', className: 'w-36' },
];

function SortHeader({
  column,
  table,
}: {
  column: (typeof COLUMNS)[number];
  table: LedgerTableState;
}): ReactNode {
  const active = table.sort.key === column.key;
  const Icon = active ? (table.sort.direction === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th
      scope="col"
      aria-sort={active ? (table.sort.direction === 'asc' ? 'ascending' : 'descending') : undefined}
      className={cn('px-3 py-2 font-medium', column.className)}
    >
      <button
        type="button"
        title={column.title}
        onClick={() => {
          table.toggleSort(column.key);
        }}
        className={cn(
          'inline-flex cursor-pointer items-center gap-1 rounded hover:text-foreground',
          'focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-1',
          column.align === 'right' ? 'ml-auto flex-row-reverse' : '',
          active ? 'text-foreground' : '',
        )}
      >
        {column.label}
        <Icon aria-hidden className={cn('size-3.5', active ? '' : 'opacity-40')} />
      </button>
    </th>
  );
}

function TableRow({ row, currency }: { row: LedgerRow; currency: Currency }): ReactNode {
  const { transaction, statement, account } = row;
  const declared = statement.periodoDeclarado;
  return (
    <tr className="border-b border-border/50 align-top last:border-b-0 hover:bg-muted/40">
      <td className="px-3 py-2 whitespace-nowrap tabular-nums">
        <span title={DATE_KIND_LABELS[statement.tipoFecha]}>{formatDate(transaction.date)}</span>
        {transaction.valueDate && transaction.valueDate !== transaction.date ? (
          <span className="block text-xs text-muted-foreground">
            valor {formatDate(transaction.valueDate)}
          </span>
        ) : null}
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        <span
          title={
            declared
              ? `Periodo del documento: ${formatDate(declared.start)} al ${formatDate(declared.end)}`
              : getMonthLabel(statement.fechaPeriodo)
          }
        >
          {getMonthShortLabel(statement.fechaPeriodo)}
        </span>
      </td>
      <td className="px-3 py-2">
        <span className="flex items-center gap-2">
          <BankMark bankId={statement.bancoOrigen} className="h-4 w-7 shrink-0" />
          <span className="truncate text-xs text-muted-foreground">
            {account.terminacion ? `···${account.terminacion}` : 'Sin cuenta'}
          </span>
        </span>
      </td>
      <td className="max-w-0 px-3 py-2">
        <p
          className="line-clamp-2 font-medium break-words text-foreground"
          title={transaction.description}
        >
          {transaction.description || '—'}
        </p>
        <p className="truncate text-xs text-muted-foreground">{transaction.category}</p>
      </td>
      <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
        <Amount cents={transaction.debitCents} currency={currency} />
      </td>
      <td className="px-3 py-2 text-right whitespace-nowrap tabular-nums">
        <Amount cents={transaction.creditCents} currency={currency} tone="success" />
      </td>
      <td className="px-3 py-2 text-right whitespace-nowrap text-muted-foreground tabular-nums">
        {transaction.balanceCents === null ? (
          <span className="text-muted-foreground/50">—</span>
        ) : (
          formatMoney(transaction.balanceCents, currency)
        )}
      </td>
      <td className="max-w-0 px-3 py-2">
        <p className="truncate text-xs text-muted-foreground" title={documentLabel(statement)}>
          {documentLabel(statement)}
        </p>
        <p className="text-[11px] text-muted-foreground/70">
          {transaction.source.page ? `pág. ${String(transaction.source.page)} · ` : ''}fila{' '}
          {String(transaction.source.row)}
        </p>
      </td>
      <td className="w-8 px-2 py-2">
        <RowStatus row={row} />
      </td>
    </tr>
  );
}

function subtotalLabel(subtotal: Subtotal, by: GroupBy): string {
  switch (by) {
    case 'banco':
      return BANK_ACCENTS[subtotal.sample.statement.bancoOrigen].name;
    case 'cuenta':
      return accountLabel(subtotal.sample.account);
    case 'periodo':
      return getMonthLabel(subtotal.key);
  }
}

const GROUP_OPTIONS: readonly { value: GroupBy; label: string }[] = [
  { value: 'cuenta', label: 'Cuenta' },
  { value: 'banco', label: 'Banco' },
  { value: 'periodo', label: 'Periodo' },
];

function Subtotals({
  table,
  currency,
}: {
  table: LedgerTableState;
  currency: Currency;
}): ReactNode {
  const { groupBy, subtotals } = table;
  return (
    <Card className="gap-4 rounded-2xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-foreground">Subtotales</h3>
          <p className="text-xs text-muted-foreground">
            De las filas filtradas. Son flujos (cargos y abonos), no saldos.
          </p>
        </div>
        <SegmentedControl
          label="Agrupar subtotales por"
          value={groupBy}
          options={GROUP_OPTIONS}
          onChange={table.setGroupBy}
        />
      </div>
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr className="border-b border-border">
              <th scope="col" className="px-3 py-2 font-medium">
                {GROUP_OPTIONS.find((option) => option.value === groupBy)?.label}
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Movimientos
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Cargos
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Abonos
              </th>
              <th scope="col" className="px-3 py-2 text-right font-medium">
                Neto
              </th>
            </tr>
          </thead>
          <tbody>
            {subtotals.map((subtotal) => (
              <tr key={subtotal.key} className="border-b border-border/50 last:border-b-0">
                <td className="px-3 py-2 font-medium text-foreground">
                  {subtotalLabel(subtotal, groupBy)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{formatCount(subtotal.count)}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {formatMoney(subtotal.debitCents, currency)}
                </td>
                <td className="px-3 py-2 text-right text-success tabular-nums">
                  {formatMoney(subtotal.creditCents, currency)}
                </td>
                <td
                  className={cn(
                    'px-3 py-2 text-right font-semibold tabular-nums',
                    subtotal.netCents >= 0 ? 'text-success' : 'text-destructive',
                  )}
                >
                  {formatMoney(subtotal.netCents, currency)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/**
 * Los movimientos anexados en columnas comunes, sean del banco que sean. Es de
 * consulta: nada se edita, y el saldo es siempre el que imprime el banco.
 */
export function LedgerTable({
  rows,
  scope,
  banks,
  search,
  currency,
}: {
  /** Las filas del alcance (mes o todos los periodos), ya consolidadas. */
  rows: readonly LedgerRow[];
  scope: Scope;
  banks: ReadonlySet<SourceBankId>;
  search: string;
  currency: Currency;
}): ReactNode {
  const table = useLedgerTable(rows, banks, search);
  const { totals } = table;
  const lastRow = table.firstRow + table.pageRows.length;

  return (
    <div className="space-y-6">
      <Card className="gap-4 rounded-2xl">
        <CardHeader>
          <CardTitle>Movimientos</CardTitle>
          <CardDescription>
            {scope === 'acumulado'
              ? 'Todos los documentos marcados en el Historial, en una sola tabla.'
              : 'Los documentos del periodo elegido.'}{' '}
            Ordena con los encabezados.
          </CardDescription>
        </CardHeader>

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Cuenta
            <select
              className={selectClass}
              value={table.account}
              onChange={(event) => {
                table.setAccount(event.target.value);
              }}
            >
              <option value="">Todas las cuentas</option>
              {table.accountOptions.map((option) => (
                <option key={option.key} value={option.key}>
                  {accountLabel(option)}
                </option>
              ))}
            </select>
          </label>
          {scope === 'acumulado' ? (
            <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
              Periodo
              <select
                className={selectClass}
                value={table.period}
                onChange={(event) => {
                  table.setPeriod(event.target.value);
                }}
              >
                <option value="">Todos los periodos</option>
                {table.periodOptions.map((month) => (
                  <option key={month} value={month}>
                    {getMonthLabel(month)}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Desde
            <Input
              type="date"
              className="h-9 w-40"
              value={table.dateFrom}
              max={table.dateTo || undefined}
              onChange={(event) => {
                table.setDateFrom(event.target.value);
              }}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
            Hasta
            <Input
              type="date"
              className="h-9 w-40"
              value={table.dateTo}
              min={table.dateFrom || undefined}
              onChange={(event) => {
                table.setDateTo(event.target.value);
              }}
            />
          </label>
          {table.hasOwnFilters ? (
            <Button type="button" variant="ghost" size="sm" onClick={table.clearOwnFilters}>
              Limpiar filtros
            </Button>
          ) : null}
        </div>

        {/* `relative`: el texto para lectores de pantalla va posicionado y, sin un
            ancestro posicionado aquí, escaparía del scroll y ensancharía la página. */}
        <div className="relative -mx-6 overflow-x-auto sm:-mx-7">
          <table className="w-full min-w-[1000px] table-fixed text-sm">
            <thead className="sticky top-0 bg-card text-left text-xs text-muted-foreground">
              <tr className="border-b border-border">
                {COLUMNS.map((column) => (
                  <SortHeader key={column.key} column={column} table={table} />
                ))}
                <th scope="col" className="w-8 px-2 py-2">
                  <span className="sr-only">Estado</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {table.pageRows.map((row) => (
                <TableRow key={row.transaction.id} row={row} currency={currency} />
              ))}
            </tbody>
            {totals.count > 0 ? (
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/40 font-semibold">
                  <td colSpan={4} className="px-3 py-2.5">
                    Total · {formatCount(totals.count)}{' '}
                    {totals.count === 1 ? 'movimiento' : 'movimientos'}
                    <span className="ml-2 text-xs font-normal text-muted-foreground">
                      Neto{' '}
                      <span className={totals.netCents >= 0 ? 'text-success' : 'text-destructive'}>
                        {formatMoney(totals.netCents, currency)}
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums">
                    {formatMoney(totals.debitCents, currency)}
                  </td>
                  <td className="px-3 py-2.5 text-right text-success tabular-nums">
                    {formatMoney(totals.creditCents, currency)}
                  </td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>

        {totals.count === 0 ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <p className="text-sm text-muted-foreground">
              Ningún movimiento coincide con los filtros.
            </p>
            {table.hasOwnFilters ? (
              <Button type="button" variant="outline" size="sm" onClick={table.clearOwnFilters}>
                Limpiar filtros de la tabla
              </Button>
            ) : null}
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-3">
            <p className="text-xs text-muted-foreground" aria-live="polite">
              Filas {formatCount(table.firstRow + 1)}–{formatCount(lastRow)} de{' '}
              {formatCount(totals.count)}
            </p>
            {table.pageCount > 1 ? (
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={table.page === 0}
                  onClick={() => {
                    table.setPage(table.page - 1);
                  }}
                >
                  <ChevronLeft aria-hidden />
                  Anterior
                </Button>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {formatCount(table.page + 1)} / {formatCount(table.pageCount)}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={table.page >= table.pageCount - 1}
                  onClick={() => {
                    table.setPage(table.page + 1);
                  }}
                >
                  Siguiente
                  <ChevronRight aria-hidden />
                </Button>
              </div>
            ) : null}
          </div>
        )}
      </Card>

      {totals.count > 0 ? <Subtotals table={table} currency={currency} /> : null}
    </div>
  );
}
