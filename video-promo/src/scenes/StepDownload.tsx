import { interpolate, useCurrentFrame } from 'remotion';

import { LightBg } from '../components/Backgrounds';
import { CheckIcon, Cursor, FileIcon } from '../components/Icons';
import { clamp, useEnter, usePress } from '../components/motion';
import { StepHeader } from '../components/StepHeader';
import { COLORS, POPPINS } from '../theme';

/**
 * Movimientos sintéticos que cuadran con el paso 3: abonos 3,210.50, cargos
 * 1,870.25, saldo de 12,450.00 a 13,790.25. Ninguno sale de un documento real.
 */
const ROWS = [
  ['03/10', 'Transferencia recibida', '', '2,500.00', '14,950.00'],
  ['05/10', 'Pago de servicio', '180.25', '', '14,769.75'],
  ['09/10', 'Compra con tarjeta', '1,240.00', '', '13,529.75'],
  ['15/10', 'Depósito en efectivo', '', '710.50', '14,240.25'],
  ['20/10', 'Pago de tarjeta', '450.00', '', '13,790.25'],
] as const;

const HEADERS = ['Fecha', 'Descripción', 'Cargo', 'Abono', 'Saldo'] as const;
const WIDTHS = ['13%', '37%', '16%', '16%', '18%'] as const;
const CLICK_AT = 150;

export const StepDownload: React.FC = () => {
  const frame = useCurrentFrame();
  const sheet = useEnter(16);
  const buttons = useEnter(110);
  const press = usePress(CLICK_AT);
  const file = useEnter(CLICK_AT + 6, { damping: 10, stiffness: 150, mass: 0.7 });
  const cursorX = interpolate(frame, [112, CLICK_AT - 6], [980, 330], {
    ...clamp,
    easing: (t) => 1 - Math.pow(1 - t, 3),
  });
  const cursorY = interpolate(frame, [112, CLICK_AT - 6], [1560, 1238], {
    ...clamp,
    easing: (t) => 1 - Math.pow(1 - t, 3),
  });

  return (
    <LightBg>
      <StepHeader
        step={4}
        title="Descarga y listo"
        subtitle="Tu Excel (.xlsx) o CSV, ordenado y validado"
        boxed={['listo']}
        boxColor={COLORS.coral}
      />

      {/* Hoja de cálculo */}
      <div
        style={{
          position: 'absolute',
          top: 600,
          left: 60,
          right: 60,
          background: COLORS.white,
          borderRadius: 26,
          overflow: 'hidden',
          boxShadow: '0 30px 80px rgba(15,23,42,0.16)',
          border: `2px solid ${COLORS.line}`,
          transform: `perspective(1600px) rotateX(${(1 - sheet) * 25}deg) translateY(${(1 - sheet) * 100}px)`,
          opacity: sheet,
          fontFamily: POPPINS,
        }}
      >
        <div style={{ display: 'flex', background: COLORS.blue, color: COLORS.white }}>
          {HEADERS.map((header, index) => (
            <div
              key={header}
              style={{
                width: WIDTHS[index],
                padding: '16px 14px',
                fontWeight: 700,
                fontSize: 25,
                textAlign: index >= 2 ? 'right' : 'left',
              }}
            >
              {header}
            </div>
          ))}
        </div>
        {ROWS.map((row, rowIndex) => (
          <SheetRow key={row[0]} cells={row} delay={34 + rowIndex * 10} striped={rowIndex % 2 === 1} />
        ))}
        <div
          style={{
            display: 'flex',
            gap: 6,
            padding: '10px 14px',
            background: '#F1F5F9',
            borderTop: `2px solid ${COLORS.line}`,
          }}
        >
          {['Resumen', 'Movimientos'].map((tab) => (
            <span
              key={tab}
              style={{
                fontSize: 22,
                fontWeight: 600,
                padding: '6px 18px',
                borderRadius: 10,
                background: tab === 'Movimientos' ? COLORS.white : 'transparent',
                color: tab === 'Movimientos' ? '#1D7A46' : COLORS.slate,
                border: tab === 'Movimientos' ? `2px solid ${COLORS.line}` : '2px solid transparent',
              }}
            >
              {tab}
            </span>
          ))}
        </div>
      </div>

      {/* Botones de descarga, con los rótulos de la interfaz real */}
      <div
        style={{
          position: 'absolute',
          top: 1190,
          left: 90,
          right: 90,
          display: 'flex',
          gap: 22,
          opacity: buttons,
          transform: `translateY(${(1 - buttons) * 40}px)`,
        }}
      >
        <div
          style={{
            flex: 1.6,
            fontFamily: POPPINS,
            fontWeight: 700,
            fontSize: 34,
            textAlign: 'center',
            color: COLORS.white,
            background: COLORS.blue,
            borderRadius: 22,
            padding: '24px 0',
            transform: `scale(${1 - press * 0.06})`,
            boxShadow: '0 16px 36px rgba(0,86,198,0.35)',
          }}
        >
          Descargar Excel (.xlsx)
        </div>
        <div
          style={{
            flex: 1,
            fontFamily: POPPINS,
            fontWeight: 700,
            fontSize: 34,
            textAlign: 'center',
            color: COLORS.blue,
            background: COLORS.white,
            border: `3px solid ${COLORS.blue}`,
            borderRadius: 22,
            padding: '21px 0',
          }}
        >
          CSV
        </div>
      </div>

      {/* El archivo descargado salta fuera */}
      <div
        style={{
          position: 'absolute',
          top: 1300,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 24,
          opacity: interpolate(file, [0, 0.2], [0, 1], clamp),
          transform: `translateY(${(1 - file) * 60}px) scale(${0.6 + 0.4 * file})`,
        }}
      >
        <FileIcon label="XLSX" color="#1D7A46" width={110} />
        <div style={{ fontFamily: POPPINS, fontWeight: 700, fontSize: 34, color: COLORS.ink }}>
          estado-de-cuenta.xlsx
        </div>
        <CheckIcon size={52} />
      </div>

      <Cursor x={cursorX} y={cursorY} press={press} />
    </LightBg>
  );
};

const SheetRow: React.FC<{ cells: readonly string[]; delay: number; striped: boolean }> = ({
  cells,
  delay,
  striped,
}) => {
  const enter = useEnter(delay);
  return (
    <div
      style={{
        display: 'flex',
        background: striped ? '#F8FAFC' : COLORS.white,
        borderTop: `1px solid ${COLORS.line}`,
        opacity: enter,
        transform: `translateX(${(1 - enter) * 60}px)`,
      }}
    >
      {cells.map((cell, index) => (
        <div
          key={index}
          style={{
            width: WIDTHS[index],
            padding: '16px 14px',
            fontSize: 24,
            fontWeight: index === 4 ? 700 : 500,
            textAlign: index >= 2 ? 'right' : 'left',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            color: index === 2 ? '#DC2626' : index === 3 ? '#15803D' : COLORS.ink,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {cell}
        </div>
      ))}
    </div>
  );
};
