import type { CSSProperties } from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';

import { ANTON, COLORS } from '../theme';

const normalize = (word: string): string =>
  word.replace(/[¿?¡!.,:;«»]/g, '').toLocaleUpperCase('es');

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/**
 * Texto que entra palabra a palabra: cada una sube, crece y se enfoca con un
 * muelle. Las palabras de `accent` cambian de color; las de `boxed` llevan una
 * caja de fondo que se despliega de izquierda a derecha. Un `|` fuerza salto de línea.
 */
export const KineticWords: React.FC<{
  text: string;
  delay?: number;
  stagger?: number;
  size: number;
  color?: string;
  accent?: string[];
  accentColor?: string;
  boxed?: string[];
  boxColor?: string;
  boxTextColor?: string;
  align?: CSSProperties['textAlign'];
  lineHeight?: number;
  style?: CSSProperties;
}> = ({
  text,
  delay = 0,
  stagger = 4,
  size,
  color = COLORS.white,
  accent = [],
  accentColor = COLORS.coral,
  boxed = [],
  boxColor = COLORS.blue,
  boxTextColor = COLORS.white,
  align = 'center',
  lineHeight = 1.04,
  style,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const accents = new Set(accent.map(normalize));
  const boxes = new Set(boxed.map(normalize));
  let index = -1;

  return (
    <div
      style={{
        fontFamily: ANTON,
        fontSize: size,
        lineHeight,
        textTransform: 'uppercase',
        textAlign: align,
        color,
        ...style,
      }}
    >
      {text.split('|').map((line, lineIndex) => (
        <div key={lineIndex}>
          {line
            .trim()
            .split(' ')
            .map((word) => {
              index += 1;
              const local = frame - delay - index * stagger;
              const s = spring({
                frame: local,
                fps,
                config: { damping: 13, stiffness: 190, mass: 0.6 },
              });
              const y = interpolate(s, [0, 1], [size * 0.7, 0]);
              const scale = interpolate(s, [0, 1], [0.55, 1]);
              const opacity = interpolate(local, [0, 5], [0, 1], clamp);
              const blur = interpolate(local, [0, 8], [12, 0], clamp);
              const key = normalize(word);
              const isBoxed = boxes.has(key);
              const reveal = interpolate(local, [4, 14], [0, 100], clamp);

              return (
                <span
                  key={`${word}-${index}`}
                  style={{
                    display: 'inline-block',
                    position: 'relative',
                    margin: '0 0.11em',
                    transform: `translateY(${y}px) scale(${scale})`,
                    opacity,
                    filter: `blur(${blur}px)`,
                    color: isBoxed ? boxTextColor : accents.has(key) ? accentColor : undefined,
                    padding: isBoxed ? '0 0.14em' : undefined,
                    zIndex: 0,
                  }}
                >
                  {isBoxed ? (
                    <span
                      style={{
                        position: 'absolute',
                        inset: '0.04em 0 0.02em 0',
                        background: boxColor,
                        borderRadius: '0.08em',
                        clipPath: `inset(0 ${100 - reveal}% 0 0)`,
                        zIndex: -1,
                      }}
                    />
                  ) : null}
                  {word}
                </span>
              );
            })}
        </div>
      ))}
    </div>
  );
};
