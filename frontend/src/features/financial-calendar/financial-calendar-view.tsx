import { useMemo, type ReactNode } from 'react';

import { Card } from '@/components/ui/card';
import type { FinancialStatement } from '@/features/financial-center/types';

import { BankFilterMenu } from './bank-filter-menu';
import { CalendarMonthHeader } from './calendar-month-header';
import { DayDetailPanel } from './day-detail-panel';
import { FinancialCalendarGrid } from './financial-calendar-grid';
import { MonthSummaryFooter } from './month-summary-footer';
import {
  computeMonthRange,
  computeOpeningBalances,
  useFinancialCalendar,
} from './use-financial-calendar';
import { ViewModeToggle } from './view-mode-toggle';

/**
 * Calendario de los estados de cuenta marcados en el Historial.
 *
 * El saldo diario arranca en el saldo inicial que declara el documento más
 * antiguo de cada banco y se arrastra sumando sus movimientos; abre en el mes
 * más reciente con datos.
 */
export function FinancialCalendarView({
  statements,
}: {
  statements: readonly FinancialStatement[];
}): ReactNode {
  const transactions = useMemo(
    () => statements.flatMap((statement) => statement.movimientos),
    [statements],
  );
  const openings = useMemo(() => computeOpeningBalances(statements), [statements]);
  const range = useMemo(() => computeMonthRange(statements), [statements]);
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
    selectedDate,
    selectDate,
    clearSelectedDate,
    dailyFlows,
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
          <FinancialCalendarGrid
            viewMode={viewMode}
            calendarMonth={calendarMonth}
            dailyFlows={dailyFlows}
            monthlyBalances={monthlyBalances}
            selectedDate={selectedDate}
            onSelectDate={selectDate}
          />
        </Card>

        <MonthSummaryFooter summary={monthSummary} calendarMonth={calendarMonth} />
      </div>

      {/* En escritorio el panel arranca a la altura de la tarjeta, no de la cabecera del mes. */}
      <div className="xl:pt-14">
        <DayDetailPanel
          selectedDate={selectedDate}
          transactions={dayTransactions}
          onClear={clearSelectedDate}
        />
      </div>
    </div>
  );
}
