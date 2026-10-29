import { interpolate, useCurrentFrame } from 'remotion';

import { LightBg } from '../components/Backgrounds';
import { CheckIcon, Cursor } from '../components/Icons';
import { clamp, useEnter, usePress } from '../components/motion';
import { StepHeader } from '../components/StepHeader';
import { COLORS, POPPINS } from '../theme';

/**
 * Réplica del selector real (`frontend/src/features/statements/bank-selector.tsx`):
 * cuatro bancos disponibles y Scotiabank «Próximamente». Se dibujan los nombres,
 * no los logotipos, para no usar marcas de terceros en un anuncio.
 */
const OPTIONS = [
  { name: 'BCP', available: true },
  { name: 'BBVA', available: true },
  { name: 'Interbank', available: true },
  { name: 'Banco de la Nación', available: true },
  { name: 'Scotiabank', available: false },
] as const;

const CARD_TOP = 600;
const ROW_HEIGHT = 92;
const ROW_GAP = 14;
const CLICK_AT = 112;
/** Fila que se elige; el puntero recorre las anteriores antes de decidirse. */
const SELECTED = 0;

export const StepBank: React.FC = () => {
  const frame = useCurrentFrame();
  const card = useEnter(18);
  const press = usePress(CLICK_AT);
  const selected = frame >= CLICK_AT + 2;
  const note = useEnter(CLICK_AT + 40);

  // El puntero entra por abajo, sube hasta Interbank, duda y baja... hasta BCP.
  const rowY = (index: number) => CARD_TOP + 90 + index * (ROW_HEIGHT + ROW_GAP) + 36;
  const cursorY = interpolate(
    frame,
    [40, 70, 85, CLICK_AT - 6],
    [1500, rowY(2), rowY(2), rowY(SELECTED)],
    { ...clamp, easing: (t) => 1 - Math.pow(1 - t, 3) },
  );
  const cursorX = interpolate(frame, [40, CLICK_AT - 6], [900, 760], clamp);

  return (
    <LightBg>
      <StepHeader
        step={1}
        title="Elige tu banco"
        subtitle="Los bancos peruanos con extractor validado"
        boxed={['banco']}
      />

      <div
        style={{
          position: 'absolute',
          top: CARD_TOP,
          left: 110,
          right: 110,
          background: COLORS.white,
          borderRadius: 36,
          padding: '34px 34px 38px',
          boxShadow: '0 30px 80px rgba(15,23,42,0.14)',
          border: `2px solid ${COLORS.line}`,
          transform: `translateY(${(1 - card) * 120}px) scale(${0.9 + card * 0.1})`,
          opacity: card,
        }}
      >
        <div
          style={{
            fontFamily: POPPINS,
            fontWeight: 700,
            fontSize: 24,
            letterSpacing: '0.14em',
            color: '#94A3B8',
            marginBottom: 22,
          }}
        >
          1. BANCO DE ORIGEN
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: ROW_GAP }}>
          {OPTIONS.map((bank, index) => (
            <BankRow
              key={bank.name}
              name={bank.name}
              available={bank.available}
              delay={26 + index * 5}
              selected={selected && index === SELECTED}
            />
          ))}
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          top: 1290,
          left: 110,
          right: 110,
          fontFamily: POPPINS,
          fontWeight: 600,
          fontSize: 34,
          lineHeight: 1.35,
          textAlign: 'center',
          color: COLORS.ink,
          background: COLORS.coralSoft,
          border: `3px solid ${COLORS.coral}`,
          borderRadius: 24,
          padding: '18px 26px',
          transform: `translateY(${(1 - note) * 40}px) scale(${0.9 + 0.1 * note})`,
          opacity: note,
        }}
      >
        ¿Marcaste otro? <span style={{ color: COLORS.coral }}>Igual detecta</span> el formato
        correcto.
      </div>

      <Cursor x={cursorX} y={cursorY} press={press} />
    </LightBg>
  );
};

const BankRow: React.FC<{
  name: string;
  available: boolean;
  delay: number;
  selected: boolean;
}> = ({ name, available, delay, selected }) => {
  const enter = useEnter(delay);
  const pick = useEnter(CLICK_AT + 2, { damping: 9, stiffness: 260, mass: 0.5 });

  return (
    <div
      style={{
        height: ROW_HEIGHT,
        display: 'flex',
        alignItems: 'center',
        padding: '0 30px',
        borderRadius: 22,
        border: selected ? `4px solid ${COLORS.blue}` : `2px solid ${COLORS.line}`,
        background: selected ? COLORS.blueSoft : available ? COLORS.white : '#F8FAFC',
        transform: `translateX(${(1 - enter) * 80}px) scale(${selected ? 1 + 0.04 * Math.sin(pick * Math.PI) : 1})`,
        opacity: enter,
      }}
    >
      <span
        style={{
          fontFamily: POPPINS,
          fontWeight: 700,
          fontSize: 40,
          color: available ? COLORS.ink : '#A3AEC0',
        }}
      >
        {name}
      </span>
      <span style={{ flex: 1 }} />
      {selected ? (
        <span style={{ transform: `scale(${pick})` }}>
          <CheckIcon size={50} color={COLORS.blue} />
        </span>
      ) : !available ? (
        <span
          style={{
            fontFamily: POPPINS,
            fontWeight: 600,
            fontSize: 24,
            color: '#94A3B8',
            background: '#EEF2F7',
            padding: '6px 16px',
            borderRadius: 999,
          }}
        >
          Próximamente
        </span>
      ) : null}
    </div>
  );
};
