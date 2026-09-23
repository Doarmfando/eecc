import type { ReactNode } from 'react';

import { AccountsConsolidated } from './accounts-consolidated';
import { BankFilterPills } from './bank-filter';
import { MovementsList } from './movements-list';
import { MovementsSearch } from './movements-search';
import { NetFlowHero } from './net-flow-hero';
import type { FinancialStatement } from './types';
import { useFinancialCenter } from './use-financial-center';

export function FinancialCenter({
  statements,
}: {
  statements: readonly FinancialStatement[];
}): ReactNode {
  const {
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
  } = useFinancialCenter(statements);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <BankFilterPills
          banks={banks}
          selectedBanks={selectedBanks}
          onToggleBank={toggleBank}
          onSelectAllBanks={selectAllBanks}
        />
        <MovementsSearch value={search} onChange={setSearch} />
      </div>

      <NetFlowHero
        summary={periodSummary}
        calendarMonth={calendarMonth}
        availableMonths={availableMonths}
        onGoToMonth={goToMonth}
        onPreviousMonth={goToPreviousMonth}
        onNextMonth={goToNextMonth}
        canGoPreviousMonth={canGoPreviousMonth}
        canGoNextMonth={canGoNextMonth}
      />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-5">
        <div className="xl:col-span-2">
          <AccountsConsolidated balances={bankBalances} selectedBanks={selectedBanks} />
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
    </div>
  );
}
