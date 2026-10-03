/** Audio test bench: open `npx vite` → /src/audio/test.html */
import type { MusicScene, SfxName } from '../core/contracts';
import { audio, AudioEngine } from './index';

const SCENES: MusicScene[] = ['title', 'map', 'build', 'run', 'win', 'lightsout', 'lab', 'credits'];
const SFX_NAMES: SfxName[] = [
  'boop', 'shush', 'spin', 'highfive', 'listen_beep', 'listen_quiet', 'reset', 'peek_collapse',
  'gremlin_sneak', 'gremlin_flip', 'ghost_phase', 'wobble', 'test_pass', 'test_fail', 'level_win',
  'ui_click', 'ui_hover', 'card_pick', 'card_drop', 'rewind', 'snap_measure', 'qubble_snore',
  'qubble_giggle', 'schrodi_meow', 'glitch',
];

const $ = (id: string) => document.getElementById(id)!;
const btn = (parent: string, label: string, fn: () => void) => {
  const b = document.createElement('button');
  b.textContent = label;
  b.onclick = () => {
    void audio.unlock();
    fn();
  };
  $(parent).appendChild(b);
  return b;
};

$('unlock').onclick = () => void audio.unlock().then(() => ($('unlock').textContent = 'Audio on ✓'));
const sceneBtns: HTMLButtonElement[] = [];
for (const s of SCENES)
  sceneBtns.push(
    btn('scenes', s, () => {
      audio.setScene(s);
      sceneBtns.forEach((b) => b.classList.toggle('on', b.textContent === s));
    }),
  );
const slider = (id: string, label: string, fn: (v: number) => void) => {
  const el = $(id) as HTMLInputElement;
  el.oninput = () => {
    fn(+el.value);
    if (label) $(label).textContent = (+el.value).toFixed(2);
  };
};
slider('harmony', 'hv', (v) => audio.setHarmony(v));
slider('tension', 'tv', (v) => audio.setTension(v));
slider('vmaster', '', (v) => audio.setVolumes({ master: v }));
slider('vmusic', '', (v) => audio.setVolumes({ music: v }));
slider('vsfx', '', (v) => audio.setVolumes({ sfx: v }));

for (const bits of [[0, 0], [1, 0], [1, 1], [0, 1]] as (0 | 1)[][]) btn('syn2', bits.join(''), () => audio.syndromeChord(bits));
for (const bits of [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 1], [0, 0, 1], [1, 1, 1, 1, 1, 1, 1, 1]] as (0 | 1)[][])
  btn('syn3', bits.join(''), () => audio.syndromeChord(bits));
'abcdefgh'.split('').forEach((n, i) => {
  btn('bots', `bot ${n} BEEP`, () => audio.botNote(i, 1));
  btn('bots', `${n} quiet`, () => audio.botNote(i, 0));
});
for (const s of SFX_NAMES) btn('sfx', s, () => audio.sfx(s, { pan: Math.random() * 0.6 - 0.3 }));

// ───────── offline measurement (also driven headlessly) ─────────
interface Stats { name: string; peakDb: number; rmsDb: number; clipped: number }
function stats(name: string, buf: AudioBuffer): Stats {
  let peak = 0, sum = 0, n = 0, clipped = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) {
      const a = Math.abs(d[i]);
      if (a > peak) peak = a;
      if (a >= 0.999) clipped++;
      sum += d[i] * d[i];
      n++;
    }
  }
  const db = (x: number) => Math.round(20 * Math.log10(Math.max(x, 1e-9)) * 10) / 10;
  return { name, peakDb: db(peak), rmsDb: db(Math.sqrt(sum / n)), clipped };
}

export async function renderScene(scene: MusicScene, secs = 12, harmony = 1, tension = 0): Promise<Stats> {
  const ctx = new OfflineAudioContext(2, Math.floor(48000 * secs), 48000);
  const e = new AudioEngine();
  (e as unknown as { st: { scene: MusicScene; harmony: number; tension: number } }).st.scene = scene;
  e.setHarmony(harmony);
  e.setTension(tension);
  e.attach(ctx, { manual: true });
  e.scheduleUntil(secs);
  const buf = await ctx.startRendering();
  return stats(`${scene} h=${harmony} t=${tension}`, buf);
}

export async function renderSfx(fn: (e: AudioEngine) => void, name: string, secs = 3): Promise<Stats> {
  const ctx = new OfflineAudioContext(2, Math.floor(48000 * secs), 48000);
  const e = new AudioEngine();
  e.setVolumes({ music: 0 });
  e.attach(ctx, { manual: true });
  fn(e);
  const buf = await ctx.startRendering();
  return stats(name, buf);
}

export async function measureAll(): Promise<Stats[]> {
  const out: Stats[] = [];
  for (const s of SCENES) out.push(await renderScene(s, 12));
  out.push(await renderScene('run', 12, 0.2, 1));
  out.push(await renderScene('credits', 12, 1, 1));
  for (const s of SFX_NAMES) out.push(await renderSfx((e) => e.sfx(s), `sfx:${s}`));
  for (const b of [[0, 0], [1, 0], [1, 1], [0, 1]] as (0 | 1)[][]) out.push(await renderSfx((e) => e.syndromeChord(b), `syn:${b.join('')}`));
  out.push(await renderSfx((e) => e.syndromeChord([1, 1, 1, 1, 1, 1, 1, 1]), 'syn:11111111'));
  return out;
}

$('meter').onclick = async () => {
  $('out').textContent = 'rendering…';
  const r = await measureAll();
  $('out').textContent = r.map((s) => `${s.name.padEnd(28)} peak ${s.peakDb.toFixed(1).padStart(6)} dBFS   rms ${s.rmsDb.toFixed(1).padStart(6)} dBFS   clipped ${s.clipped}`).join('\n');
};
(window as unknown as Record<string, unknown>).__audioTest = { measureAll, renderScene, renderSfx };
