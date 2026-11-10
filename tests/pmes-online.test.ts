import { describe, it, expect, vi } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { videoEmbed, markWatched, codeUnlocked, mountOnline, hasWatchedEnough } from '~/components/pmes-online';
import { PMES_SELF_PACED, PMES_VIDEO_MODULES } from '~/data/pmes-online';
import { errorMessage } from '~/components/pmes-logic';

const modules = [
  { title: 'Module 1 of 3', url: 'https://youtu.be/abcDEF12345' },
  PMES_VIDEO_MODULES[1],
  { title: 'Module 3 of 3', url: 'PLACEHOLDER-module-3-url' },
];
const flush = () => new Promise(resolve => setTimeout(resolve, 0));
const memory = (init: Record<string, string> = {}) => {
  const m = new Map(Object.entries(init));
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
};
const visible = (root: HTMLElement) => [...root.querySelectorAll<HTMLElement>('[data-module]')].filter(el => !el.classList.contains('hidden')).length;
const panel = (root: HTMLElement) => root.querySelector<HTMLElement>('[data-code-panel]')!;
const button = (root: HTMLElement, i: number) => root.querySelector<HTMLButtonElement>(`[data-module="${i}"] button`)!;

describe('videoEmbed', () => {
  it('turns YouTube links into privacy-enhanced embeds', () => {
    const src = 'https://www.youtube-nocookie.com/embed/abcDEF12345?rel=0';
    for (const url of ['https://youtu.be/abcDEF12345', 'https://www.youtube.com/watch?v=abcDEF12345', 'https://youtube.com/embed/abcDEF12345', 'https://m.youtube.com/shorts/abcDEF12345'])
      expect(videoEmbed(url), url).toEqual({ kind: 'youtube', src });
  });
  it('plays any other https URL as a file, and treats placeholders and http as not ready', () => {
    expect(videoEmbed('https://example-bucket.r2.dev/m1.mp4')).toEqual({ kind: 'file', src: 'https://example-bucket.r2.dev/m1.mp4' });
    expect(videoEmbed('PLACEHOLDER-module-1-url')).toEqual({ kind: 'placeholder' });
    expect(videoEmbed('http://example.com/m1.mp4')).toEqual({ kind: 'placeholder' });
    expect(videoEmbed('https://www.youtube.com/watch')).toEqual({ kind: 'placeholder' });
  });
});

describe('file playback', () => {
  it('requires at least 90% played and a known positive duration', () => {
    expect(hasWatchedEnough(89.9, 100)).toBe(false);
    expect(hasWatchedEnough(90, 100)).toBe(true);
    expect(hasWatchedEnough(95, 100)).toBe(true);
    expect(hasWatchedEnough(0, 0)).toBe(false);
    expect(hasWatchedEnough(100, 0)).toBe(false);
    expect(hasWatchedEnough(100, NaN)).toBe(false);
    expect(hasWatchedEnough(100, Infinity)).toBe(false);
  });

  it('renders responsive MP4 sources, poster and default English captions', () => {
    const root = document.createElement('div');
    mountOnline(root, { modules, fetchCode: async () => null });
    const video = root.querySelector('video')!;
    expect(video.getAttribute('crossorigin')).toBe('anonymous');
    expect(video.controls).toBe(true);
    expect(video.preload).toBe('metadata');
    expect(video.playsInline).toBe(true);
    expect(video.poster).toBe(modules[1].poster);
    expect(video.hasAttribute('src')).toBe(false);
    const sources = [...video.querySelectorAll('source')];
    expect(sources.map(s => [s.src, s.type, s.media])).toEqual([
      [modules[1].mobileUrl, 'video/mp4', '(max-width: 1024px)'],
      [modules[1].url, 'video/mp4', ''],
    ]);
    const track = video.querySelector('track')!;
    expect(track.src).toBe(modules[1].captions);
    expect(track.kind).toBe('captions');
    expect(track.srclang).toBe('en');
    expect(track.label).toBe('English');
    expect(track.default).toBe(true);
  });

  it('sums played ranges without counting seeks or repeated updates and stays enabled', () => {
    const root = document.createElement('div');
    const fetchCode = vi.fn(async () => 'PMES-AB23');
    mountOnline(root, { modules, fetchCode });
    button(root, 0).click();
    const video = root.querySelector('video')!;
    let ranges = [[0, 40], [50, 99]];
    Object.defineProperties(video, {
      duration: { value: 100 },
      currentTime: { value: 99 },
      played: { get: () => ({ length: ranges.length, start: (i: number) => ranges[i][0], end: (i: number) => ranges[i][1] }) },
    });
    video.dispatchEvent(new Event('timeupdate'));
    video.dispatchEvent(new Event('timeupdate'));
    expect(button(root, 1).disabled).toBe(true);
    ranges = [[0, 40], [49, 99]];
    video.dispatchEvent(new Event('timeupdate'));
    expect(button(root, 1).disabled).toBe(false);
    expect(visible(root)).toBe(2);
    expect(fetchCode).not.toHaveBeenCalled();
    ranges = [];
    video.dispatchEvent(new Event('timeupdate'));
    expect(button(root, 1).disabled).toBe(false);
    button(root, 1).click();
    expect(visible(root)).toBe(3);
  });
});

