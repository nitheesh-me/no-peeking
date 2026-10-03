# Engine & UI notes (Lead Programmer)

Run: `npm run dev` (dev server) · `npm run build` (typecheck + static build in `dist/`, `base: './'` so it can be hosted from any static path).
Deep links: `#title`, `#map`, `#level/2-3`, `#lab`, `#endless`, `#credits`.

## Architecture

```
src/main.ts            registers screens, unlocks audio on first gesture, routes by location.hash
src/engine/
  deps.ts              the ONLY import point for teammate modules (quantum, art, audio, levels)
  scene.ts             isometric Canvas2D renderer (IsoFn camera, DPR resize, depth-sorted entities,
                       bot roll-to-target HIGHFIVE, gremlin sneak/strike/flee, lights-out silhouettes,
                       x-ray blankets/silk threads, nerd ⟨Z⟩ labels, signs, day→night lighting, shake)
  playback.ts          NightResult trace player: play/pause/step/fast×4/rewind, audio cues,
                       one-way door for measurements (LISTEN/PEEK) and RESET
  loop.ts              single requestAnimationFrame loop (onFrame(fn) → unsubscribe)
  store.ts             localStorage save, written to 3 keys and read back by majority vote (the settings joke is true)
  util.ts              h() DOM builder, easing, modal(), toast(), icons
src/ui/
  app.ts               screen router (registerScreen / nav.go) + applySettings
  screens/title.ts     the "NO PEEKING!" letters on Qubbles; hovering a letter peeks it → collapse
  screens/map.ts       chapter islands, lock/unlock/stars, 'map-flip' syndrome beat after chapter 1
  screens/level.ts     scene + controls + editor + test strip + win card + hints (also used by lab/endless)
  screens/modes.ts     Gremlin Lab (sandbox, x-ray on) and Night Shift (seeded procedural 'rate' levels)
  screens/credits.ts
  editor/editor.ts     Bot Code editor (toolbox, columns, pointer drag & drop, chips, IF rows, arrows, undo, text)
  dialogue.ts          portrait + typewriter speech box with per-speaker blips
  meta.ts              clone-glitch (1-3) and the lights-out colour flood (4-2)
  settings.ts          settings modal
src/styles/main.css    all styles (tokens on :root, PALETTE colours)
```

### Show vs hide (design bible §6)
- Normal play: every Qubble is drawn with `blanket = 1`; the real Bloch vector is passed but covered. Gremlins are drawn
  only as black silhouettes over a dimming overlay (`scene.dim`) during the night; their sound still plays.
  Noise ticks are hidden on the timeline unless X-ray is on.
- X-ray (`X` key or button, automatically on when replaying a failed/clicked night): `blanket ≈ 0.25`, silk threads from
  `snapshot.links`, gremlins fully drawn, fidelity meter shown. Nerd mode adds ⟨Z⟩ / |r| labels and an amplitude panel.
- A PEEKed Qubble loses its blanket for the rest of the night (you looked at it), and woke Qubbles go grumpy.
- Lights Out levels (`lightsOut` / meta 'lights-out'): the scene stays ~black even in X-ray; only bot lights glow; the
  final syndrome chord plays at the end; winning floods the screen with colour.

### Playback model
`Playback.i` = number of trace steps applied. Each step animates for a duration (gate 0.65s, HIGHFIVE 1.15s, measure
0.85s, noise 1.7s; ×4 when fast). Bloch vectors blend smoothly for gates and snap instantly for measurements.
Step (→) runs up to and including the next real (non-`line`) event. Rewind (←, or hold ⏮) plays steps in reverse;
stepping back into a `measure` or `RESET` event plays `snap_measure` + shake and stops.
Audio: sfx at each event's impact, `botNote` on bot LISTEN, `setHarmony(snapshot.logicalFidelity ?? 1)` after every
step, `setTension` during night, `peek_collapse` + screen shake on `woke`.

### Run flow
"Run night" samples one night (random input from `level.inputs`, errors from `enumerateErrors` or `randomErrors`), runs
`quantum.runNight` and animates it. If it passes, the full `testLevel` suite runs automatically; if everything passes
→ win (stars: solved, lines ≤ par, avg steps ≤ par). "Test all" skips the animation. Clicking a night card replays
it in X-ray using its `seed`.

## How to add a screen
1. Create `src/ui/screens/foo.ts` exporting `fooScreen(root: HTMLElement, nav: Nav, arg?: unknown) => cleanup`.
2. Render into `root` (it already has the class `screen foo-screen`), subscribe to `onFrame` for animation, and return
   a cleanup that unsubscribes and removes window listeners.
3. Add `'foo'` to `ScreenName` in `src/ui/app.ts`, call `registerScreen('foo', fooScreen)` in `src/main.ts`, and add it
   to the `ok` list in `route()` if it should be deep-linkable.

## Known issues / TODO
- Part detection for `line` events in phases with fixed + player code is heuristic (see CONTRACT_REQUESTS).
- The 'map-flip' beat triggers once, after all chapter-1 levels are done (flags in the save).
- Night Shift Lab (`src/ui/nightLab.ts`): logical vs physical error rate across p, built from real nights (uses
  `quantum.logicalErrorCurve` if exported, otherwise `testLevel` on 2-5 with p swapped, 240 nights per point, computed
  progressively). Opened from the 2-5 win card (meta 'night-lab-unlock'), the map (after unlock), and Gremlin Lab.
- `line` events use `part` when the VM provides it (heuristic fallback otherwise); replays use `NightResult.seed`.
- QA hook: append `?qa` to the URL to expose `window.__np = { LEVELS, quantum }` for automated playthroughs.
- Sign text change in Ch4 ("…BUT SHARING IS CARING") is up to level data (signs are drawn from `level.signs`).
- Settings → "Unlock all levels" is a judge convenience.
