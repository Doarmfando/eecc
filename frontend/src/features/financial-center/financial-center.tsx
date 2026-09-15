import type { ReactNode } from 'react';

import { AccountsConsolidated } from './accounts-consolidated';
import { BankFilterPills } from './bank-filter';
import { MOCK_TRANSACTIONS } from './mock-transactions';
import { MovementsList } from './movements-list';
import { MovementsSearch } from './movements-search';
import { NetFlowHero } from './net-flow-hero';
import { useFinancialCenter } from './use-financial-center';

export function FinancialCenter(): ReactNode {
  const {
    selectedBanks,
    toggleBank,
    selectAllBanks,
    search,
    setSearch,
    flowTotals,
    bankBalances,
    movementGroups,
    shownMovementCount,
    totalMovementCount,
    canShowMore,
    canShowLess,
    showMore,
    showLess,
  } = useFinancialCenter(MOCK_TRANSACTIONS);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <BankFilterPills
          selectedBanks={selectedBanks}
          onToggleBank={toggleBank}
          onSelectAllBanks={selectAllBanks}
        />
        <MovementsSearch value={search} onChange={setSearch} />
      </div>

      <NetFlowHero totals={flowTotals} />

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