describe('module order', () => {
  it('unlocks the code only when every module is marked watched', () => {
    expect(markWatched(0, 0, 3)).toBe(1);
    expect(markWatched(2, 0, 3)).toBe(2); // rewatching an earlier module never moves back
    expect(markWatched(2, 2, 3)).toBe(3);
    expect(codeUnlocked(2, 3)).toBe(false);
    expect(codeUnlocked(3, 3)).toBe(true);
  });

  it('keeps the session code hidden and unrequested until the last module', async () => {
    const root = document.createElement('div');
    const fetchCode = vi.fn(async () => 'PMES-AB23');
    const onCode = vi.fn();
    mountOnline(root, { modules, fetchCode, onCode, storage: memory() });
    expect(visible(root)).toBe(1);
    expect(panel(root).classList.contains('hidden')).toBe(true);
    button(root, 0).click();
    expect(visible(root)).toBe(2);
    // Module 2 is a file: its button waits for the video to end.
    expect(button(root, 1).disabled).toBe(true);
    root.querySelector('video')!.dispatchEvent(new Event('ended'));
    expect(button(root, 1).disabled).toBe(false);
    button(root, 1).click();
    expect(visible(root)).toBe(3);
    await flush();
    expect(fetchCode).not.toHaveBeenCalled();
    expect(panel(root).classList.contains('hidden')).toBe(true);
    expect(root.textContent).not.toContain('PMES-AB23');
    button(root, 2).click();
    await flush();
    expect(fetchCode).toHaveBeenCalledTimes(1);
    expect(panel(root).classList.contains('hidden')).toBe(false);
    expect(panel(root).textContent).toContain('PMES-AB23');
    expect(onCode).toHaveBeenCalledWith('PMES-AB23');
  });

  it('remembers progress, and says so when no online session is open', async () => {
    const storage = memory({ 'pmes-online-reached': '3' });
    const root = document.createElement('div');
    mountOnline(root, { modules, fetchCode: async () => null, storage });
    await flush();
    expect(visible(root)).toBe(3);
    expect(panel(root).textContent).toContain('not open yet');
  });

  it('a stored value out of range never unlocks early', () => {
    const root = document.createElement('div');
    const fetchCode = vi.fn(async () => 'PMES-AB23');
    mountOnline(root, { modules, fetchCode, storage: memory({ 'pmes-online-reached': '-4' }) });
    expect(visible(root)).toBe(1);
    expect(fetchCode).not.toHaveBeenCalled();
  });
});

describe('online session errors', () => {
  it('tells a member to use an in-person session', () => {
    expect(errorMessage('online-session-applicants-only')).toContain('Members take the PMES at an in-person session.');
  });
});

describe('switch off: /pmes/ unchanged', () => {
  it('ships off, with three hosted modules', () => {
    expect(PMES_SELF_PACED).toBe(false);
    expect(PMES_VIDEO_MODULES.map(m => m.title)).toEqual(['Module 1 of 3', 'Module 2 of 3', 'Module 3 of 3']);
    for (const [index, module] of PMES_VIDEO_MODULES.entries()) {
      const base = `https://media.isatucmpc.coop/pmes/pmes-module-${index + 1}`;
      expect(module).toMatchObject({
        url: `${base}-1080p.mp4?v=20261110e`,
        mobileUrl: `${base}-720p.mp4?v=20261110e`,
        captions: `${base}.en.vtt?v=20261110e`,
        poster: `${base}-poster.jpg?v=20261110e`,
      });
    }
  });
  it('the quiz page and the presenter form render the online parts only behind the switch', () => {
    expect(readFileSync('src/pages/pmes/index.astro', 'utf8')).toContain('{PMES_SELF_PACED && <PmesOnline />}');
    expect(readFileSync('src/pages/pmes/admin/index.astro', 'utf8')).toContain('{PMES_SELF_PACED && (<>');
  });
  it.skipIf(!existsSync('dist/pmes/index.html'))('the built pages carry no video modules, code fetch or month option', () => {
    const page = readFileSync('dist/pmes/index.html', 'utf8');
    expect(page).not.toContain('pmes-online');
    expect(page).not.toContain('Watch the seminar');
    expect(readFileSync('dist/pmes/admin/index.html', 'utf8')).not.toContain('name="kind"');
  });
});
