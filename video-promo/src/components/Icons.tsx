import { COLORS, POPPINS } from '../theme';

export const CheckIcon: React.FC<{ size?: number; color?: string; stroke?: string }> = ({
  size = 40,
  color = COLORS.success,
  stroke = COLORS.white,
}) => (
  <svg width={size} height={size} viewBox="0 0 40 40" style={{ flexShrink: 0 }}>
    <circle cx="20" cy="20" r="20" fill={color} />
    <path
      d="M11 20.5 L17.5 27 L29.5 14"
      fill="none"
      stroke={stroke}
      strokeWidth="4.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export const LockIcon: React.FC<{ size?: number; color?: string }> = ({
  size = 40,
  color = COLORS.white,
}) => (
  <svg width={size} height={size} viewBox="0 0 40 40" style={{ flexShrink: 0 }}>
    <rect x="7" y="17" width="26" height="19" rx="4" fill={color} />
    <path d="M13 17 V12 a7 7 0 0 1 14 0 V17" fill="none" stroke={color} strokeWidth="4" />
  </svg>
);

/** Documento con esquina doblada y etiqueta, para el PDF y el Excel. */
export const FileIcon: React.FC<{ label: string; color: string; width?: number }> = ({
  label,
  color,
  width = 200,
}) => (
  <div style={{ position: 'relative', width, height: width * 1.25 }}>
    <svg
      width={width}
      height={width * 1.25}
      viewBox="0 0 160 200"
      style={{ position: 'absolute', filter: 'drop-shadow(0 14px 24px rgba(0,0,0,0.25))' }}
    >
      <path
        d="M12 6 H112 L154 48 V188 a8 8 0 0 1 -8 8 H12 a8 8 0 0 1 -8 -8 V14 a8 8 0 0 1 8 -8 Z"
        fill={COLORS.white}
      />
      <path d="M112 6 V40 a8 8 0 0 0 8 8 H154 Z" fill={COLORS.line} />
      {[78, 98, 118].map((y) => (
        <rect
          key={y}
          x="24"
          y={y}
          width={y === 118 ? 70 : 108}
          height="9"
          rx="4.5"
          fill={COLORS.line}
        />
      ))}
    </svg>
    <div
      style={{
        position: 'absolute',
        left: -width * 0.08,
        bottom: width * 0.14,
        background: color,
        color: COLORS.white,
        fontFamily: POPPINS,
        fontWeight: 800,
        fontSize: width * 0.2,
        padding: `${width * 0.02}px ${width * 0.09}px`,
        borderRadius: width * 0.05,
        letterSpacing: '0.04em',
      }}
    >
      {label}
    </div>
  </div>
);

/** Isotipo de ATLAS, el mismo trazo que `frontend/src/assets/logo.svg`. */
export const AtlasLogo: React.FC<{ size?: number; color?: string }> = ({
  size = 200,
  color = COLORS.white,
}) => (
  <svg width={size} height={(size * 360) / 260} viewBox="0 0 260 360">
    <g fill={color}>
      <path d="M130 8 L164 252 L130 292 L96 252 Z" />
      <path d="M22 330 L91 142 L91 330 Z" />
      <path d="M238 330 L169 142 L169 330 Z" />
    </g>
  </svg>
);

/** Puntero de ratón; `press` de 0 a 1 lo encoge para simular el clic. */
export const Cursor: React.FC<{ x: number; y: number; press?: number }> = ({
  x,
  y,
  press = 0,
}) => (
  <div
    style={{
      position: 'absolute',
      left: x,
      top: y,
      transform: `scale(${1 - press * 0.18})`,
      transformOrigin: 'top left',
      filter: 'drop-shadow(0 8px 14px rgba(0,0,0,0.35))',
      zIndex: 20,
    }}
  >
    <svg width="64" height="80" viewBox="0 0 32 40">
      <path
        d="M2 2 L2 31 L10 24 L15.5 36 L21 33.5 L15.5 22 L26 22 Z"
        fill={COLORS.ink}
        stroke={COLORS.white}
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
    </svg>
  </div>
);
