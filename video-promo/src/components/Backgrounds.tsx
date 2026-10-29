import type { ReactNode } from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';

import { COLORS } from '../theme';

/** Fondo técnico oscuro: rejilla que se desplaza y dos halos que respiran. */
export const DarkGrid: React.FC<{ children?: ReactNode; glow?: string }> = ({
  children,
  glow = COLORS.blue,
}) => {
  const frame = useCurrentFrame();
  const offset = (frame * 0.8) % 80;
  const pulse = 0.55 + 0.15 * Math.sin(frame / 18);

  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.night, overflow: 'hidden' }}>
      <AbsoluteFill
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
          backgroundSize: '80px 80px',
          backgroundPosition: `0 ${offset}px`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: 1300,
          height: 1300,
          left: -420,
          top: -380,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${glow} 0%, transparent 65%)`,
          opacity: pulse,
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: 1100,
          height: 1100,
          right: -460,
          bottom: -300,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${COLORS.coral} 0%, transparent 65%)`,
          opacity: pulse * 0.45,
        }}
      />
      {children}
    </AbsoluteFill>
  );
};

/** Fondo claro y limpio con un degradado muy suave y puntos que derivan. */
export const LightBg: React.FC<{ children?: ReactNode }> = ({ children }) => {
  const frame = useCurrentFrame();
  const drift = interpolate(frame, [0, 300], [0, 40]);

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(180deg, ${COLORS.white} 0%, ${COLORS.paper} 100%)`,
        overflow: 'hidden',
      }}
    >
      <AbsoluteFill
        style={{
          backgroundImage: `radial-gradient(${COLORS.line} 2px, transparent 2px)`,
          backgroundSize: '44px 44px',
          backgroundPosition: `${drift}px ${drift}px`,
          opacity: 0.8,
        }}
      />
      <div
        style={{
          position: 'absolute',
          width: 900,
          height: 900,
          right: -380,
          top: -300,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${COLORS.blueSoft} 0%, transparent 70%)`,
        }}
      />
      {children}
    </AbsoluteFill>
  );
};

/** Fondo azul de marca con barrido diagonal, para el cierre. */
export const BlueBg: React.FC<{ children?: ReactNode }> = ({ children }) => {
  const frame = useCurrentFrame();
  const sweep = interpolate(frame, [0, 300], [-30, 130]);

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(160deg, ${COLORS.blue} 0%, ${COLORS.blueDeep} 100%)`,
        overflow: 'hidden',
      }}
    >
      <AbsoluteFill
        style={{
          background: `linear-gradient(115deg, transparent ${sweep - 12}%, rgba(255,255,255,0.12) ${sweep}%, transparent ${sweep + 12}%)`,
        }}
      />
      <AbsoluteFill
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.06) 1px, transparent 1px)',
          backgroundSize: '90px 90px',
        }}
      />
      {children}
    </AbsoluteFill>
  );
};
