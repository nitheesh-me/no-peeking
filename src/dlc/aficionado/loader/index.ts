/**
 * The real staged loading sequence (docs/AFICIONADO.md §2). Each stage is a real dynamic import or fetch;
 * byte counts come from Resource Timing (0 when the browser already had the chunk: shown as "cached").
 * The finale measures five wires of a real circuit (H⊗5 → measure, through src/quantum) with fresh entropy.
 */
import { QState } from '../../../quantum/sim';
import type { Program } from '../../../core/contracts';
import type { LoadStage } from '../contracts';
import type { CreateLoadingCircuit } from '../state/vizApi';
import { loadContent } from '../state/content';
import { loadLevels, type AfiModule } from '../state/levels';
import { t, has } from '../../../i18n/index';
import { fallbackLoadingCircuit } from './fallbackCircuit';

const VIZ = import.meta.glob('../viz/*.ts');
const LC = import.meta.glob<{ createLoadingCircuit?: CreateLoadingCircuit; loadingCircuitProgram?: (n: number) => Program }>('../viz/loadingCircuit.ts');

export interface LoadResult { modules: AfiModule[]; fallbackLevels: boolean; webgl: boolean; outcomes: (0 | 1)[] }
export interface LoaderOpts { locale: string; reducedMotion: boolean; webgl: boolean; fast: boolean; skippable: boolean }

/** Literal technical identifiers (stage names are module ids, not prose). Translated text wins when the pack has it. */
const ID = { cmd: 'load module: technical_aficionado', core: 'dlc_core', three: 'three.js', d3: 'd3', assets: 'shaders+fonts', content: 'content_pack', levels: 'level_data' };
const label = (k: keyof typeof ID): string => (has(`afi.loader.${k}`) ? t(`afi.loader.${k}`) : ID[k]);
/** The loader runs before the content pack (stage 5) is loaded, so its few words have identifier fallbacks. */
const TF: Record<string, string> = { skip: 'skip ⏭', skipped: 'skipped: webgl=off', cached: 'cached', measure: 'measure q[0..4]' };
const tf = (k: string): string => (has(`afi.loader.${k}`) ? t(`afi.loader.${k}`) : TF[k]);

function newBytes(from: number): number {
  const es = performance.getEntriesByType('resource').slice(from) as PerformanceResourceTiming[];
  return es.reduce((s, e) => s + (e.encodedBodySize || e.transferSize || e.decodedBodySize || 0), 0);
}
const fmtBytes = (b: number): string => (b >= 1024 * 1024 ? `${(b / 1048576).toFixed(2)} MB` : b >= 1024 ? `${(b / 1024).toFixed(1)} KB` : `${b} B`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function webglAvailable(): boolean {
  try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { return false; }
}

/**
 * Five real Born samples from the circuit the loading bar drew (its Bot Code program, run on the shared
 * state-vector simulator), or H⊗5 when no program is given; then every wire is measured (crypto-seeded RNG).
 */
export function bornSamples(n = 5, prog?: Program): (0 | 1)[] {
  const s = new QState();
  const seed = new Uint32Array(1); try { crypto.getRandomValues(seed); } catch { seed[0] = (Math.random() * 2 ** 32) >>> 0; }
  let x = seed[0] || 1;
  const rng = () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 2 ** 32; };
  const ids = Array.from({ length: n }, (_, i) => `q${i + 1}`);
  ids.forEach((id) => s.attach(id));
  if (prog?.length) for (const o of prog) {
    if (o.op === 'SPIN') s.h(o.t); else if (o.op === 'BOOP') s.x(o.t); else if (o.op === 'SHUSH') s.z(o.t); else if (o.op === 'HIGHFIVE') s.cnot(o.from, o.to);
  } else ids.forEach((id) => s.h(id));
  return ids.map((id) => s.measure(id, rng));
}

