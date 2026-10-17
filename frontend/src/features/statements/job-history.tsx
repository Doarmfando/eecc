import { Check, Search } from 'lucide-react';
import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { StatusBadge } from '@/components/shared/status-badge';
import { statusLabel } from '@/components/shared/status-labels';
import { Alert } from '@/components/ui/alert';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { BANK_ACCENTS, bankFromExtractor } from '@/features/financial-center/bank-accent';
import { BankMark } from '@/features/financial-center/bank-mark';
import { useFinancialStatements } from '@/features/financial-center/queries';
import type { AccountType, FinancialStatement } from '@/features/financial-center/types';
import { describeError } from '@/lib/api-error';
import { CURRENCY_NAMES, currencySymbol, formatCount, type Currency } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { JobListItem } from '@/types/job';

import { formatProcessedAt } from './format-processed-at';
import { useJobHistory } from './queries';
import { RetentionNotice } from './retention-notice';
import {
  isConsolidable,
  useStatementSelection,
  type StatementSelection,
} from './statement-selection';

/** Lo que distingue a un documento de otro del mismo banco: su mes, su moneda y su cuenta. */
interface StatementLabel {
  period: string;
  currencyCode: Currency;
  currency: string;
  /** Solo cuando el documento lo declara; si no, la fila no lo inventa. */
  accountType: AccountType | null;
}

const CURRENCY_ORDER: readonly Currency[] = ['PEN', 'USD'];
const ACCOUNT_TYPE_ORDER: readonly AccountType[] = ['AHORRO', 'CORRIENTE'];

/** Cómo se lee en la fila del documento. */
const ACCOUNT_TYPE_NAMES: Record<AccountType, string> = {
  AHORRO: 'Cuenta de ahorro',
  CORRIENTE: 'Cuenta corriente',
};

/** Cómo se lee en el filtro, donde «cuenta» ya lo dice el grupo. */
const ACCOUNT_TYPE_CHIPS: Record<AccountType, string> = {
  AHORRO: 'Ahorro',
  CORRIENTE: 'Corriente',
};

