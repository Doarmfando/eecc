import { LayoutDashboard, Table2 } from 'lucide-react';
import { useCallback, useMemo, useState, type ReactNode } from 'react';

import { Alert } from '@/components/ui/alert';
import type { Currency } from '@/lib/format';
import { getMonthShortLabel } from '@/lib/month';

import { AccountsConsolidated } from './accounts-consolidated';
import { AccumulatedPanel } from './accumulated-panel';
import { BankFilterPills } from './bank-filter';
import { useCurrencyFilter } from './currency-filter';
import { CurrencySwitch } from './currency-switch';
import { accountsForBanks, buildLedger } from './ledger';
import { rowsInScope } from './ledger-filters';
import { LedgerIssues } from './ledger-issues';
import { documentLabel } from './ledger-labels';
import { LedgerTable } from './ledger-table';
import { PeriodPicker } from './period-picker';
import { MovementsList } from './movements-list';
import { MovementsSearch } from './movements-search';
import { NetFlowHero } from './net-flow-hero';
import { SegmentedControl } from './segmented-control';
import type { FinancialStatement } from './types';
import { useFinancialCenter } from './use-financial-center';

type Visualization = 'panel' | 'tabla';

const VISUALIZATION_OPTIONS = [
  {
    value: 'panel',
    label: 'Panel',
    icon: <LayoutDashboard aria-hidden className="size-4" />,
  },
  { value: 'tabla', label: 'Tabla', icon: <Table2 aria-hidden className="size-4" /> },
] as const;

const SCOPE_OPTIONS = [
  { value: 'periodo', label: 'Periodo' },
  { value: 'acumulado', label: 'Acumulado' },
] as const;

export function FinancialCenter({
  statements,
}: {
  statements: readonly FinancialStatement[];
}): ReactNode {
  const filter = useCurrencyFilter(statements);
  // La vista elegida sobrevive al cambio de moneda; mes, bancos y búsqueda no.
  const [visualization, setVisualization] = useState<Visualization>('panel');

  return (
    <div className="space-y-6">
      {filter.currencies.length > 1 ? (
        <CurrencySwitch
          currencies={filter.currencies}
          value={filter.currency}
          onChange={filter.setCurrency}
        />
      ) : null}
      {/* La clave reinicia bancos, búsqueda y mes: los de una moneda no valen en la otra. */}
      <CurrencyCenter
        key={filter.currency}
        statements={filter.statements}
        currency={filter.currency}
        visualization={visualization}
        onVisualizationChange={setVisualization}
      />
    </div>
  );
}

/** El consolidado de los documentos de una sola moneda. */
function CurrencyCenter({
  statements,
  currency,
  visualization,
  onVisualizationChange,
}: {
  statements: readonly FinancialStatement[];
  currency: Currency;
  visualization: Visualization;
  onVisualizationChange: (visualization: Visualization) => void;
}): ReactNode {
  // Una sola consolidación para el panel y la tabla: cuentas, copias exactas apartadas
  // y movimientos anexados.
  const ledger = useMemo(() => buildLedger(statements), [statements]);
  const accountKeyOf = useCallback(
    (statement: FinancialStatement) => ledger.accountOf(statement.id)?.key ?? statement.bancoOrigen,
    [ledger],
  );

  const {
    scope,
    setScope,
    banks,
    selectedBanks,
    toggleBank,
    selectAllBanks,
    search,
    setSearch,
    calendarMonth,
    availableMonths,
    goToMonth,
    goToPreviousMonth,
    goToNextMonth,
    canGoPreviousMonth,
    canGoNextMonth,
    periodSummary,
    bankBalances,
    movementGroups,
    shownMovementCount,
    totalMovementCount,
    canShowMore,
    canShowLess,
    showMore,
    showLess,
  } = useFinancialCenter(ledger.statements, accountKeyOf);

  const scopeRows = useMemo(
    () => rowsInScope(ledger.rows, scope, calendarMonth),
    [ledger.rows, scope, calendarMonth],
  );
  const visibleAccounts = useMemo(
    () => accountsForBanks(ledger.accounts, selectedBanks),
    [ledger.accounts, selectedBanks],
  );
  const periodLabelOf = useMemo(() => {
    const labels = new Map(
      ledger.statements.map((statement) => [
        statement.id,
        getMonthShortLabel(statement.fechaPeriodo),
      ]),
    );
    return (statementId: string) => labels.get(statementId);
  }, [ledger.statements]);
  const accumulatedMovements = visibleAccounts.reduce(
    (total, account) =>
      total + account.statements.reduce((sum, statement) => sum + statement.movimientos.length, 0),
    0,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          label="Alcance de la consulta"
          value={scope}
          options={SCOPE_OPTIONS}
          onChange={setScope}
        />
        <SegmentedControl
          label="Visualización"
          value={visualization}
          options={VISUALIZATION_OPTIONS}
          onChange={onVisualizationChange}
        />
      </div>

      {scope === 'periodo' ? (
        <PeriodPicker
          calendarMonth={calendarMonth}
          availableMonths={availableMonths}
          onGoToMonth={goToMonth}
          onPrevious={goToPreviousMonth}
          onNext={goToNextMonth}
          canGoPrevious={canGoPreviousMonth}
          canGoNext={canGoNextMonth}
        />
      ) : (
        <div>
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Periodo
          </p>
          <p className="text-xl font-bold tracking-tight text-foreground sm:text-2xl">
            Todos los periodos
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-4">
        <BankFilterPills
          banks={banks}
          selectedBanks={selectedBanks}
          onToggleBank={toggleBank}
          onSelectAllBanks={selectAllBanks}
        />
        <MovementsSearch value={search} onChange={setSearch} />
      </div>

      {ledger.excluded.length > 0 ? (
        <Alert
          title={
            ledger.excluded.length === 1
              ? 'Un documento repetido se cuenta una sola vez'
              : `${String(ledger.excluded.length)} documentos repetidos se cuentan una sola vez`
          }
        >
          {ledger.excluded
            .map(
              ({ statement, duplicateOf }) =>
                `«${documentLabel(statement)}» es una copia exacta de «${documentLabel(duplicateOf)}».`,
            )
            .join(' ')}{' '}
          Puedes desmarcarlo en el Historial.
        </Alert>
      ) : null}

      {scope === 'acumulado' || visualization === 'tabla' ? <LedgerIssues ledger={ledger} /> : null}

      {visualization === 'tabla' ? (
        <LedgerTable
          rows={scopeRows}
          scope={scope}
          banks={selectedBanks}
          search={search}
          currency={currency}
        />
      ) : scope === 'acumulado' ? (
        <>
          <AccumulatedPanel
            accounts={visibleAccounts}
            currency={currency}
            movementCount={accumulatedMovements}
          />
          <MovementsList
            groups={movementGroups}
            totalCount={totalMovementCount}
            shownCount={shownMovementCount}
            search={search}
            canShowMore={canShowMore}
            canShowLess={canShowLess}
            onShowMore={showMore}
            onShowLess={showLess}
            periodLabelOf={periodLabelOf}
          />
        </>
      ) : (
        <>
          <NetFlowHero summary={periodSummary} currency={currency} />

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
            <div className="xl:col-span-2">
              <AccountsConsolidated
                balances={bankBalances}
                selectedBanks={selectedBanks}
                currency={currency}
              />
            </div>
            <div className="xl:col-span-3">
              <MovementsList
                groups={movementGroups}
                totalCount={totalMovementCount}
                shownCount={shownMovementCount}
                search={search}
                canShowMore={canShowMore}
                canShowLess={canShowLess}
                onShowMore={showMore}
                onShowLess={showLess}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
