import { useEffect, useState, type ReactNode } from 'react';

import { ConsolidatingLoader } from '@/features/financial-center/consolidating-loader';
import { FinancialCenter } from '@/features/financial-center/financial-center';
import { MOCK_STATEMENTS } from '@/features/financial-center/mock-transactions';
import { StatementSelector } from '@/features/financial-center/statement-selector';
import type { FinancialStatement } from '@/features/financial-center/types';

/** Simula el tiempo de un back-end cruzando saldos y movimientos de varios EECC. */
const CONSOLIDATION_DELAY_MS = 1300;

type Stage =
  | { name: 'selecting' }
  | { name: 'loading'; selectedIds: ReadonlySet<string> }
  | { name: 'ready'; statements: readonly FinancialStatement[] };

export function FinancialCenterPage(): ReactNode {
  const [stage, setStage] = useState<Stage>({ name: 'selecting' });

  useEffect(() => {
    if (stage.name !== 'loading') {
      return;
    }
    const { selectedIds } = stage;
    const timeoutId = window.setTimeout(() => {
      setStage({
        name: 'ready',
        statements: MOCK_STATEMENTS.filter((statement) => selectedIds.has(statement.id)),
      });
    }, CONSOLIDATION_DELAY_MS);
    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [stage]);

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Centro Financiero</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Flujo neto consolidado de tus estados de cuenta, por banco y por movimiento.
        </p>
      </div>

      {stage.name === 'selecting' ? (
        <StatementSelector
          statements={MOCK_STATEMENTS}
          onConfirm={(selectedIds) => {
            setStage({ name: 'loading', selectedIds });
          }}
        />
      ) : stage.name === 'loading' ? (
        <ConsolidatingLoader />
      ) : (
        <FinancialCenter statements={stage.statements} />
      )}
    </div>
  );
}