/** Filtro por chips: `null` muestra todos los documentos. */
function FilterChips<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: ReadonlyArray<{ value: T; label: ReactNode }>;
  value: T | null;
  onChange: (value: T | null) => void;
}): ReactNode {
  const all: ReadonlyArray<{ key: string; value: T | null; label: ReactNode }> = [
    { key: 'todas', value: null, label: 'Todas' },
    ...options.map((option) => ({ key: option.value, ...option })),
  ];
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex gap-1 rounded-xl bg-muted p-1">
      {all.map((option) => {
        const active = value === option.value;
        return (
          <button
            key={option.key}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => {
              onChange(option.value);
            }}
            className={cn(
              'cursor-pointer rounded-lg border px-3 py-1 text-sm font-medium transition-colors',
              active
                ? 'border-primary/30 bg-primary/10 text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Periodo, moneda y tipo de cuenta de cada documento, leídos de sus CSV publicados.
 *
 * Comparte caché con el Centro Financiero y el Calendario (misma clave de
 * consulta), así que abrir esas vistas después no vuelve a descargar nada.
 */
function useStatementLabels(jobs: readonly JobListItem[]): Map<string, StatementLabel> {
  const consolidables = useMemo(() => jobs.filter(isConsolidable), [jobs]);
  const { statements } = useFinancialStatements(consolidables);
  return useMemo(
    () =>
      new Map(
        statements.map((statement: FinancialStatement) => [
          statement.id,
          {
            period: statement.periodoLabel,
            currencyCode: statement.moneda,
            currency: `${currencySymbol(statement.moneda)} ${CURRENCY_NAMES[statement.moneda]}`,
            accountType: statement.tipoCuenta ?? null,
          },
        ]),
      ),
    [statements],
  );
}

/** Minúsculas y sin tildes: «nacion» encuentra «Nación». */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

/** Todo lo que se ve en la fila, para que el buscador filtre por lo mismo que se lee. */
function rowText(job: JobListItem, label: StatementLabel | undefined): string {
  return normalize(
    [
      job.sourceFileName ?? '',
      BANK_ACCENTS[bankFromExtractor(job.extractorId)].name,
      statusLabel(job.status),
      formatProcessedAt(job.createdAt),
      label?.period ?? '',
      label?.currency ?? '',
      label?.accountType ? ACCOUNT_TYPE_NAMES[label.accountType] : '',
      `${formatCount(job.movementCount)} movimientos`,
      job.warningCount > 0 ? 'advertencias' : '',
    ].join(' '),
  );
}

function HistoryRow({
  job,
  label,
  selection,
}: {
  job: JobListItem;
  label: StatementLabel | undefined;
  selection: StatementSelection;
}): ReactNode {
  const consolidable = isConsolidable(job);
  const included = consolidable && selection.isIncluded(job.jobId);
  const bankId = bankFromExtractor(job.extractorId);
  const accent = BANK_ACCENTS[bankId];
  return (
    <li className="flex items-center gap-2">
      <Link
        to={`/jobs/${job.jobId}`}
        className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-1 rounded-md px-2 py-3 hover:bg-accent"
      >
        <span className="flex min-w-0 basis-full items-center gap-2.5 sm:basis-80">
          <span className="flex size-10 shrink-0 items-center justify-center text-muted-foreground">
            <BankMark bankId={bankId} className="max-h-6 w-9" />
          </span>
          <span className="flex min-w-0 flex-col">
            <span
              className="line-clamp-2 text-sm font-medium break-words text-foreground [overflow-wrap:anywhere]"
              title={job.sourceFileName ?? accent.name}
            >
              {job.sourceFileName ?? accent.name}
            </span>
            {job.sourceFileName ? (
              <span className="text-xs text-muted-foreground">{accent.name}</span>
            ) : null}
            {label ? (
              <span className="truncate text-xs text-muted-foreground">
                {label.period} · {label.currency}
                {label.accountType ? ` · ${ACCOUNT_TYPE_NAMES[label.accountType]}` : ''}
              </span>
            ) : null}
          </span>
        </span>
        <StatusBadge status={job.status} />
        <span className="flex-1 text-sm whitespace-nowrap">{formatProcessedAt(job.createdAt)}</span>
        <span className="text-xs text-muted-foreground">
          {formatCount(job.movementCount)} movimientos · {formatCount(job.artifactCount)} archivos
          {job.warningCount > 0 ? ` · ${formatCount(job.warningCount)} advertencias` : ''}
        </span>
      </Link>
      {/* Fuera del enlace: marcar no debe abrir el documento. Uno sin archivos
          publicados no tiene movimientos que analizar, así que no se ofrece. */}
      <span className="flex w-10 shrink-0 justify-center">
        {consolidable ? (
          <label
            title="Incluir en el Centro Financiero y el Calendario"
            className="relative flex size-8 cursor-pointer items-center justify-center rounded-md hover:bg-accent"
          >
            <input
              type="checkbox"
              checked={included}
              aria-label={`Incluir el documento del ${formatProcessedAt(job.createdAt)} en el análisis`}
              onChange={(event) => {
                selection.setIncluded(job.jobId, event.target.checked);
              }}
              className={cn(
                'peer size-5 cursor-pointer appearance-none rounded-[0.3rem] border-2 border-muted-foreground/40 bg-background transition-colors',
                'hover:border-primary/60 checked:border-primary checked:bg-primary',
                'focus-visible:outline-ring focus-visible:outline-2 focus-visible:outline-offset-2',
              )}
            />
            <Check
              aria-hidden
              strokeWidth={3}
              className="pointer-events-none absolute size-3.5 text-primary-foreground opacity-0 transition-opacity peer-checked:opacity-100"
            />
          </label>
        ) : null}
      </span>
    </li>
  );
}

const NO_JOBS: readonly JobListItem[] = [];

export function JobHistory(): ReactNode {
  const history = useJobHistory();
  const selection = useStatementSelection();
  const [query, setQuery] = useState('');
  const [chosenCurrency, setChosenCurrency] = useState<Currency | null>(null);
  const [chosenAccountType, setChosenAccountType] = useState<AccountType | null>(null);
  const items = history.data?.items ?? NO_JOBS;
  const labels = useStatementLabels(items);
  const hasConsolidable = items.some(isConsolidable);

  // Solo los valores de los documentos listados; con uno solo no hay nada que filtrar.
  const present = new Set([...labels.values()].map((label) => label.currencyCode));
  const currencies = CURRENCY_ORDER.filter((currency) => present.has(currency));
  const currency =
    chosenCurrency !== null && currencies.includes(chosenCurrency) ? chosenCurrency : null;

  const presentTypes = new Set([...labels.values()].map((label) => label.accountType));
  const accountTypes = ACCOUNT_TYPE_ORDER.filter((type) => presentTypes.has(type));
  const accountType =
    chosenAccountType !== null && accountTypes.includes(chosenAccountType)
      ? chosenAccountType
      : null;

  const terms = normalize(query).split(/\s+/).filter(Boolean);
  const visible = items.filter((job) => {
    const label = labels.get(job.jobId);
    // Un documento sin moneda conocida (fallido o aún cargando) no es de ninguna.
    if (currency !== null && label?.currencyCode !== currency) {
      return false;
    }
    // Ni de ningún tipo de cuenta si su documento no lo declara.
    if (accountType !== null && label?.accountType !== accountType) {
      return false;
    }
    const text = rowText(job, label);
    return terms.every((term) => text.includes(term));
  });

  if (history.isError) {
    return <Alert variant="destructive" title={describeError(history.error)} />;
  }

  return (
    <Card>
      <RetentionNotice />

      {history.isPending ? (
        <p className="text-sm text-muted-foreground">Cargando el historial…</p>
      ) : history.data.items.length > 0 ? (
        <>
          {hasConsolidable ? (
            <p className="text-xs text-muted-foreground">
              Marca los documentos que quieres ver en el Centro Financiero y el Calendario.
            </p>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full sm:max-w-sm">
              <Search
                aria-hidden
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                type="search"
                value={query}
                placeholder="Buscar por archivo, banco, mes o moneda…"
                aria-label="Buscar en el historial"
                onChange={(event) => {
                  setQuery(event.target.value);
                }}
                className="pl-9"
              />
            </div>
            {currencies.length > 1 ? (
              <FilterChips
                label="Moneda"
                options={currencies.map((code) => ({
                  value: code,
                  label: (
                    <>
                      <span className="font-semibold">{currencySymbol(code)}</span>{' '}
                      {CURRENCY_NAMES[code]}
                    </>
                  ),
                }))}
                value={currency}
                onChange={setChosenCurrency}
              />
            ) : null}
            {accountTypes.length > 1 ? (
              <FilterChips
                label="Tipo de cuenta"
                options={accountTypes.map((type) => ({
                  value: type,
                  label: ACCOUNT_TYPE_CHIPS[type],
                }))}
                value={accountType}
                onChange={setChosenAccountType}
              />
            ) : null}
          </div>
          {visible.length > 0 ? (
            <ul className="divide-y divide-border">
              {visible.map((job) => (
                <HistoryRow
                  key={job.jobId}
                  job={job}
                  label={labels.get(job.jobId)}
                  selection={selection}
                />
              ))}
            </ul>
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Ningún documento coincide con el filtro.
            </p>
          )}
          {history.data.nextCursor === null ? null : (
            <p className="text-xs text-muted-foreground">
              Se muestran los más recientes; hay documentos más antiguos.
            </p>
          )}
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Todavía no has procesado ningún documento.</p>
      )}
    </Card>
  );
}
