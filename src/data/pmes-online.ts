// Self-paced online PMES (board paper Item 3, BOD special meeting 2026-11-13).
// Off: /pmes/ is the quiz only, exactly as before. On: /pmes/ shows the three video modules in
// order and, after the last one, this month's online session code from the Worker.
// Turn on together with PMES_SELF_PACED = "on" in worker/wrangler.toml.
export const PMES_SELF_PACED: boolean = false;

/**
 * The three narrated modules, in order. `url` is either a YouTube link (unlisted is fine; watch,
 * youtu.be or embed form) or a direct video file (MP4 on Cloudflare R2 or similar).
 * PLACEHOLDER: hosting is not chosen yet. Paste the real URLs here, and add a direct-file host
 * to `media-src` in public/_headers.
 */
export const PMES_VIDEO_MODULES: { title: string; url: string }[] = [
  { title: 'Module 1 of 3', url: 'PLACEHOLDER-module-1-url' },
  { title: 'Module 2 of 3', url: 'PLACEHOLDER-module-2-url' },
  { title: 'Module 3 of 3', url: 'PLACEHOLDER-module-3-url' },
];
