import type { ReactNode } from 'react';

import { Card } from '@/components/ui/card';
import { MOCK_MONTH_RANGE, MOCK_TRANSACTIONS } from '@/features/financial-center/mock-transactions';

import { BankFilterMenu } from './bank-filter-menu';
import { CalendarMonthHeader } from './calendar-month-header';
import { DayDetailPanel } from './day-detail-panel';
import { FinancialCalendarGrid } from './financial-calendar-grid';
import { MonthSummaryFooter } from './month-summary-footer';
import { useFinancialCalendar } from './use-financial-calendar';
import { ViewModeToggle } from './view-mode-toggle';

export function FinancialCalendarView(): ReactNode {
  const {
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
  } = useFinancialCalendar(MOCK_TRANSACTIONS, MOCK_MONTH_RANGE.max);

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <div className="space-y-4 xl:col-span-2">
        <CalendarMonthHeader
          calendarMonth={calendarMonth}
          onMonthChange={goToMonth}
          minMonth={MOCK_MONTH_RANGE.min}
          maxMonth={MOCK_MONTH_RANGE.max}
        />

        <Card className="gap-5 rounded-3xl p-3 pb-4 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <ViewModeToggle value={viewMode} onChange={setViewMode} />
            <BankFilterMenu
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
