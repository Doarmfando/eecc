import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';

import guion from '../guion.json';
import { COLORS, POPPINS, SAFE, SCENE_START, SCENES } from '../theme';
import { clamp } from './motion';

const STEPS = ['paso1', 'paso2', 'paso3', 'paso4'] as const;

/** Barra de cuatro segmentos que se llena mientras duran los pasos (5 s a 40 s). */
export const StepProgress: React.FC = () => {
  const frame = useCurrentFrame();
  const first = SCENE_START.paso1;
  const end = SCENE_START.cierre;
  const visible = interpolate(frame, [first, first + 12, end - 6, end + 6], [0, 1, 1, 0], clamp);

  if (visible === 0) {
    return null;
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: SAFE.top - 50,
        left: SAFE.side,
        right: SAFE.side,
        display: 'flex',
        gap: 14,
        opacity: visible,
      }}
    >
      {STEPS.map((step, index) => {
        const start = SCENE_START[step];
        const next = index < STEPS.length - 1 ? SCENE_START[STEPS[index + 1]] : start + SCENES[step];
        const fill = interpolate(frame, [start, next], [0, 100], clamp);
        return (
          <div
            key={step}
            style={{
              flex: 1,
              height: 10,
              borderRadius: 999,
              background: 'rgba(120,130,150,0.35)',
              overflow: 'hidden',
            }}
          >
            <div style={{ width: `${fill}%`, height: '100%', background: COLORS.coral }} />
          </div>
        );
      })}
    </div>
  );
};

/** Subtítulos de la voz en off, tomados de `guion.json`. Se activan con la prop `subtitulos`. */
export const Captions: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const seconds = frame / fps;
  const line = guion.lineas.find((l) => seconds >= l.desde && seconds <= l.hasta);

  if (!line) {
    return null;
  }

  const fadeIn = interpolate(seconds, [line.desde, line.desde + 0.2], [0, 1], clamp);
  const fadeOut = interpolate(seconds, [line.hasta - 0.2, line.hasta], [1, 0], clamp);

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          left: SAFE.side,
          right: SAFE.side,
          bottom: SAFE.bottom - 120,
          display: 'flex',
          justifyContent: 'center',
          opacity: Math.min(fadeIn, fadeOut),
        }}
      >
        <div
          style={{
            fontFamily: POPPINS,
            fontWeight: 600,
            fontSize: 38,
            lineHeight: 1.3,
            textAlign: 'center',
            color: COLORS.white,
            background: 'rgba(6,10,20,0.78)',
            padding: '14px 26px',
            borderRadius: 18,
            maxWidth: 900,
          }}
        >
          {line.texto}
        </div>
      </div>
    </AbsoluteFill>
  );
};
