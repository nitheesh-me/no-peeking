/*
 * Exact-pitch renders of game sounds (render.js job.script): calls the game's own SFX functions
 * directly (no AudioEngine.sfx() random pitch/volume), plus a TUNED bot BEEP that reuses the game's
 * listen_beep recipe (two square blips through a 3.2 kHz low-pass, 110 ms apart, the second drooping)
 * with chosen notes.
 * job.items = [ {fn:'sfx', name, t, p} | {fn:'beep', t, f1, f2a, f2b} ]
 */
export default async function (api) {
  const { ctx, kit, out, S, C, job } = api;
  const blip = (v, d, t, f0, f1, glide, peak, dec, type) => {
    const g = v.gain(0, d);
    const end = C.perc(g.gain, t, 0.002, peak, dec);
    const o = v.osc(type, f0, t, end, g);
    if (f1 !== f0) { o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + glide); }
  };
  for (const it of job.items) {
    if (it.fn === 'sfx') {
      const gn = ctx.createGain(); gn.gain.value = S.SFX_GAIN[it.name] ?? 1; gn.connect(out);
      S.SFX[it.name](kit, gn, it.t, it.p);
    } else if (it.fn === 'beep') {
      const v = new C.Voice(kit);
      const lp = v.filter('lowpass', 3200, 1, out);
      blip(v, lp, it.t, it.f1, it.f1, 0, 0.14, 0.1, 'square');
      blip(v, lp, it.t + 0.11, it.f2a, it.f2b, 0.12, 0.15, 0.16, 'square');
    }
  }
  api.tick = () => {};
}
