import type { VideoModule } from '~/components/pmes-online';

// Self-paced online PMES (board paper Item 3, BOD special meeting 2026-11-13).
// Off: /pmes/ is the quiz only, exactly as before. On: /pmes/ shows the three video modules in
// order and, after the last one, this month's online session code from the Worker.
// Turn on together with PMES_SELF_PACED = "on" in worker/wrangler.toml.
export const PMES_SELF_PACED: boolean = false;

/**
 * The three narrated modules, in order. `url` is either a YouTube link (unlisted is fine; watch,
 * youtu.be or embed form) or a direct video file (MP4 on Cloudflare R2 or similar).
 * Files live at https://media.isatucmpc.coop/pmes/; re-publishing is documented in the video build folder.
 */
export const PMES_VIDEO_MODULES: VideoModule[] = [
  {
    title: 'Module 1 of 3',
    url: 'https://media.isatucmpc.coop/pmes/pmes-module-1-1080p.mp4?v=20261110e',
    mobileUrl: 'https://media.isatucmpc.coop/pmes/pmes-module-1-720p.mp4?v=20261110e',
    captions: 'https://media.isatucmpc.coop/pmes/pmes-module-1.en.vtt?v=20261110e',
    poster: 'https://media.isatucmpc.coop/pmes/pmes-module-1-poster.jpg?v=20261110e',
  },
  {
    title: 'Module 2 of 3',
    url: 'https://media.isatucmpc.coop/pmes/pmes-module-2-1080p.mp4?v=20261110e',
    mobileUrl: 'https://media.isatucmpc.coop/pmes/pmes-module-2-720p.mp4?v=20261110e',
    captions: 'https://media.isatucmpc.coop/pmes/pmes-module-2.en.vtt?v=20261110e',
    poster: 'https://media.isatucmpc.coop/pmes/pmes-module-2-poster.jpg?v=20261110e',
  },
  {
    title: 'Module 3 of 3',
    url: 'https://media.isatucmpc.coop/pmes/pmes-module-3-1080p.mp4?v=20261110e',
    mobileUrl: 'https://media.isatucmpc.coop/pmes/pmes-module-3-720p.mp4?v=20261110e',
    captions: 'https://media.isatucmpc.coop/pmes/pmes-module-3.en.vtt?v=20261110e',
    poster: 'https://media.isatucmpc.coop/pmes/pmes-module-3-poster.jpg?v=20261110e',
  },
];
