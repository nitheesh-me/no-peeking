/** One global requestAnimationFrame loop. Subscribers get (t seconds, dt seconds). */
type Fn = (t: number, dt: number) => void;
const subs = new Set<Fn>();
let last = 0, running = false;

function frame(ms: number) {
  const t = ms / 1000;
  const dt = Math.min(0.1, last ? t - last : 0.016);
  last = t;
  for (const f of [...subs]) {
    try { f(t, dt); } catch (e) { console.error(e); subs.delete(f); }
  }
  if (subs.size) requestAnimationFrame(frame); else { running = false; last = 0; }
}

export function onFrame(f: Fn): () => void {
  subs.add(f);
  if (!running) { running = true; requestAnimationFrame(frame); }
  return () => subs.delete(f);
}
