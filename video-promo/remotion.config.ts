import { Config } from '@remotion/cli/config';

// H.264 + AAC en MP4: lo que aceptan Reels y TikTok sin reconvertir.
Config.setVideoImageFormat('jpeg');
Config.setCodec('h264');
Config.setCrf(18);
Config.setPixelFormat('yuv420p');
Config.setOverwriteOutput(true);
