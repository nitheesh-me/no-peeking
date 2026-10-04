/**
 * Capture-only "cinema" layout for the promo videos. Flag-gated: without `?cinema=1` in the URL every export
 * here is inert (cinema.on === false) and nothing in the game changes.
 *
 *   ?cinema=1                 the scene canvas fills the viewport; editor, top bar, controls, timeline, dialogue,
 *                             hints, toasts, HUD and every badge/watermark are hidden (game logic runs as normal)
 *   &camera=<preset>          frame the room tighter, rendered in-engine (vector art, so always ≥1:1 pixels):
 *                             wide (default) · room · tight · close · zoom:<z>[,<fx>,<fy>]   (fx, fy = 0..1 focus in the viewport)
 *                             on:<creatureId>,<z>[,<fx>,<fy>]  (that Qubble/bot placed at fx, fy)
 *   &hud=1                    keep the stage HUD (phase pill, fidelity meter, Test strip)
 *   &toasts=1                 keep toasts
 *   &dialogue=1               keep the dialogue box
 *   &nb=1                     keep Schrödi's Lab Notebook drawer, allowed to fill the whole width (circuit reveal)
 *   &insert=<codexEntryId>    Codex: open that entry's live animation full-frame (hero insert, no chrome)
 *   &part=sphere              … with &insert: show the entry's 3D Bloch sphere full-frame instead
 *   &izoom=<s>                … the insert's drawing scale (default 2.2)
 *   camera=on:door|window|clock,<z>  frame a wall object
 */
const q = typeof location !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams();
const flag = (k: string) => { const v = q.get(k); return v !== null && v !== '0' && v !== 'false'; };

export interface CinemaCamera { zoom: number; fx: number; fy: number; on?: string }
const PRESETS: Record<string, CinemaCamera> = {
  wide: { zoom: 1, fx: 0.5, fy: 0.5 },
  room: { zoom: 1.2, fx: 0.5, fy: 0.62 },
  tight: { zoom: 1.45, fx: 0.5, fy: 0.62 },
  close: { zoom: 1.8, fx: 0.5, fy: 0.62 },
};
function parseCamera(s: string | null): CinemaCamera {
  if (!s) return PRESETS.wide;
  if (PRESETS[s]) return PRESETS[s];
  const m = /^zoom:([\d.]+)(?:,([\d.]+),([\d.]+))?$/.exec(s);
  if (m) return { zoom: Math.max(0.5, Math.min(4, +m[1])), fx: m[2] ? +m[2] : 0.5, fy: m[3] ? +m[3] : 0.5 };
  // on:<creatureId>,<zoom>[,<fx>,<fy>] → zoom so that creature sits at viewport point (fx, fy) (default centre)
  const o = /^on:(\w+),([\d.]+)(?:,([\d.]+),([\d.]+))?$/.exec(s);
  if (o) return { on: o[1], zoom: Math.max(0.5, Math.min(4, +o[2])), fx: o[3] ? +o[3] : 0.5, fy: o[4] ? +o[4] : 0.55 };
  return PRESETS.wide;
}

export const cinema = {
  on: flag('cinema'),
  camera: parseCamera(q.get('camera')),
  hud: flag('hud'),
  toasts: flag('toasts'),
  dialogue: flag('dialogue'),
  nb: flag('nb'),
  insert: q.get('insert'),
  part: q.get('part'),
  /** &izoom=<s>: drawing scale of a Codex hero insert (the panel's own is 1.15) */
  izoom: +(q.get('izoom') ?? 2.2) || 2.2,
};

/** Called once from main.ts: tags <html> so the cinema stylesheet applies. No-op without the flag. */
export function applyCinema(): void {
  if (!cinema.on) return;
  const c = document.documentElement.classList;
  c.add('cinema');
  if (cinema.hud) c.add('cinema-hud');
  if (cinema.toasts) c.add('cinema-toasts');
  if (cinema.dialogue) c.add('cinema-dialogue');
  if (cinema.insert) c.add('cinema-insert');
  if (cinema.nb) c.add('cinema-nb');
}
