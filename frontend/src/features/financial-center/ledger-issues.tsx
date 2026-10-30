import type { ReactNode } from 'react';

import { Alert } from '@/components/ui/alert';
import { formatCount } from '@/lib/format';

import type { Ledger } from './ledger';
import { describeIssue } from './ledger-labels';

/** Cuántos avisos se ven sin desplegar: más llenaría la pantalla de texto. */
const VISIBLE = 3;

/**
 * Lo que el consolidado encontró en los documentos: huecos, saltos de saldo,
 * periodos repetidos, documentos en revisión. Primero lo que afecta a los
 * números; lo informativo, después.
 */
export function LedgerIssues({ ledger }: { ledger: Ledger }): ReactNode {
  // Las copias apartadas ya tienen su propio aviso, encima: no se repiten aquí.
  const described = ledger.issues
    .filter((issue) => issue.kind !== 'DOCUMENTO_DUPLICADO')
    .map((issue) => describeIssue(issue, ledger))
    .sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'warning' ? -1 : 1));
  if (described.length === 0) {
    return null;
  }
  const warnings = described.filter((issue) => issue.severity === 'warning').length;
  const title =
    warnings > 0
      ? `${formatCount(warnings)} ${warnings === 1 ? 'aviso afecta' : 'avisos afectan'} a los saldos o totales`
      : `${formatCount(described.length)} ${described.length === 1 ? 'nota' : 'notas'} sobre los documentos`;
  const [visible, hidden] = [described.slice(0, VISIBLE), described.slice(VISIBLE)];

  return (
    <Alert variant={warnings > 0 ? 'warning' : 'default'} title={title}>
      <ul className="mt-1 list-disc space-y-1 pl-4">
        {visible.map((issue, index) => (
          <li key={index}>{issue.text}</li>
        ))}
      </ul>
      {hidden.length > 0 ? (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-medium text-foreground">
            Ver {formatCount(hidden.length)} más
          </summary>
          <ul className="mt-1 list-disc space-y-1 pl-4">
            {hidden.map((issue, index) => (
              <li key={index}>{issue.text}</li>
            ))}
          </ul>
        </details>
      ) : null}
    </Alert>
  );
}
