import type { ReactNode } from 'react';

import { BankDistributionCard, FlowBreakdownCard } from './analytics-panels';
import { FilterBar } from './filter-bar';
import { KpiCards } from './kpi-cards';
import { MOCK_MONTH_RANGE, MOCK_TRANSACTIONS } from './mock-transactions';
import { RecentTransactionsCard } from './recent-transactions';
import { useFinancialCenter } from './use-financial-center';

export function FinancialCenter(): ReactNode {
  const {
    selectedBanks,
    toggleBank,
    selectAllBanks,
    search,
    setSearch,
    monthFrom,
    setMonthFrom,
    monthTo,
    setMonthTo,
    filtered,
    kpis,
    bankDistribution,
    flowBreakdown,
  } = useFinancialCenter(MOCK_TRANSACTIONS);

  return (
    <div className="space-y-6">
      <FilterBar
        selectedBanks={selectedBanks}
        onToggleBank={toggleBank}
        onSelectAllBanks={selectAllBanks}
        search={search}
        onSearchChange={setSearch}
        monthFrom={monthFrom}
        onMonthFromChange={setMonthFrom}
        monthTo={monthTo}
        onMonthToChange={setMonthTo}
        monthBounds={MOCK_MONTH_RANGE}
      />

      <KpiCards kpis={kpis} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        <div className="flex flex-col gap-6 xl:col-span-3">
          <BankDistributionCard items={bankDistribution} />
          <FlowBreakdownCard breakdown={flowBreakdown} />
        </div>
        <div className="xl:col-span-2">
          <RecentTransactionsCard transactions={filtered} search={search} />
        </div>
      </div>
    </div>
  );
}
