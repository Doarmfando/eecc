import type { ReactNode } from 'react';

import { BankFilterPills } from '@/features/financial-center/bank-filter';
import { MOCK_MONTH_RANGE, MOCK_TRANSACTIONS } from '@/features/financial-center/mock-transactions';

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
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <ViewModeToggle value={viewMode} onChange={setViewMode} />
        <BankFilterPills
          selectedBanks={selectedBanks}
          onToggleBank={toggleBank}
          onSelectAllBanks={selectAllBanks}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <FinancialCalendarGrid
            viewMode={viewMode}
            calendarMonth={calendarMonth}
            onMonthChange={goToMonth}
            dailyFlows={dailyFlows}
            monthlyBalances={monthlyBalances}
            selectedDate={selectedDate}
            onSelectDate={selectDate}
            minMonth={MOCK_MONTH_RANGE.min}
            maxMonth={MOCK_MONTH_RANGE.max}
          />
        </div>
        <DayDetailPanel
          selectedDate={selectedDate}
          transactions={dayTransactions}
          onClear={clearSelectedDate}
        />
      </div>

      <MonthSummaryFooter summary={monthSummary} calendarMonth={calendarMonth} />
    </div>
  );
}
