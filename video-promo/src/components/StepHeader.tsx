import { interpolate } from 'remotion';

import { COLORS, POPPINS, SAFE } from '../theme';
import { KineticWords } from './KineticWords';
import { useEnter } from './motion';

/** Cabecera común de los pasos: chip «PASO N», título cinético y subtítulo. */
export const StepHeader: React.FC<{
  step: number;
  title: string;
  subtitle: string;
  dark?: boolean;
  accent?: string[];
  boxed?: string[];
  boxColor?: string;
}> = ({ step, title, subtitle, dark = false, accent, boxed, boxColor }) => {
  const chip = useEnter(2);
  const sub = useEnter(22);

  return (
    <div
      style={{
        position: 'absolute',
        top: SAFE.top + 40,
        left: SAFE.side,
        right: SAFE.side,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 22,
      }}
    >
      <div
        style={{
          fontFamily: POPPINS,
          fontWeight: 700,
          fontSize: 34,
          letterSpacing: '0.18em',
          color: COLORS.white,
          background: COLORS.coral,
          padding: '10px 30px',
          borderRadius: 999,
          transform: `scale(${chip}) rotate(${interpolate(chip, [0, 1], [-8, 0])}deg)`,
        }}
      >
        PASO {step} / 4
      </div>
      <KineticWords
        text={title}
        size={128}
        delay={6}
        color={dark ? COLORS.white : COLORS.ink}
        accent={accent}
        boxed={boxed}
        boxColor={boxColor}
      />
      <div
        style={{
          fontFamily: POPPINS,
          fontWeight: 500,
          fontSize: 40,
          lineHeight: 1.3,
          textAlign: 'center',
          color: dark ? 'rgba(255,255,255,0.78)' : COLORS.slate,
          opacity: sub,
          transform: `translateY(${interpolate(sub, [0, 1], [24, 0])}px)`,
        }}
      >
        {subtitle}
      </div>
    </div>
  );
};
