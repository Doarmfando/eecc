import { interpolate, useCurrentFrame } from 'remotion';

import { BlueBg } from '../components/Backgrounds';
import { AtlasLogo } from '../components/Icons';
import { KineticWords } from '../components/KineticWords';
import { clamp, useEnter } from '../components/motion';
import { ANTON, BANKS, COLORS, POPPINS, SAFE } from '../theme';

export const Closing: React.FC<{ contacto: string }> = ({ contacto }) => {
  const frame = useCurrentFrame();
  const logo = useEnter(4, { damping: 10, stiffness: 120, mass: 0.9 });
  const brand = useEnter(16);
  const banks = useEnter(78);
  const cta = useEnter(100, { damping: 9, stiffness: 180, mass: 0.6 });
  const pulse = 1 + 0.035 * Math.sin(Math.max(0, frame - 120) / 5);
  const glow = interpolate(frame, [0, 300], [0.25, 0.6], clamp);

  return (
    <BlueBg>
      <div
        style={{
          position: 'absolute',
          top: SAFE.top + 30,
          left: 0,
          right: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <div
          style={{
            transform: `scale(${logo}) rotate(${interpolate(logo, [0, 1], [-90, 0])}deg)`,
            filter: `drop-shadow(0 0 40px rgba(255,255,255,${glow}))`,
          }}
        >
          <AtlasLogo size={170} />
        </div>
        <div
          style={{
            fontFamily: ANTON,
            fontSize: 92,
            letterSpacing: '0.32em',
            color: COLORS.white,
            marginTop: 18,
            marginRight: '-0.32em',
            opacity: brand,
            transform: `translateY(${(1 - brand) * 30}px)`,
          }}
        >
          ATLAS
        </div>
      </div>

      <div style={{ position: 'absolute', top: 700, left: SAFE.side - 20, right: SAFE.side - 20 }}>
        <KineticWords
          text="Automatiza | tu contabilidad | en segundos"
          size={136}
          delay={30}
          stagger={4}
          boxed={['segundos']}
          boxColor={COLORS.coral}
        />
      </div>

      <div
        style={{
          position: 'absolute',
          top: 1150,
          left: SAFE.side,
          right: SAFE.side,
          textAlign: 'center',
          fontFamily: POPPINS,
          fontWeight: 600,
          fontSize: 34,
          color: 'rgba(255,255,255,0.88)',
          opacity: banks,
          transform: `translateY(${(1 - banks) * 24}px)`,
        }}
      >
        {BANKS.join('  ·  ')}
        <div style={{ fontSize: 28, fontWeight: 500, marginTop: 6, color: 'rgba(255,255,255,0.7)' }}>
          PDF → Excel / CSV validado
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          top: 1300,
          left: 0,
          right: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 16,
        }}
      >
        <div
          style={{
            fontFamily: POPPINS,
            fontWeight: 800,
            fontSize: 46,
            color: COLORS.blue,
            background: COLORS.white,
            padding: '22px 56px',
            borderRadius: 999,
            transform: `scale(${cta * pulse})`,
            boxShadow: '0 20px 50px rgba(0,0,0,0.3)',
          }}
        >
          Pide tu acceso →
        </div>
        <div
          style={{
            fontFamily: POPPINS,
            fontWeight: 600,
            fontSize: 32,
            color: COLORS.white,
            opacity: cta,
          }}
        >
          {contacto}
        </div>
      </div>
    </BlueBg>
  );
};
