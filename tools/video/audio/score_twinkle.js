/*
 * NO PEEKING! public trailer score: an original lullaby-epic arrangement of the public-domain melody
 * "Ah ! vous dirai-je, maman" (Twinkle Twinkle Little Star), as a waltz in C major, played ONLY by the
 * game's own instruments (src/audio/instruments.ts). Runs inside render.js (job.script); python
 * (score.py) adds the energy automation (LPF sweeps, submerged proof, Lights Out low-pass), the
 * tape-stop at the peek, the reversed cymbal and the heavier drum layers.
 *
 * job.plan = sheet.plan(): {beat_s, bpb, bar_s, beat0_s, t:{cold_open, peek, build, silence, beep, drop,
 *            proof, montage, lights_out, revcym, payoff, closing, closing_silence, snap, end_card, end}}
 * job.stem = 'box' | 'harm' | 'bass' | 'drums' (one render per stem).
 *
 *   cold_open  hushed music box, phrase A, over a C drone with a Db rub (the harmony lies); decays into the hit
 *   peek       the SAME music box, now damaged: ±30 c wow (engine wobble LFO), -6 dB (tape-stop added in python)
 *   build      pizzicato ostinato on 8ths, wood-block clock, heartbeat, phrase B low on the EP; all rising
 *   silence    nothing
 *   drop       tutti: phrase A on music box + pluck + EP in octaves, oom-pah-pah, big 1, brushes 2 & 3
 *   proof      the groove without the tune (python submerges it: LPF 1.2 kHz, -6 dB)
 *   montage    filter open: phrase B then A, full groove
 *   lights_out pad + pedal only
 *   payoff     loudest: phrase A doubled at the octave, extra kick, swell; the harmony finally all major
 *   closing    music box alone: "twin-kle twin-kle lit-tle STAR" (held)
 *   snap..end  warm Cmaj7 swell, then "how I won-der what you are" over a final Cmaj9
 */
