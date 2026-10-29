import { linearTiming, TransitionSeries } from '@remotion/transitions';
import { fade } from '@remotion/transitions/fade';
import { slide } from '@remotion/transitions/slide';
import { wipe } from '@remotion/transitions/wipe';
import { AbsoluteFill, Audio, interpolate, Sequence, staticFile } from 'remotion';

import { Captions, StepProgress } from './components/Overlays';
import guion from './guion.json';
import { Closing } from './scenes/Closing';
import { Hook } from './scenes/Hook';
import { StepBank } from './scenes/StepBank';
import { StepDownload } from './scenes/StepDownload';
import { StepUpload } from './scenes/StepUpload';
import { StepValidate } from './scenes/StepValidate';
import { FPS, SCENES, TOTAL_FRAMES, TRANSITION } from './theme';

export type PromoProps = {
  /** Subtítulos quemados con el texto de `guion.json`. */
  subtitulos: boolean;
  /** Usa `public/voz/<escena>.<vozFormato>`, uno por línea del guion. */
  voz: boolean;
  vozFormato: 'wav' | 'mp3';
  /** Usa `public/musica.mp3` de fondo, más baja cuando hay voz. */
  musica: boolean;
  /** Línea bajo el botón del cierre: usuario, web o WhatsApp. */
  contacto: string;
};

export const defaultPromoProps: PromoProps = {
  subtitulos: false,
  voz: false,
  vozFormato: 'wav',
  musica: false,
  contacto: 'Escríbenos por DM',
};

const timing = linearTiming({ durationInFrames: TRANSITION });

export const PromoVideo: React.FC<PromoProps> = ({
  subtitulos,
  voz,
  vozFormato,
  musica,
  contacto,
}) => (
  <AbsoluteFill style={{ backgroundColor: '#000' }}>
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={SCENES.gancho}>
        <Hook />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: 'from-bottom' })} timing={timing} />
      <TransitionSeries.Sequence durationInFrames={SCENES.paso1}>
        <StepBank />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={wipe({ direction: 'from-right' })} timing={timing} />
      <TransitionSeries.Sequence durationInFrames={SCENES.paso2}>
        <StepUpload />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={slide({ direction: 'from-right' })} timing={timing} />
      <TransitionSeries.Sequence durationInFrames={SCENES.paso3}>
        <StepValidate />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={wipe({ direction: 'from-left' })} timing={timing} />
      <TransitionSeries.Sequence durationInFrames={SCENES.paso4}>
        <StepDownload />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={timing} />
      <TransitionSeries.Sequence durationInFrames={SCENES.cierre}>
        <Closing contacto={contacto} />
      </TransitionSeries.Sequence>
    </TransitionSeries>

    <StepProgress />
    {subtitulos ? <Captions /> : null}

    {voz
      ? guion.lineas.map((linea) => (
          <Sequence key={linea.escena} from={Math.round(linea.desde * FPS)} layout="none">
            <Audio src={staticFile(`voz/${linea.escena}.${vozFormato}`)} />
          </Sequence>
        ))
      : null}

    {musica ? (
      <Audio
        src={staticFile('musica.mp3')}
        volume={(f) =>
          interpolate(
            f,
            [0, 15, TOTAL_FRAMES - 45, TOTAL_FRAMES],
            [0, voz ? 0.12 : 0.4, voz ? 0.12 : 0.4, 0],
            { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' },
          )
        }
      />
    ) : null}
  </AbsoluteFill>
);
