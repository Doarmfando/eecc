import { useMemo, type ReactNode } from 'react';

import { Card } from '@/components/ui/card';
import { useCurrencyFilter } from '@/features/financial-center/currency-filter';
import { CurrencySwitch } from '@/features/financial-center/currency-switch';
import { buildLedger } from '@/features/financial-center/ledger';
import { MovementsSearch } from '@/features/financial-center/movements-search';
import type { FinancialStatement } from '@/features/financial-center/types';
import { formatCount, formatMoney, type Currency } from '@/lib/format';

import { BankFilterMenu } from './bank-filter-menu';
import { CalendarMonthHeader } from './calendar-month-header';
import { DayDetailPanel } from './day-detail-panel';
import { FinancialCalendarGrid } from './financial-calendar-grid';
import { GlobalSearchResults } from './global-search-results';
import { MonthSummaryFooter } from './month-summary-footer';
import {
  computeMonthRange,
  computeOpeningBalances,
  type SearchSummary,
  useFinancialCalendar,
} from './use-financial-calendar';
import { ViewModeToggle } from './view-mode-toggle';

/**
 * Calendario de los estados de cuenta marcados en el Historial.
 *
 * El saldo diario arranca en el saldo inicial que declara el documento más
 * antiguo de cada banco y se arrastra sumando sus movimientos; abre en el mes
 * más reciente con datos. Una moneda a la vez: con cuentas en soles y en
 * dólares se elige cuál ver, porque sus saldos no se pueden sumar.
 */
export function FinancialCalendarView({
  statements,
}: {
  statements: readonly FinancialStatement[];
}): ReactNode {
  const filter = useCurrencyFilter(statements);

  return (
    <div className="space-y-6">
      {filter.currencies.length > 1 ? (
        <CurrencySwitch
          currencies={filter.currencies}
          value={filter.currency}
          onChange={filter.setCurrency}
        />
      ) : null}
      {/* La clave reinicia mes, banco y día: los de una moneda no valen en la otra. */}
      <CurrencyCalendar
        key={filter.currency}
        statements={filter.statements}
        currency={filter.currency}
      />
    </div>
  );
}

/** «3 movimientos coinciden · neto −S/ 120.00». */
function describeSearch(summary: SearchSummary, currency: Currency): string {
  if (summary.count === 0) {
    return 'Ningún movimiento del mes coincide.';
  }
  const verb = summary.count === 1 ? 'movimiento coincide' : 'movimientos coinciden';
  const sign = summary.netCents < 0 ? '−' : '+';
  return `${formatCount(summary.count)} ${verb} · neto ${sign}${formatMoney(Math.abs(summary.netCents), currency)}`;
}

function CurrencyCalendar({
  statements,
  currency,
}: {
  statements: readonly FinancialStatement[];
  currency: Currency;
}): ReactNode {
  // La misma consolidación que el Centro Financiero: una copia exacta no cuenta
  // dos veces, y el saldo inicial se toma por cuenta, no por banco.
  const ledger = useMemo(() => buildLedger(statements), [statements]);
  const included = ledger.statements;
  const transactions = useMemo(
    () => included.flatMap((statement) => statement.movimientos),
    [included],
  );
  const openings = useMemo(
    () =>
      computeOpeningBalances(
        included,
        (statement) => ledger.accountOf(statement.id)?.key ?? statement.bancoOrigen,
      ),
    [included, ledger],
  );
  const periodOf = useMemo(() => {
    const periods = new Map(included.map((statement) => [statement.id, statement.fechaPeriodo]));
    return (statementId: string) => periods.get(statementId);
  }, [included]);
  const range = useMemo(() => computeMonthRange(included), [included]);
  const minMonth = range?.min ?? '';
  const maxMonth = range?.max ?? '';

  const {
    banks,
    selectedBanks,
    toggleBank,
    selectAllBanks,
    viewMode,
    setViewMode,
    calendarMonth,
    goToMonth,
    goToDate,
    selectedDate,
    selectDate,
    clearSelectedDate,
    dailyFlows,
    search,
    setSearch,
    matchFlows,
    searchSummary,
    globalMatches,
    monthlyBalances,
    monthSummary,
    dayTransactions,
  } = useFinancialCalendar(transactions, maxMonth, openings);

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <div className="space-y-4 xl:col-span-2">
        <CalendarMonthHeader
          calendarMonth={calendarMonth}
          onMonthChange={goToMonth}
          minMonth={minMonth}
          maxMonth={maxMonth}
        />

        <Card className="gap-5 rounded-3xl p-3 pb-4 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <ViewModeToggle value={viewMode} onChange={setViewMode} />
            <BankFilterMenu
              banks={banks}
              selectedBanks={selectedBanks}
              onToggleBank={toggleBank}
              onSelectAllBanks={selectAllBanks}
            />
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <MovementsSearch value={search} onChange={setSearch} />
            {searchSummary ? (
              <p className="text-xs text-muted-foreground" aria-live="polite">
                {describeSearch(searchSummary, currency)}
              </p>
            ) : null}
          </div>
          <FinancialCalendarGrid
            viewMode={viewMode}
            currency={currency}
            calendarMonth={calendarMonth}
            dailyFlows={dailyFlows}
            matchFlows={matchFlows}
            monthlyBalances={monthlyBalances}
            selectedDate={selectedDate}
            onSelectDate={selectDate}
          />
        </Card>

        <MonthSummaryFooter
          summary={monthSummary}
          currency={currency}
          calendarMonth={calendarMonth}
        />
      </div>

      {/* En escritorio el panel arranca a la altura de la tarjeta, no de la cabecera del mes. */}
      <div className="space-y-4 xl:pt-14">
        {globalMatches ? (
          // La clave vuelve a la primera página de resultados con cada búsqueda nueva.
          <GlobalSearchResults
            key={search.trim()}
            search={search}
            matches={globalMatches}
            periodOf={periodOf}
            selectedDate={selectedDate}
            onGoToDate={goToDate}
          />
        ) : null}
        <DayDetailPanel
          selectedDate={selectedDate}
          transactions={dayTransactions}
          onClear={clearSelectedDate}
        />
      </div>
    </div>
  );
}
