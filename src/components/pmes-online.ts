// Self-paced online PMES on /pmes/ (board paper Item 3): three video modules in order, then this
// month's online session code. The gating is a nudge, not security: the code itself is public via
// GET /api/pmes/online-session; identity, the server timer and the attempt limit are the controls.

export type VideoModule = { title: string; url: string };
export type Embed = { kind: 'youtube'; src: string } | { kind: 'file'; src: string } | { kind: 'placeholder' };

/** A YouTube link (watch, youtu.be, embed, shorts) becomes a privacy-enhanced embed; any other https URL plays as a file. */
export function videoEmbed(url: string): Embed {
  let u: URL;
  try { u = new URL(url); } catch { return { kind: 'placeholder' }; }
  if (u.protocol !== 'https:') return { kind: 'placeholder' };
  const host = u.hostname.replace(/^(www|m)\./, '');
  const id = host === 'youtu.be' ? u.pathname.slice(1)
    : /^youtube(-nocookie)?\.com$/.test(host) ? (u.searchParams.get('v') ?? u.pathname.match(/^\/(?:embed|shorts)\/([^/]+)/)?.[1] ?? '')
    : null;
  if (id === null) return { kind: 'file', src: url };
  return /^[\w-]{6,}$/.test(id) ? { kind: 'youtube', src: `https://www.youtube-nocookie.com/embed/${id}?rel=0` } : { kind: 'placeholder' };
}

/** Modules 0..reached-1 are done; module `reached` is the one to watch. The code unlocks once all are done. */
export const markWatched = (reached: number, index: number, total: number) => Math.min(total, Math.max(reached, index + 1));
export const codeUnlocked = (reached: number, total: number) => reached >= total;

const KEY = 'pmes-online-reached';

export type MountOptions = {
  modules: VideoModule[];
  /** This month's online session code, or null when none is open. */
  fetchCode: () => Promise<string | null>;
  onCode?: (code: string) => void;
  storage?: Pick<Storage, 'getItem' | 'setItem'>;
};

export function mountOnline(root: HTMLElement, { modules, fetchCode, onCode, storage }: MountOptions): void {
  const total = modules.length;
  let reached = 0;
  try { reached = Math.min(total, Math.max(0, Number(storage?.getItem(KEY)) || 0)); } catch { /* storage blocked */ }

  const cards = modules.map((m, i) => {
    const card = document.createElement('section');
    card.className = 'bg-white border-t-[3px] border-navy rounded-b-lg p-6 space-y-3';
    card.dataset.module = String(i);
    const h = document.createElement('h2');
    h.className = 'text-xl';
    h.textContent = m.title;
    const embed = videoEmbed(m.url);
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pq-btn bg-navy text-white';
    btn.textContent = i === total - 1 ? 'I have watched the last module: show the session code' : 'I have watched this module: next';
    let media: HTMLElement;
    if (embed.kind === 'youtube') {
      const frame = document.createElement('iframe');
      frame.src = embed.src;
      frame.title = m.title;
      frame.allow = 'encrypted-media; picture-in-picture; fullscreen';
      frame.className = 'w-full aspect-video rounded';
      media = frame;
    } else if (embed.kind === 'file') {
      const video = document.createElement('video');
      video.src = embed.src;
      video.controls = true;
      video.preload = 'metadata';
      video.className = 'w-full aspect-video rounded bg-black';
      // A direct file can tell when it ends, so the button waits for it (unless already watched).
      btn.disabled = i >= reached;
      video.addEventListener('ended', () => { btn.disabled = false; });
      media = video;
    } else {
      media = document.createElement('p');
      media.className = 'p-6 rounded bg-brand-bg text-sm text-slate';
      media.textContent = 'Video coming soon.';
    }
    btn.addEventListener('click', () => {
      reached = markWatched(reached, i, total);
      try { storage?.setItem(KEY, String(reached)); } catch { /* storage blocked */ }
      render();
    });
    card.append(h, media, btn);
    return card;
  });

  const panel = document.createElement('section');
  panel.className = 'hidden bg-white border-t-[3px] border-orange rounded-b-lg p-6 space-y-2';
  panel.dataset.codePanel = '';
  const lead = document.createElement('p');
  lead.className = 'text-sm';
  const code = document.createElement('p');
  code.className = 'font-display font-bold text-2xl tracking-widest text-navy';
  panel.append(lead, code);
  root.replaceChildren(...cards, panel);

  let requested = false;
  function render() {
    cards.forEach((card, i) => card.classList.toggle('hidden', i > reached));
    if (!codeUnlocked(reached, total) || requested) return;
    requested = true;
    panel.classList.remove('hidden');
    lead.textContent = 'Loading this month’s session code…';
    fetchCode()
      .then(c => {
        if (c) {
          lead.textContent = 'This month’s online session code. It has been entered in the quiz form below.';
          code.textContent = c;
          onCode?.(c);
        } else lead.textContent = 'The online session for this month is not open yet. Please contact the office.';
      })
      .catch(() => {
        requested = false;
        lead.textContent = 'Could not load the session code. Check your connection and reload the page.';
      });
  }
  render();
}
