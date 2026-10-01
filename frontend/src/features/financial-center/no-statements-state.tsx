import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

/**
 * Lo que ven el Centro Financiero y el Calendario cuando no hay nada que
 * consolidar: o la persona todavía no procesó ningún documento, o los desmarcó
 * todos en el Historial.
 */
export function NoStatementsState({
  reason,
}: {
  reason: 'sin-documentos' | 'ninguno-marcado';
}): ReactNode {
  const sinDocumentos = reason === 'sin-documentos';
  return (
    <Card className="mx-auto w-full max-w-2xl items-center gap-3 rounded-2xl py-12 text-center">
      <p className="text-base font-semibold text-foreground">
        {sinDocumentos
          ? 'Todavía no tienes documentos que consolidar'
          : 'No hay documentos marcados para analizar'}
      </p>
      <p className="max-w-md text-sm text-muted-foreground">
        {sinDocumentos
          ? 'Aquí se cruzan los estados de cuenta que ya procesaste. Sube uno y aparecerá en cuanto termine.'
          : 'Marca en el Historial los estados de cuenta que quieres ver aquí.'}
      </p>
      <Button asChild>
        {sinDocumentos ? (
          <Link to="/">Subir un estado de cuenta</Link>
        ) : (
          <Link to="/historial">Ir al Historial</Link>
        )}
      </Button>
    </Card>
  );
}

/** Acceso a la selección, que ahora vive en el Historial. */
export function ChooseInHistoryLink(): ReactNode {
  return (
    <Button asChild variant="outline">
      <Link to="/historial">Elegir documentos en el Historial</Link>
    </Button>
  );
}
