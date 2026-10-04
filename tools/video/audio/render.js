/*
 * NO PEEKING! offline renderer (runs INSIDE the page served by vite; driven by engine_render.py).
 *
 * Renders the game's own WebAudio engine (src/audio) into an OfflineAudioContext, so every
 * sound is bit-for-bit the game's synthesis, just at 48 kHz float and without the live
 * engine's master glue/limiter (master: 'raw') unless asked (master: 'game').
 *
 * job = {
 *   secs, sr=48000, seed,
 *   music: false,            // sequencer music on/off
 *   master: 'raw'|'game',    // raw = bypass glue comp + limiter + trim (hi-fi library)
 *   dry: true,               // true = no engine reverb sends (sfx / voice / music)
 *   scene0: 'title',
 *   calls: [ {t, k:'sfx', name, opts} | {t, k:'bot', i, r} | {t, k:'chord', bits}
 *          | {t, k:'voice', who, i, line} | {t, k:'scene'|'tension'|'harmony'|'vol', v} ],
 *   script: '/tools/video/audio/score_alt.js'   // optional: module exporting default(api)
 * }
 * Result: window.__pcm (interleaved stereo Float32Array), returns frame count.
 */
async (job) => {
  // deterministic Math.random (mulberry32), so every render of a job is identical
  let seed = (job.seed >>> 0) || 0x9e3779b9;
  Math.random = function () {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const { AudioEngine } = await import('/src/audio/index.ts');
  const SR = job.sr || 48000, secs = job.secs;
  const ctx = new OfflineAudioContext(2, Math.ceil(SR * secs), SR);
  const e = new AudioEngine();
  e.st.scene = job.scene0 || 'title';
  e.st.vol = { master: 1, music: job.music ? 0.6 : 0, sfx: 1, voice: 1 };
  e.attach(ctx, { manual: true });
  if (job.master !== 'game') {
    // bypass the live master chain (glue comp → limiter → trim): we master in python
    e.master.disconnect();
    e.master.connect(ctx.destination);
  }
  if (job.dry) {
    e.sfxVerb.gain.value = 0;
    // voice reverb send: Babbler holds it privately; mute the convolver path by detaching it
    try { e.babbler.verb.gain && (e.babbler.verb.gain.value = 0); } catch (_) { /* ignore */ }
  }

  let api = null;
  if (job.script) {
    const mod = await import(job.script);
    const I = await import('/src/audio/instruments.ts');
    const M = await import('/src/audio/music.ts');
    const B = await import('/src/audio/bots.ts');
    const S = await import('/src/audio/sfx.ts');
    const C = await import('/src/audio/core.ts');
    // direct instrument access: script schedules notes itself into its own buses
    const out = ctx.createGain();
    out.connect(ctx.destination);
    api = { ctx, kit: e.kit, out, I, M, B, S, C, engine: e, job };
    await mod.default(api);
  }

  const q = 128 / SR;
  const calls = (job.calls || []).map((c) => ({ ...c, t: Math.max(0, Math.round(c.t / q) * q) })).sort((a, b) => a.t - b.t);
  let ci = 0;
  const run = (c) => {
    if (c.k === 'scene') e.setScene(c.v);
    else if (c.k === 'tension') e.setTension(c.v);
    else if (c.k === 'harmony') e.setHarmony(c.v);
    else if (c.k === 'vol') e.setVolumes(c.v);
    else if (c.k === 'sfx') e.sfx(c.name, c.opts || {});
    else if (c.k === 'bot') e.botNote(c.i, c.r ? 1 : 0);
    else if (c.k === 'chord') e.syndromeChord(c.bits);
    else if (c.k === 'voice') e.voice(c.who, (c.line || '')[c.i] || '', c.i, c.line);
  };
  // suspension points: every call time + a 40 ms grid when the sequencer must be fed
  const pts = new Set();
  for (const c of calls) pts.add(c.t);
  if (job.music || job.script) for (let t = 0.04; t < secs - 0.05; t += 0.04) pts.add(Math.round(t / q) * q);
  const times = [...pts].filter((t) => t > 0 && t < secs - q).sort((a, b) => a - b);
  const doAt = (t) => {
    while (ci < calls.length && calls[ci].t <= t + 1e-9) run(calls[ci++]);
    if (job.music) e.scheduleUntil(t + 0.12);
    if (api && api.tick) api.tick(t);
  };
  for (const t of times) ctx.suspend(t).then(() => { doAt(ctx.currentTime); ctx.resume(); });
  doAt(0);
  const buf = await ctx.startRendering();
  const L = buf.getChannelData(0), R = buf.getChannelData(1);
  const n = L.length, out = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) { out[2 * i] = L[i]; out[2 * i + 1] = R[i]; }
  window.__pcm = out;
  return n;
}
