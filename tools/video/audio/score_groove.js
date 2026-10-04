/*
 * NO PEEKING! "coding groove": the game's own BUILD-scene groove (src/audio/music.ts: SCENES.build =
 * soft drums, roots bass, EP comp on the "and", sparse music-box lead), re-cut for the trailer song's
 * context: 112.5 BPM 3/4 (6 straight 8ths per bar), F minor (the song's drop/payoff key), plus a light
 * percussive "typing" layer (the game's wood-block clock on the off-8ths). Runs inside render.js.
 *
 * job.plan = sheet.plan(); job.span = [t0, t1] (seconds, timeline) — rendered on the cue sheet's beat
 * grid, so the stems are timeline-aligned (sample t of the stem = timeline time t).
 * job.stem: 'perc' (soft kick, brushes, hats) | 'type' (wood-block typing ticks) | 'bass' (F/C pedal,
 *           no 3rd: safe under the song) | 'keys' (EP comp Fm9-Dbmaj7-Bbm9-C7 + sparse box: for
 *           "replace" segments only).
 */
export default async function (api) {
  const { ctx, kit, out, I, C, job } = api;
  const P = job.plan, SB = P.beat_s, BPB = P.bpb, BAR = P.bar_s, E8 = SB / 2;
  const [t0, t1] = job.span;
  const g = (v, dest) => { const n = ctx.createGain(); n.gain.value = v; n.connect(dest); return n; };
  const conv = ctx.createConvolver(); conv.buffer = C.makeImpulse(ctx, 1.6, 4.0); conv.connect(g(1, out));
  const bus = g(1, out); bus.connect(g(job.stem === 'keys' ? 0.3 : 0.1, conv));
  let rs = 5; const rnd = () => ((rs = (rs * 16807) % 2147483647) / 2147483647);
  const N = [];
  const at = (t, fn) => N.push([t, fn]);
  // first downbeat at/after t0 on the sheet grid (k % bpb == 0)
  let k = Math.ceil((t0 - P.beat0_s) / SB - 1e-6); while (k % BPB) k++;
  // chords (2 bars each): Fm9, Dbmaj7, Bbm9, C7(b9-free)
  const CH = [[41, [56, 60, 63, 67]], [37, [53, 56, 60, 65]], [46, [53, 56, 60, 61]], [36, [52, 55, 58, 60]]];
  let bar = 0;
  for (let tb = P.beat0_s + k * SB; tb < t1 - 1e-6; tb += BAR, bar++) {
    const [root, voi] = CH[Math.floor(bar / 2) % 4];
    for (let s = 0; s < BPB * 2; s++) {
      const t = tb + s * E8;
      if (t >= t1 - 1e-6) break;
      if (job.stem === 'perc') at(t, () => {
        if (s === 0) I.kick(kit, bus, t, 0.75);
        if (s === 3) I.kick(kit, bus, t, 0.45);
        if (s === 2 || s === 4) I.brush(kit, bus, t, 0.65);
        const hv = (s % 2 ? 1 : 0.55) * 0.65 * (0.85 + 0.25 * rnd());
        I.hat(kit, bus, t, hv, false, 0.25);
      });
      if (job.stem === 'type' && s % 2 === 1) at(t, () => I.clock(kit, bus, t, (s + bar) % 4 === 1, 0.35 + 0.1 * rnd()));
      if (job.stem === 'type' && s === 5 && bar % 2 === 1) at(t + E8 / 2, () => I.clock(kit, bus, t + E8 / 2, true, 0.25));
      if (job.stem === 'bass') at(t, () => {
        if (s === 0) I.bass(kit, bus, t, 41, 2 * SB * 0.95, 0.9);        // F2 (pedal: the song's F-minor home)
        if (s === 4) I.bass(kit, bus, t, 48, SB * 0.9, 0.6);             // C3 (the 5th; no 3rd)
      });
      if (job.stem === 'keys') at(t, () => {
        if (s === 0 && bar % 2 === 0) I.bass(kit, bus, t, root, 3 * SB, 0.8);
        if (s === 1 || s === 4) voi.forEach((m, i) => I.ep(kit, bus, t + i * 0.012, m, SB * 1.2, 0.55, (i - 1.5) * 0.25, 0));
        if (bar % 4 === 0 && s < 3) I.musicBox(kit, bus, t, [72, 77, 79][s], 0.5, 0, 1.2);  // sparse lead (C F G, the theme head)
      });
    }
  }
  N.sort((a, b) => a[0] - b[0]);
  let ni = 0;
  api.tick = (t) => { while (ni < N.length && N[ni][0] < t + 0.16) { const [tt, fn] = N[ni++]; if (tt >= t - 0.002) fn(); } };
}
