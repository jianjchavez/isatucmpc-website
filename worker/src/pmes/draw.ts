import type { Bank } from './bank';

export type Draw = { items: { id: string; optionOrder: number[] }[] };
export type PresentedQuestion = { n: number; id: string; section: string; text: string; options: string[] };

/** Uniform integer in [0, n) from crypto.getRandomValues, rejection-sampled (no modulo bias). */
export function cryptoRandom(n: number): number {
  const buf = new Uint32Array(1);
  const limit = 2 ** 32 - ((2 ** 32) % n);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % n;
  }
}

function shuffle<T>(arr: T[], random: (n: number) => number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = random(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function drawQuiz(bank: Bank, perSection = 2, random: (n: number) => number = cryptoRandom): Draw {
  const picked: string[] = [];
  for (const s of bank.sections) {
    const pool = bank.questions.filter(q => q.section === s.id);
    if (pool.length < perSection) throw new Error(`bank-too-small:${s.id}`);
    picked.push(...shuffle(pool, random).slice(0, perSection).map(q => q.id));
  }
  return {
    items: shuffle(picked, random).map(id => ({ id, optionOrder: shuffle([0, 1, 2, 3], random) })),
  };
}

export function presentDraw(bank: Bank, draw: Draw): PresentedQuestion[] {
  const byId = new Map(bank.questions.map(q => [q.id, q]));
  return draw.items.map((item, i) => {
    const q = byId.get(item.id);
    if (!q) throw new Error(`unknown-question:${item.id}`);
    return { n: i + 1, id: q.id, section: q.section, text: q.text, options: item.optionOrder.map(k => q.options[k]) };
  });
}
