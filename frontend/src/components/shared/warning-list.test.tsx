import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { renderWithProviders } from '@/test/render';

import { describeArtifact } from './artifact-label';
import { ArtifactList } from './artifact-list';
import { CheckList, WarningList } from './warning-list';

describe('WarningList', () => {
  it('describe los códigos conocidos y muestra siempre el código crudo', () => {
    render(<WarningList codes={['BCP_AMOUNT_UNPARSEABLE']} />);

    expect(screen.getByText('Un importe no pudo interpretarse con certeza.')).toBeInTheDocument();
    expect(screen.getByText('BCP_AMOUNT_UNPARSEABLE')).toBeInTheDocument();
  });

  it('no oculta un código desconocido detrás de un texto vacío', () => {
    render(<WarningList codes={['BCP_CODIGO_NUEVO']} />);

    expect(screen.getByText('Advertencia del extractor.')).toBeInTheDocument();
    expect(screen.getByText('BCP_CODIGO_NUEVO')).toBeInTheDocument();
  });

  it('declara explícitamente la ausencia de advertencias', () => {
    render(<WarningList codes={[]} />);

    expect(screen.getByText('Sin advertencias.')).toBeInTheDocument();
  });
});

describe('CheckList', () => {
  it('traduce estado y descripción de cada invariante', () => {
    render(
      <CheckList
        checks={[
          { code: 'BCP_ROWS_PRESENT', status: 'PASSED' },
          { code: 'BCP_DECLARED_TOTALS', status: 'FAILED' },
          { code: 'BCP_DOCUMENT_BALANCE', status: 'SKIPPED' },
        ]}
      />,
    );

    expect(screen.getByText('Cumple')).toBeInTheDocument();
    expect(screen.getByText('No cumple')).toBeInTheDocument();
    expect(screen.getByText('No aplica')).toBeInTheDocument();
  });

  it('muestra código y estado tal cual cuando son desconocidos', () => {
    render(<CheckList checks={[{ code: 'BCP_NUEVA_REGLA', status: 'PARCIAL' }]} />);

    expect(screen.getByText('BCP_NUEVA_REGLA')).toBeInTheDocument();
    expect(screen.getByText('PARCIAL')).toBeInTheDocument();
  });

  it('avisa cuando el intento no reportó invariantes', () => {
    render(<CheckList checks={[]} />);

    expect(screen.getByText('Este intento no reportó invariantes.')).toBeInTheDocument();
  });
});

describe('ArtifactList', () => {
  it('lista los archivos con su tamaño legible', () => {
    renderWithProviders(
      <ArtifactList
        jobId="33333333-3333-4333-8333-333333333333"
        artifacts={[
          { id: '1', kind: 'RESULT_XLSX', byteSize: 2048, name: 'statement.xlsx' },
          { id: '2', kind: 'RESULT_CSV', byteSize: 512, name: 'statement_Movimientos.csv' },
          { id: '3', kind: 'FORMATO_NUEVO', byteSize: 10, name: 'otro.bin' },
        ]}
      />,
    );

    expect(screen.getByText('Excel del estado de cuenta')).toBeInTheDocument();
    expect(screen.getByText('2.0 KB')).toBeInTheDocument();
    expect(screen.getByText('CSV derivado · Movimientos')).toBeInTheDocument();
    expect(screen.getByText('FORMATO_NUEVO')).toBeInTheDocument();
  });

  it('explica por qué no hay archivos en lugar de mostrar una lista vacía', () => {
    renderWithProviders(<ArtifactList jobId="job-id" artifacts={[]} />);

    expect(screen.getByText(/no publicó archivos/)).toBeInTheDocument();
  });
});

describe('describeArtifact', () => {
  it('distingue cada CSV por la hoja que contiene', () => {
    expect(describeArtifact('RESULT_CSV', 'statement_Movimientos.csv')).toBe(
      'CSV derivado · Movimientos',
    );
    expect(describeArtifact('RESULT_CSV', 'statement_Control_Paginas.csv')).toBe(
      'CSV derivado · Control por página',
    );
  });

  it('muestra la hoja tal cual si el contrato agrega una nueva', () => {
    expect(describeArtifact('RESULT_CSV', 'statement_Intereses.csv')).toBe(
      'CSV derivado · Intereses',
    );
  });

  it('no adorna los formatos que no son CSV por hoja', () => {
    expect(describeArtifact('RESULT_XLSX', 'statement.xlsx')).toBe('Excel del estado de cuenta');
    expect(describeArtifact('SOURCE_PDF', '8f2c.pdf')).toBe('PDF original');
    expect(describeArtifact('RESULT_CSV', 'sinformato')).toBe('CSV derivado');
    expect(describeArtifact('FORMATO_NUEVO', 'x.bin')).toBe('FORMATO_NUEVO');
  });
});

describe('extractor genérico', () => {
  it('explica sus invariantes y advertencias con el mismo detalle', () => {
    render(
      <CheckList
        checks={[
          { code: 'GENERIC_BALANCE_CONTINUITY', status: 'PASSED' },
          { code: 'GENERIC_AMOUNTS_EXCLUSIVE', status: 'FAILED' },
        ]}
      />,
    );

    expect(screen.getByText('El saldo avanza de forma consistente')).toBeInTheDocument();
    expect(screen.getByText('Cargo y abono son excluyentes')).toBeInTheDocument();
  });

  it('describe por qué no pudo leer una tabla sin encabezados', () => {
    render(<WarningList codes={['GENERIC_HEADER_NOT_RECOGNISED']} />);

    expect(screen.getByText(/no se reconocieron los nombres/i)).toBeInTheDocument();
    expect(screen.getByText('GENERIC_HEADER_NOT_RECOGNISED')).toBeInTheDocument();
  });
});
