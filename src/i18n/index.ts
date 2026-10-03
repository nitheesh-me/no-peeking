/**
 * Minimal i18n: content packs are flat or nested JSON; t('a.b.c', { n: 3 }) → string with {n} filled.
 * Missing keys fall back to the 'en' pack, then to the key itself (so gaps are visible, never silent).
 */
export type Pack = { [k: string]: string | Pack };

const packs = new Map<string, Pack>();
let current = 'en';

export function registerPack(locale: string, pack: Pack): void { packs.set(locale, pack); }
export function setLocale(locale: string): void { current = packs.has(locale) ? locale : 'en'; }
export function getLocale(): string { return current; }

function lookup(pack: Pack | undefined, key: string): string | undefined {
  let node: string | Pack | undefined = pack;
  for (const part of key.split('.')) {
    if (node == null || typeof node === 'string') return undefined;
    node = node[part];
  }
  return typeof node === 'string' ? node : undefined;
}

export function t(key: string, vars?: Record<string, string | number>): string {
  const raw = lookup(packs.get(current), key) ?? lookup(packs.get('en'), key) ?? key;
  return vars ? raw.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : raw;
}

export function has(key: string): boolean { return lookup(packs.get(current), key) != null || lookup(packs.get('en'), key) != null; }
