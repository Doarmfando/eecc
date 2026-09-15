import { Search } from 'lucide-react';
import type { ReactNode } from 'react';

import { Input } from '@/components/ui/input';

export function MovementsSearch({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}): ReactNode {
  return (
    <div className="relative w-full sm:max-w-sm">
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        type="search"
        value={value}
        placeholder="Buscar por descripción: SUNAT, Nómina, Transferencia…"
        aria-label="Buscar movimientos por descripción o categoría"
        onChange={(event) => {
          onChange(event.target.value);
        }}
        className="pl-9"
      />
    </div>
  );
}
