import type { ReactNode } from 'react';

import { AccountsConsolidated } from './accounts-consolidated';
import { BankFilterPills } from './bank-filter';
import { MOCK_TRANSACTIONS } from './mock-transactions';
import { MovementsList } from './movements-list';
import { NetFlowHero } from './net-flow-hero';
import { useFinancialCenter } from './use-financial-center';

export function FinancialCenter(): ReactNode {
  const {
    selectedBanks,
    toggleBank,
    selectAllBanks,
    flowTotals,
    bankBalances,
    movementGroups,
    shownMovementCount,
    totalMovementCount,
  } = useFinancialCenter(MOCK_TRANSACTIONS);

  return (
    <div className="space-y-6">
      <BankFilterPills
        selectedBanks={selectedBanks}
        onToggleBank={toggleBank}
        onSelectAllBanks={selectAllBanks}
      />

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
          />
        </div>
      </div>
    </div>
  );
}
