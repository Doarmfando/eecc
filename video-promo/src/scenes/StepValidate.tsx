import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';

import { DarkGrid } from '../components/Backgrounds';
import { CheckIcon } from '../components/Icons';
import { clamp, useEnter } from '../components/motion';
import { StepHeader } from '../components/StepHeader';
import { ANTON, COLORS, POPPINS } from '../theme';

/**
 * Cifras sintéticas, en céntimos enteros para no tocar coma flotante. Son las
 * mismas del Excel del paso 4: 12 450,00 + 3 210,50 − 1 870,25 = 13 790,25.
 */
const OPENING = 1_245_000;
const CREDITS = 321_050;
const DEBITS = 187_025;
const CLOSING = OPENING + CREDITS - DEBITS;

const formatCents = (cents: number): string => {
  const whole = Math.floor(cents / 100);
  const rest = String(cents % 100).padStart(2, '0');
  return `${whole.toLocaleString('en-US')}.${rest}`;
};

/** Las invariantes que el worker comprueba antes de dar por buena una extracción. */
const CHECKS = [
  'Totales impresos vs. suma de movimientos',
  'Saldo final = inicial + abonos − cargos',
  'Fecha, descripción e importe en cada fila',
] as const;

const SCAN_FROM = 20;
const SCAN_TO = 110;
const RECONCILED_AT = 205;

export const StepValidate: React.FC = () => {
  const frame = useCurrentFrame();
  const panel = useEnter(14);
  const scan = interpolate(frame, [SCAN_FROM, SCAN_TO], [0, 1], clamp);
  const count = (target: number, from: number) =>
    Math.round(
      interpolate(frame, [from, from + 30], [0, target], {
        ...clamp,
        easing: (t) => 1 - Math.pow(1 - t, 3),
      }),
    );
  const stamp = useEnter(RECONCILED_AT, { damping: 8, stiffness: 200, mass: 0.6 });
  const footnote = useEnter(RECONCILED_AT + 18);

  return (
    <DarkGrid>
      <StepHeader
        step={3}
        title="Todo cuadra"
        subtitle="Valida las invariantes financieras"
        dark
        accent={['cuadra']}
      />

      {/* Ecuación del saldo, con el escáner que recorre el documento detrás. */}
      <div
        style={{
          position: 'absolute',
          top: 600,
          left: 90,
          right: 90,
          borderRadius: 32,
          background: 'rgba(255,255,255,0.05)',
          border: '2px solid rgba(255,255,255,0.12)',
          padding: '30px 40px',
          overflow: 'hidden',
          opacity: panel,
          transform: `translateY(${(1 - panel) * 60}px)`,
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: `${scan * 100}%`,
            height: 6,
            background: COLORS.coral,
            boxShadow: `0 0 40px 12px ${COLORS.coral}`,
            opacity: scan > 0 && scan < 1 ? 0.9 : 0,
          }}
        />
        <Line label="Saldo inicial" value={formatCents(count(OPENING, 24))} />
        <Line label="+ Abonos" value={formatCents(count(CREDITS, 44))} color="#4ADE80" />
        <Line label="− Cargos" value={formatCents(count(DEBITS, 64))} color="#F87171" />
        <div style={{ height: 3, background: 'rgba(255,255,255,0.25)', margin: '14px 0' }} />
        <Line label="Saldo final leído" value={formatCents(count(CLOSING, 90))} big />
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 6,
            fontFamily: POPPINS,
            fontSize: 28,
            color: 'rgba(255,255,255,0.7)',
            opacity: interpolate(frame, [125, 135], [0, 1], clamp),
          }}
        >
          <span>Saldo final del banco</span>
          <span style={{ fontWeight: 700, color: COLORS.white }}>
            S/ {formatCents(CLOSING)} ✓
          </span>
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          top: 1170,
          left: 90,
          right: 90,
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        {CHECKS.map((text, index) => (
          <CheckRow key={text} text={text} delay={140 + index * 16} />
        ))}
      </div>

      {/* Sello final: atenúa lo de detrás y cae de golpe en el centro. */}
      <AbsoluteFill
        style={{
          background: 'rgba(6,10,20,0.6)',
          opacity: interpolate(frame, [RECONCILED_AT - 4, RECONCILED_AT + 4], [0, 1], clamp),
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 860,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            transform: `scale(${interpolate(stamp, [0, 1], [2.6, 1])}) rotate(-6deg)`,
            opacity: interpolate(stamp, [0, 0.15], [0, 1], clamp),
            fontFamily: ANTON,
            fontSize: 120,
            color: COLORS.white,
            background: COLORS.success,
            border: `8px solid ${COLORS.white}`,
            borderRadius: 24,
            padding: '6px 40px',
            boxShadow: '0 30px 80px rgba(22,163,74,0.55)',
          }}
        >
          RECONCILIADO
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          top: 1370,
          left: 90,
          right: 90,
          textAlign: 'center',
          fontFamily: POPPINS,
          fontWeight: 500,
          fontSize: 30,
          lineHeight: 1.35,
          color: 'rgba(255,255,255,0.8)',
          opacity: footnote,
        }}
      >
        ¿No cuadra? Queda en <b style={{ color: COLORS.coral }}>«Requiere revisión»</b>.
        <br />
        Nunca cifras inventadas.
      </div>
    </DarkGrid>
  );
};

const Line: React.FC<{ label: string; value: string; color?: string; big?: boolean }> = ({
  label,
  value,
  color = COLORS.white,
  big = false,
}) => (
  <div
    style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      fontFamily: POPPINS,
      color: COLORS.white,
      padding: '6px 0',
    }}
  >
    <span style={{ fontSize: big ? 36 : 32, fontWeight: big ? 700 : 500 }}>{label}</span>
    <span
      style={{
        fontFamily: ANTON,
        fontSize: big ? 68 : 54,
        color,
        fontVariantNumeric: 'tabular-nums',
      }}
    >
      {value}
    </span>
  </div>
);

const CheckRow: React.FC<{ text: string; delay: number }> = ({ text, delay }) => {
  const enter = useEnter(delay);
  const tick = useEnter(delay + 8, { damping: 9, stiffness: 260, mass: 0.5 });
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 20,
        fontFamily: POPPINS,
        fontWeight: 600,
        fontSize: 33,
        color: COLORS.white,
        opacity: enter,
        transform: `translateX(${(1 - enter) * 80}px)`,
      }}
    >
      <span style={{ transform: `scale(${tick})`, display: 'flex' }}>
        <CheckIcon size={50} />
      </span>
      {text}
    </div>
  );
};
