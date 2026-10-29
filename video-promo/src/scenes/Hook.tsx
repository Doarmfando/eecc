import { interpolate, useCurrentFrame } from 'remotion';

import { DarkGrid } from '../components/Backgrounds';
import { FileIcon } from '../components/Icons';
import { KineticWords } from '../components/KineticWords';
import { clamp, useEnter, useShake } from '../components/motion';
import { BANKS, COLORS, POPPINS, SAFE } from '../theme';

/** Tecla de teclado que rebota: el trabajo manual de copiar y pegar. */
const Keycap: React.FC<{ label: string; delay: number; x: number; y: number; tilt: number }> = ({
  label,
  delay,
  x,
  y,
  tilt,
}) => {
  const frame = useCurrentFrame();
  const enter = useEnter(delay);
  const bob = Math.sin((frame - delay) / 5) * 8;
  const press = (frame - delay) % 18 < 4 ? 8 : 0;

  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y + bob,
        transform: `scale(${enter}) rotate(${tilt}deg)`,
        fontFamily: POPPINS,
        fontWeight: 700,
        fontSize: 40,
        color: COLORS.ink,
        background: COLORS.white,
        padding: '16px 26px',
        borderRadius: 18,
        boxShadow: `0 ${12 - press}px 0 #B8C2D3, 0 ${24 - press}px 30px rgba(0,0,0,0.35)`,
        marginTop: press,
      }}
    >
      {label}
    </div>
  );
};

export const Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const shake = useShake(30, 14, 12);
  const pdf = useEnter(0);
  const xls = useEnter(8);
  const arrowDraw = interpolate(frame, [10, 40], [0, 1], clamp);
  const chipsLabel = useEnter(78);

  return (
    <DarkGrid>
      {/* PDF → hoja a mano: dos archivos y una flecha punteada que avanza a trompicones. */}
      <div
        style={{
          position: 'absolute',
          top: SAFE.top + 30,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: 60,
        }}
      >
        <div style={{ transform: `translateY(${(1 - pdf) * -200}px) rotate(${-8 + Math.sin(frame / 9) * 2}deg)`, opacity: pdf }}>
          <FileIcon label="PDF" color="#E5484D" width={170} />
        </div>
        <svg width="220" height="40" viewBox="0 0 220 40">
          <line
            x1="0"
            y1="20"
            x2={220 * arrowDraw}
            y2="20"
            stroke={COLORS.coral}
            strokeWidth="8"
            strokeDasharray="14 14"
            strokeLinecap="round"
          />
        </svg>
        <div style={{ transform: `translateY(${(1 - xls) * -200}px) rotate(${7 + Math.sin(frame / 11) * 2}deg)`, opacity: xls }}>
          <FileIcon label="XLS" color="#1D7A46" width={170} />
        </div>
      </div>

      <Keycap label="Ctrl + C" delay={14} x={70} y={560} tilt={-10} />
      <Keycap label="Ctrl + V" delay={22} x={720} y={590} tilt={9} />

      <div
        style={{
          position: 'absolute',
          top: 760,
          left: SAFE.side - 20,
          right: SAFE.side - 20,
          transform: `translateX(${shake}px)`,
        }}
      >
        <KineticWords
          text="¿Cansado de pasar | a mano tus | estados de cuenta | a Excel?"
          size={120}
          stagger={3}
          delay={4}
          accent={['mano']}
          boxed={['Excel?']}
        />
      </div>

      <div
        style={{
          position: 'absolute',
          top: 1290,
          left: SAFE.side,
          right: SAFE.side,
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: 16,
        }}
      >
        {BANKS.map((bank, index) => (
          <BankChip key={bank} name={bank} delay={70 + index * 6} />
        ))}
        <div
          style={{
            fontFamily: POPPINS,
            fontWeight: 700,
            fontSize: 30,
            letterSpacing: '0.2em',
            color: COLORS.coral,
            width: '100%',
            textAlign: 'center',
            marginTop: 6,
            opacity: chipsLabel,
          }}
        >
          ESTADOS DE CUENTA · PERÚ
        </div>
      </div>
    </DarkGrid>
  );
};

const BankChip: React.FC<{ name: string; delay: number }> = ({ name, delay }) => {
  const enter = useEnter(delay, { damping: 10, stiffness: 220, mass: 0.5 });
  return (
    <div
      style={{
        fontFamily: POPPINS,
        fontWeight: 700,
        fontSize: 38,
        color: COLORS.white,
        border: '3px solid rgba(255,255,255,0.35)',
        background: 'rgba(0,86,198,0.35)',
        padding: '10px 26px',
        borderRadius: 999,
        transform: `scale(${enter})`,
      }}
    >
      {name}
    </div>
  );
};
