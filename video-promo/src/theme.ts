import { loadFont as loadAnton } from '@remotion/google-fonts/Anton';
import { loadFont as loadPoppins } from '@remotion/google-fonts/Poppins';

export const { fontFamily: ANTON } = loadAnton('normal', {
  weights: ['400'],
  subsets: ['latin', 'latin-ext'],
});

export const { fontFamily: POPPINS } = loadPoppins('normal', {
  weights: ['400', '500', '600', '700', '800'],
  subsets: ['latin', 'latin-ext'],
});

export const COLORS = {
  blue: '#0056C6',
  blueDeep: '#003B8E',
  blueSoft: '#E8F0FC',
  coral: '#D97757',
  coralSoft: '#FBEDE7',
  white: '#FFFFFF',
  paper: '#F7F9FC',
  ink: '#0B1220',
  night: '#060A14',
  slate: '#64748B',
  line: '#E2E8F0',
  success: '#16A34A',
} as const;

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;

/**
 * Duraciones en fotogramas. Las escenas se solapan TRANSITION fotogramas en cada
 * corte, así que: 165 + 4·(277,5) + 300 − 5·15 = 1500 (50 s). Con estos valores
 * los pasos empiezan en 5 s y el cierre en 40 s exactos.
 */
export const TRANSITION = 15;
export const SCENES = {
  gancho: 165,
  paso1: 278,
  paso2: 277,
  paso3: 278,
  paso4: 277,
  cierre: 300,
} as const;

export const TOTAL_FRAMES =
  Object.values(SCENES).reduce((sum, frames) => sum + frames, 0) -
  (Object.keys(SCENES).length - 1) * TRANSITION;

/** Fotograma global en que empieza cada escena (para la barra de pasos). */
export const SCENE_START = (() => {
  const starts: Record<keyof typeof SCENES, number> = {
    gancho: 0, paso1: 0, paso2: 0, paso3: 0, paso4: 0, cierre: 0,
  };
  let cursor = 0;
  for (const key of Object.keys(SCENES) as Array<keyof typeof SCENES>) {
    starts[key] = cursor;
    cursor += SCENES[key] - TRANSITION;
  }
  return starts;
})();

/**
 * Zona segura de Reels/TikTok: arriba quedan las pestañas y abajo el texto del
 * post y los botones. El contenido importante vive entre estos márgenes.
 */
export const SAFE = { top: 200, bottom: 420, side: 80 } as const;

export const BANKS = ['BCP', 'BBVA', 'Interbank', 'Banco de la Nación'] as const;