export async function runLoader(host: HTMLElement, opts: LoaderOpts): Promise<LoadResult> {
  try { performance.setResourceTimingBufferSize(2000); } catch { /* ignore */ }
  const wrap = document.createElement('div');
  wrap.className = 'afi-loader';
  wrap.setAttribute('role', 'status');
  wrap.setAttribute('aria-live', 'polite');
  const cmd = document.createElement('div'); cmd.className = 'afi-loader-cmd';
  const stageHost = document.createElement('div'); stageHost.className = 'afi-loader-viz';
  const log = document.createElement('div'); log.className = 'afi-loader-log';
  const skip = document.createElement('button'); skip.className = 'afi-btn ghost afi-loader-skip'; skip.hidden = !opts.skippable;
  wrap.append(cmd, stageHost, log, skip);
  host.appendChild(wrap);
  let skipping = opts.fast;
  skip.textContent = tf('skip');
  skip.onclick = () => { skipping = true; skip.disabled = true; };
  const onKey = (e: KeyboardEvent) => { if (opts.skippable && (e.key === 'Escape' || e.key === 'Enter')) skip.click(); };
  window.addEventListener('keydown', onKey);
  const wait = async (ms: number) => { if (!skipping && !opts.reducedMotion) await sleep(ms); };

  // the typed command line
  if (opts.reducedMotion || skipping) cmd.textContent = ID.cmd;
  else for (let i = 1; i <= ID.cmd.length; i++) { cmd.textContent = ID.cmd.slice(0, i); await sleep(skipping ? 0 : 28); }
  cmd.classList.add('done');

  let modules: AfiModule[] = [], fallbackLevels = true;
  const webgl = opts.webgl && webglAvailable();
  const stages: LoadStage[] = [
    { id: 'core', label: label('core'), run: async () => { await import('../shell/index'); return {}; } },
    { id: 'three', label: label('three'), run: async () => { if (!webgl) return { bytes: -1 }; await import('three'); return {}; } },
    { id: 'd3', label: label('d3'), run: async () => { await import('d3'); return {}; } },
    { id: 'assets', label: label('assets'), run: async () => {
      await Promise.all(Object.entries(VIZ).filter(([p]) => !p.endsWith('loadingCircuit.ts')).map(([, f]) => f().catch((e) => console.warn('[afi] viz module failed', e))));
      try { await Promise.race([document.fonts.ready, sleep(2500)]); } catch { /* no font API */ }
      return {};
    } },
    { id: 'content', label: label('content'), run: async () => ({ bytes: await loadContent(opts.locale) }) },
    { id: 'levels', label: label('levels'), run: async () => { const r = await loadLevels(); modules = r.modules; fallbackLevels = r.fallback; return { bytes: r.bytes }; } },
  ];

  let create: CreateLoadingCircuit = fallbackLoadingCircuit;
  let drawn: Program | undefined;
  const lcf = LC['../viz/loadingCircuit.ts'];
  if (lcf) { try { const m = await lcf(); if (m.createLoadingCircuit) { create = m.createLoadingCircuit; drawn = m.loadingCircuitProgram?.(stages.length); } } catch (e) { console.warn('[afi] loadingCircuit failed, using fallback', e); } }
  let lc;
  try { lc = create(stageHost, stages.map((s) => ({ id: s.id, label: s.label })), { reducedMotion: opts.reducedMotion }); }
  catch (e) { console.warn('[afi] loadingCircuit threw, using fallback', e); lc = fallbackLoadingCircuit(stageHost, stages, { reducedMotion: opts.reducedMotion }); }

  try {
    for (let i = 0; i < stages.length; i++) {
      const st = stages[i];
      const row = document.createElement('div'); row.className = 'afi-loader-row running';
      row.innerHTML = `<span class="k">${st.label}</span><span class="v">…</span>`;
      log.appendChild(row);
      lc.stageStart(i);
      const from = performance.getEntriesByType('resource').length;
      const t0 = performance.now();
      const r = await st.run();
      const measured = newBytes(from);
      const bytes = r.bytes === -1 ? undefined : (measured || r.bytes || 0);
      const ms = Math.round(performance.now() - t0);
      (row.querySelector('.v') as HTMLElement).textContent = r.bytes === -1 ? tf('skipped') : `${bytes ? fmtBytes(bytes) : tf('cached')} · ${ms} ms`;
      row.classList.replace('running', 'ok');
      lc.stageDone(i, bytes);
      await wait(260);
    }
    const outcomes = bornSamples(5, drawn);
    const meas = document.createElement('div'); meas.className = 'afi-loader-row ok';
    meas.innerHTML = `<span class="k">${tf('measure')}</span><span class="v">|${outcomes.join('')}⟩</span>`;
    log.appendChild(meas);
    await lc.finish(outcomes);
    await wait(900);
    return { modules, fallbackLevels, webgl, outcomes };
  } finally {
    window.removeEventListener('keydown', onKey);
    lc.destroy();
    wrap.remove();
  }
}
