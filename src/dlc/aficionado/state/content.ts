/**
 * Content packs discovered at build time; each JSON is its own lazily loaded chunk.
 * A locale may be split over several files: `<locale>.json` (Curriculum Author) plus `<locale>.<part>.json`
 * (e.g. en.shell.json, the shell/editor UI strings); they are deep-merged, the main pack winning on conflicts.
 */
import { registerPack, setLocale, type Pack } from '../../../i18n/index';

const PACKS = import.meta.glob<{ default: Pack }>('../content/*.json');
const locOf = (p: string) => p.replace(/^.*\/([\w-]+)(?:\.[\w-]+)?\.json$/, '$1');

export function availableLocales(): string[] {
  return [...new Set(Object.keys(PACKS).map(locOf))].sort();
}

function merge(a: Pack, b: Pack): Pack {
  const out: Pack = { ...a };
  for (const [k, v] of Object.entries(b)) {
    const cur = out[k];
    out[k] = typeof v === 'object' && v && typeof cur === 'object' && cur ? merge(cur, v) : v;
  }
  return out;
}

/** Loads `en` (the fallback) and the requested locale. Returns the byte size of what was loaded. */
export async function loadContent(locale: string): Promise<number> {
  let bytes = 0;
  for (const loc of new Set(['en', locale])) {
    const parts = Object.keys(PACKS).filter((p) => locOf(p) === loc).sort((x, y) => (x.endsWith(`/${loc}.json`) ? 1 : 0) - (y.endsWith(`/${loc}.json`) ? 1 : 0));
    if (!parts.length) continue;
    let pack: Pack = {};
    for (const p of parts) { const m = await PACKS[p](); pack = merge(pack, m.default); bytes += JSON.stringify(m.default).length; }
    registerPack(loc, pack);
  }
  setLocale(locale);
  return bytes;
}