export default async function (api) {
  const { ctx, kit, out, I, C, engine, job } = api;
  const P = job.plan, T = P.t, SB = P.beat_s, BPB = P.bpb, BAR = P.bar_s, E8 = SB / 2;
  const want = (g) => !job.stem || job.stem === 'all' || job.stem === g;
  const g = (v, dest) => { const n = ctx.createGain(); n.gain.value = v; n.connect(dest); return n; };
  const conv = ctx.createConvolver(); conv.buffer = C.makeImpulse(ctx, 3.2, 2.4); conv.connect(g(1, out));
  const busBox = g(0.9, out); busBox.connect(g(0.7, conv));
  const busHarm = g(0.8, out); busHarm.connect(g(0.4, conv));
  const busDr = g(0.9, out); busDr.connect(g(0.12, conv));
  const busBass = g(0.9, out); busBass.connect(g(0.06, conv));

  // damaged music box after the peek: engine wobble LFO (0.55 Hz + 4.3 Hz) at ±30 cents, box -6 dB
  const wob = kit.wobble.gain;
  wob.setValueAtTime(0, 0);
  wob.setValueAtTime(0, T.peek); wob.linearRampToValueAtTime(30, T.peek + 0.15);
  wob.setValueAtTime(30, T.build - 0.3); wob.linearRampToValueAtTime(0, T.build);
  busBox.gain.setValueAtTime(0.9, T.peek); busBox.gain.linearRampToValueAtTime(0.45, T.peek + 0.05);
  busBox.gain.setValueAtTime(0.45, T.build); busBox.gain.linearRampToValueAtTime(0.9, T.build + 0.1);

  // drone: C with a Db rub (Phrygian) through cold open → build; gone at the silence
  if (want('harm')) {
    const dr = g(0, busHarm);
    for (const [m, a] of [[36, 0.5], [48, 0.3], [55, 0.12], [49, 0.06]]) {
      const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = C.mtof(m);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380;
      o.connect(lp).connect(g(a, dr)); o.start(0); o.stop(T.silence + 0.05);
    }
    dr.gain.setValueAtTime(0, 0); dr.gain.linearRampToValueAtTime(0.07, Math.max(0.5, T.peek * 0.6));
    dr.gain.setValueAtTime(0.07, T.build); dr.gain.linearRampToValueAtTime(0.14, T.silence - 0.05);
    dr.gain.linearRampToValueAtTime(0, T.silence);
  }

  // ───── melody & harmony data (beats within a 3/4 bar) ─────
  const A = [[[0, 0, 1], [1, 0, 1], [2, 7, 1]], [[0, 7, 1], [1, 9, 1], [2, 9, 1]], [[0, 7, 3]],
             [[0, 5, 1], [1, 5, 1], [2, 4, 1]], [[0, 4, 1], [1, 2, 1], [2, 2, 1]], [[0, 0, 3]]];
  const Bp = [[[0, 7, 1], [1, 7, 1], [2, 5, 1]], [[0, 5, 1], [1, 4, 1], [2, 4, 1]], [[0, 2, 3]],
              [[0, 7, 1], [1, 7, 1], [2, 5, 1]], [[0, 5, 1], [1, 4, 1], [2, 4, 1]], [[0, 2, 3]]];
  const CH_A = [[48, [60, 64, 67]], [53, [60, 65, 69]], [48, [60, 64, 67]], [53, [57, 60, 65]], [43, [59, 62, 67]], [48, [60, 64, 67]]];
  const CH_B = [[48, [60, 64, 67]], [53, [60, 64, 65, 69]], [43, [59, 62, 67]], [48, [60, 64, 67]], [53, [60, 64, 65, 69]], [43, [59, 62, 65, 67]]];
  const KEY = 72; // C5 music-box register

  const N = [];
  const at = (t, fn) => N.push([t, fn]);
  let rs = 11; const rnd = () => ((rs = (rs * 16807) % 2147483647) / 2147483647);
  const det = () => (rnd() - 0.5) * 16;
  // downbeats (k % bpb == 0) inside [a, b)
  const downbeats = (a, b) => {
    const r = []; let k = Math.ceil((a - P.beat0_s) / SB - 1e-6);
    while (k % BPB) k++;
    for (let t = P.beat0_s + k * SB; t < b - 1e-6; t += BAR) if (t >= a - 1e-6) r.push(t);
    return r;
  };
  const melody = (bars, phrase, from, opts) => bars.forEach((t0, i) => {
    const bar = phrase[(from + i) % 6];
    for (const [bt, semi, len] of bar) {
      const t = t0 + bt * SB;
      if (opts.until && t >= opts.until - 0.05) continue;
      if (want('box')) at(t, () => {
        I.musicBox(kit, busBox, t, KEY + semi + (opts.oct || 0), opts.v ?? 0.8, opts.pan ?? 0, opts.len ?? 1.6);
        if (opts.pluck) I.pluck(kit, busBox, t, KEY + semi + 12, opts.pluck, 0.15);
        if (opts.low) I.musicBox(kit, busBox, t + 0.01, KEY + semi - 12, opts.low, 0, 1.4);
      });
      if (opts.ep && want('harm')) at(t, () => I.ep(kit, busHarm, t, KEY + semi - 12, len * SB * 0.95, opts.ep, 0, 0));
    }
  });
  const harmony = (bars, chords, from, o) => bars.forEach((t0, i) => {
    const [root, voi] = chords[(from + i) % 6];
    if (want('harm') && o.pad) at(t0, () => { for (const m of voi) I.pad(kit, busHarm, t0, m, BAR, o.pad, det()); });
    if (want('harm') && o.ep) at(t0, () => { for (const m of voi) I.ep(kit, busHarm, t0, m, BAR * 0.9, o.ep, 0, 0); });
    if (want('bass') && o.bass) {
      at(t0, () => I.bass(kit, busBass, t0, root - 12 + (o.bassOct || 0), SB * 0.95, o.bass));
      if (o.oompah) for (const b of [1, 2]) { const t = t0 + b * SB; at(t, () => { for (const m of voi) I.pizz(kit, busBass, t, m, o.oompah * 0.5, (m % 2) ? 0.25 : -0.25); }); }
    }
    if (want('drums') && o.drums) for (let s = 0; s < BPB * 2; s++) {
      const t = t0 + s * E8;
      at(t, () => {
        if (s === 0) I.kick(kit, busDr, t, o.drums);
        if (s === 2 || s === 4) I.brush(kit, busDr, t, 1.1 * o.drums);
        I.hat(kit, busDr, t, (s % 2 ? 0.5 : 0.8) * o.drums, false, 0.25);
        if (o.extraKick && s === 5) I.kick(kit, busDr, t, 0.7 * o.drums);
      });
    }
  });

  // cold open: hushed phrase A (bars 1-4), detuned octave-down copy, decaying into the peek hit
  {
    const bars = downbeats(T.cold_open, T.peek);
    melody(bars, A, 0, { v: 0.5, len: 2.6, low: 0.07, until: T.peek - BAR });  // a breath before the collapse (decays into the hit)
  }
  // peek: damaged box continues phrase A (bars 5-6 + 1)
  melody(downbeats(T.peek, T.build), A, 4, { v: 0.75, len: 2.4, until: T.build });
  // build: ostinato, clock, heartbeat, phrase B low on EP + pads
  {
    const bars = downbeats(T.build, T.silence);
    const pat = [48, 51, 55, 56, 55, 51]; // C Eb G Ab G Eb on 8ths (minor, tense)
    let i = 0;
    for (let t = T.build; t < T.silence - 1e-6; t += E8, i++) {
      const u = (t - T.build) / (T.silence - T.build);
      if (want('bass')) at(t, () => I.pizz(kit, busBass, t, pat[i % pat.length] + (u > 0.5 && i % 2 ? 12 : 0), 0.45 + 0.55 * u, i % 2 ? 0.3 : -0.3));
      if (want('drums')) at(t, () => I.clock(kit, busDr, t, i % 2 === 0, 0.3 + 0.5 * u));
    }
    // (no heartbeat here: the heartbeat belongs to the cold open only — Critic, sound milestone #4)
    melody(bars, Bp, 0, { v: 0.0001, ep: 0.6 });
    harmony(bars, CH_B, 0, { pad: 0.55 });
  }
  // drop: tutti phrase A
  {
    const bars = downbeats(T.drop, T.proof);
    melody(bars, A, 0, { v: 1.0, pluck: 0.6, ep: 0.7, len: 1.4 });
    melody(bars, A, 0, { v: 0.45, oct: 12, pluck: 0.9, len: 0.9 }); // phrase A an octave up on a bright pluck
    harmony(bars, CH_A, 0, { pad: 0.7, ep: 0.5, bass: 1.1, oompah: 0.9, drums: 1.0 });
  }
  // proof: groove without the tune (submerged in python)
  {
    const bars = downbeats(T.proof, T.montage);
    harmony(bars, CH_A, 2, { pad: 0.6, bass: 0.9, oompah: 0.6, drums: 0.8 });
  }
  // montage: phrase B then A, full groove
  {
    const bars = downbeats(T.montage, T.lights_out);
    melody(bars, [...Bp, ...A].slice(0, 6).concat([]), 0, { v: 0.9, pluck: 0.5, ep: 0.55, len: 1.3 });
    if (bars.length > 6) melody(bars.slice(6), A, 0, { v: 0.95, pluck: 0.55, ep: 0.6, len: 1.3 });
    harmony(bars.slice(0, 6), CH_B, 0, { pad: 0.6, ep: 0.45, bass: 1.0, oompah: 0.8, drums: 0.95 });
    if (bars.length > 6) harmony(bars.slice(6), CH_A, 0, { pad: 0.6, ep: 0.45, bass: 1.0, oompah: 0.8, drums: 0.95 });
  }
  // lights out: pad + pedal only
  {
    const bars = downbeats(T.lights_out, T.payoff);
    harmony(bars, [[43, [55, 59, 62, 65]], [43, [55, 59, 62, 65]], ...CH_A], 0, { pad: 0.9, bass: 0.6 });
  }
  // payoff: loudest — phrase A doubled at the octave, extra kick, swell on the slam
  {
    const bars = downbeats(T.payoff, T.closing);
    melody(bars, A, 0, { v: 1.1, pluck: 0.75, ep: 0.85, low: 0.5, len: 1.5 });
    melody(bars, A, 0, { v: 0.6, oct: 12, len: 1.2 });
    harmony(bars, CH_A, 0, { pad: 0.9, ep: 0.7, bass: 1.25, oompah: 1.1, drums: 1.25, extraKick: true });
    if (want('drums')) at(T.payoff, () => I.swell(kit, busDr, T.payoff, 2.4, 1.8));
  }
  // closing: music box alone — "twin-kle twin-kle lit-tle STAR" (8ths, then the held star)
  {
    const t0 = T.closing, stop = T.closing_silence ?? (T.snap - BAR);
    const notes = [0, 0, 7, 7, 9, 9];
    notes.forEach((s, i) => { const t = t0 + i * E8; if (t < stop - 0.1) box(t, KEY + s, 0.6, 1.8); });
    box(t0 + BPB * SB, KEY + 7, 0.65, Math.max(1.5, stop - t0 - BPB * SB + 0.4));
  }
  function box(t, m, v, len) { if (want('box')) at(t, () => I.musicBox(kit, busBox, t, m, v, 0, len)); }
  // snap → warm Cmaj7 swell + sparkle
  if (want('harm')) at(T.snap, () => { for (const m of [48, 52, 55, 59, 64]) I.pad(kit, busHarm, T.snap, m, T.end_card - T.snap + 0.8, 1.0, 0); });
  if (want('box')) at(T.snap + 0.03, () => { [79, 83, 84, 88].forEach((m, i) => I.musicBox(kit, busBox, T.snap + 0.06 * i, m, 0.45, 0, 3)); });
  // end card: "how I won-der what you are" over a final Cmaj9
  {
    const es = T.end_card, ee = T.end;
    if (want('harm')) at(es, () => { for (const m of [36, 48, 52, 55, 59, 62]) { I.ep(kit, busHarm, es, m, ee - es - 0.4, 0.8, 0, 0); I.pad(kit, busHarm, es, m + 12, ee - es, 0.7, 0); } });
    if (want('bass')) at(es, () => I.bass(kit, busBass, es, 24, ee - es - 0.4, 1));
    const tail = [[0, 5], [1, 5], [2, 4], [3, 4], [4, 2], [5, 2], [6, 0]];
    for (const [b, s] of tail) { const t = es + SB * 0.5 + b * SB; if (t < ee - 1) box(t, KEY + s, 0.55, b === 6 ? 3.5 : 1.8); }
  }

  N.sort((a, b) => a[0] - b[0]);
  let ni = 0;
  api.tick = (t) => { while (ni < N.length && N[ni][0] < t + 0.16) { const [tt, fn] = N[ni++]; if (tt >= t - 0.002) fn(); } };
  void engine;
}
