import { Composition } from 'remotion';

import { defaultPromoProps, PromoVideo } from './PromoVideo';
import { FPS, HEIGHT, TOTAL_FRAMES, WIDTH } from './theme';

export const RemotionRoot: React.FC = () => (
  <Composition
    id="PromoVertical"
    component={PromoVideo}
    durationInFrames={TOTAL_FRAMES}
    fps={FPS}
    width={WIDTH}
    height={HEIGHT}
    defaultProps={defaultPromoProps}
  />
);
