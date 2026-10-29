import { interpolate, useCurrentFrame } from 'remotion';

import { DarkGrid } from '../components/Backgrounds';
import { CheckIcon, FileIcon, LockIcon } from '../components/Icons';
import { clamp, useEnter } from '../components/motion';
import { StepHeader } from '../components/StepHeader';
import { COLORS, POPPINS } from '../theme';

const DROP_AT = 50;
const UPLOAD_FROM = 62;
const UPLOAD_TO = 128;

/** Lo que de verdad hace el sistema (README, ADR-0005, ADR-0017, `upload-form.tsx`). */
const BADGES = [
  'Entras con tu propio usuario',
  'Abre PDFs con contraseña',
  'Borras tu historial cuando quieras',
] as const;

export const StepUpload: React.FC = () => {
  const frame = useCurrentFrame();
  const zone = useEnter(14);
  const drop = useEnter(DROP_AT - 18, { damping: 11, stiffness: 140, mass: 0.8 });
  const landed = frame >= DROP_AT;
  const progress = interpolate(frame, [UPLOAD_FROM, UPLOAD_TO], [0, 100], {
    ...clamp,
    easing: (t) => 1 - Math.pow(1 - t, 2),
  });
  const done = frame >= UPLOAD_TO;
  const doneIn = useEnter(UPLOAD_TO);
  const ripple = interpolate(frame, [DROP_AT, DROP_AT + 20], [0, 1], clamp);

  return (
    <DarkGrid>
      <StepHeader
        step={2}
        title="Sube tu PDF"
        subtitle="Arrastra y suelta, de forma segura"
        dark
        accent={['PDF']}
      />

      {/* Zona de carga */}
      <div
        style={{
          position: 'absolute',
          top: 600,
          left: 110,
          right: 110,
          height: 470,
          borderRadius: 36,
          border: `5px dashed ${landed ? COLORS.blue : 'rgba(255,255,255,0.35)'}`,
          background: landed ? 'rgba(0,86,198,0.18)' : 'rgba(255,255,255,0.04)',
          transform: `scale(${0.9 + 0.1 * zone})`,
          opacity: zone,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-end',
          paddingBottom: 40,
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'absolute',
            width: 700,
            height: 700,
            borderRadius: '50%',
            border: `6px solid ${COLORS.blue}`,
            opacity: 1 - ripple,
            transform: `scale(${ripple})`,
            top: -100,
          }}
        />
        <div
          style={{
            position: 'absolute',
            top: 40,
            transform: `translateY(${interpolate(drop, [0, 1], [-560, 0])}px) rotate(${interpolate(drop, [0, 1], [-25, 0])}deg)`,
          }}
        >
          <FileIcon label="PDF" color="#E5484D" width={170} />
        </div>

        <div style={{ width: '82%', fontFamily: POPPINS, color: COLORS.white }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              fontSize: 30,
              fontWeight: 600,
              marginBottom: 14,
              opacity: landed ? 1 : 0,
            }}
          >
            <span>estado-de-cuenta.pdf</span>
            <span style={{ color: done ? '#4ADE80' : COLORS.white }}>
              {done ? 'Listo' : `${Math.round(progress)} %`}
            </span>
          </div>
          <div
            style={{
              height: 18,
              borderRadius: 999,
              background: 'rgba(255,255,255,0.15)',
              overflow: 'hidden',
              opacity: landed ? 1 : 0,
            }}
          >
            <div
              style={{
                width: `${progress}%`,
                height: '100%',
                borderRadius: 999,
                background: done
                  ? COLORS.success
                  : `linear-gradient(90deg, ${COLORS.blue}, ${COLORS.coral})`,
              }}
            />
          </div>
        </div>

        {done ? (
          <div style={{ position: 'absolute', top: 30, right: 30, transform: `scale(${doneIn})` }}>
            <CheckIcon size={72} />
          </div>
        ) : null}
      </div>

      <div
        style={{
          position: 'absolute',
          top: 1110,
          left: 110,
          right: 110,
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {BADGES.map((text, index) => (
          <Badge key={text} text={text} delay={UPLOAD_TO + 12 + index * 12} />
        ))}
      </div>
    </DarkGrid>
  );
};

const Badge: React.FC<{ text: string; delay: number }> = ({ text, delay }) => {
  const enter = useEnter(delay);
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 22,
        fontFamily: POPPINS,
        fontWeight: 600,
        fontSize: 36,
        color: COLORS.white,
        background: 'rgba(255,255,255,0.07)',
        border: '2px solid rgba(255,255,255,0.14)',
        borderRadius: 22,
        padding: '16px 26px',
        transform: `translateX(${(1 - enter) * -120}px)`,
        opacity: enter,
      }}
    >
      <span
        style={{
          width: 58,
          height: 58,
          borderRadius: 16,
          background: COLORS.coral,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <LockIcon size={34} />
      </span>
      {text}
    </div>
  );
};
