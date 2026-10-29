import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

export const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/** Muelle de 0 a 1 que arranca en `delay`; el ritmo base de todas las entradas. */
export const useEnter = (delay = 0, config = { damping: 14, stiffness: 170, mass: 0.7 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config });
};

/** Pulsación de clic: sube a 1 y vuelve a 0 en ~8 fotogramas a partir de `at`. */
export const usePress = (at: number) => {
  const frame = useCurrentFrame();
  return interpolate(frame, [at, at + 3, at + 8], [0, 1, 0], clamp);
};

/** Sacudida breve (en px) para dar énfasis; 0 fuera de [from, from + length]. */
export const useShake = (from: number, length = 12, amplitude = 10) => {
  const frame = useCurrentFrame();
  const local = frame - from;
  if (local < 0 || local > length) {
    return 0;
  }
  const decay = 1 - local / length;
  return Math.sin(local * 2.4) * amplitude * decay;
};
