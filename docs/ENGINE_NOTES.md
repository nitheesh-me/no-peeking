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
  playback.ts          NightResult trace player: play/pause/step/fast×4/rewind/seek, audio cues, captions,
                       distance-based walk timing, one-way door for measurements (LISTEN/PEEK) and RESET
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
`Playback.i` = number of trace steps applied. Each step takes **walk time + action time** (see v0.3 below; ×4 when fast). Bloch vectors blend smoothly for gates and snap instantly for measurements.
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

## v0.2 additions
- **Caretaker** (`Scene.caretakerPose/jobFor`): the player avatar performs every card 7BH-style. It tiptoes to the
  target (p 0→0.3), then performs (contact at p≈0.5, where the snapshot blend, sfx and particles land):
  BOOP=boop, SHUSH=shush, SPIN=spin, PEEK=peek+flashlight, LISTEN=listen, RESET=press. For a HIGHFIVE with a bot,
  the bot rolls over and slaps on its own; for qubble→qubble the caretaker stands between them. Rewind snaps the
  caretaker to the target. It cheers on a win and facepalms on a fail (`scene.caretakerMood`).
  Uses `art.drawCaretaker` when present (fallback: a simple pyjama kid with an action glyph).
- **Room**: `art.drawRoom` when present → camera fills the play area, anchored to the bottom (`Scene.resize`).
  Otherwise the floating-island fit is used.
- **Dream map** (`screens/map.ts`): canvas night sky with parallax, islands along a winding trail, pulsing current
  node, a caretaker that tiptoes to newly unlocked nodes (`save.mapAt`), DOM chapter cards, and DOM buttons over the
  nodes for focus and screen readers. Uses `art.drawMapBackdrop/Island/Node/Path` with fallbacks for each.
- **Voice**: the dialogue calls `audio.voice(who, ch, i, line)` for every revealed character; Settings → Voices →
  `audio.setVoiceVolume`. In Lights Out, bot LISTENs play only `botNote` (no listen sfx) so the syndrome chord stays clean.

## v0.3 additions
- **Walking, not teleporting.** `Playback.planWalks()` pre-computes, for every step, who performs it (caretaker or
  Schrödi), where they walk from/to (`Scene.jobFor(ev).dest`) and the timing: `walkT[k] = distance / WALK_SPEED`
  (2.2 tiles/s, + 0.45 s hop-out for Schrödi) and `actT[k] = DUR(ev)·0.75` for actor jobs (`DUR` otherwise).
  `StepAnim.walk` (0..1) drives the walk; `StepAnim.p` is the ACTION progress only (contact ≈ 0.5, all blends/sfx/
  particles key off it), so nothing happens to a Qubble until the actor arrives. `T[]` = cumulative start times; the
  progress bar and timeline markers use real time (`Playback.time()/totalTime`). Fast ×4 scales everything; rewind and
  seek snap actors (`Scene.setActorRest(..., snap)`). Resting actors walk (time-based) back to their rest spot.
  **Facing** is computed every frame from the screen-space walk direction (`(gx−gy)` delta) while walking and toward
  the target creature while acting; idle keeps the last facing. Standing spots use `Scene.freeSpot()` so actors never
  stand on a bed/bot, and everything is clamped off the back walls (`clampPt`).
- **Schrödi's checklist.** Steps whose line ref is part `'fixed'` are performed by Schrödi when `art.drawSchrodiActor`
  exists: hop-out (the art draws the box and lands him 40·s to the right → `Scene.schExit()`), walk, perform
  (boop/shush/spin/point(PEEK)/listen/press), then walk back and hop-in once the next real event isn't his. While he's
  out, a plain empty box is drawn at home. Fallback (no actor art): the caretaker performs the fixed cards. The editor
  header reads "🐾 Schrödi's checklist".
- **Captions** (`Scene.say(text, at, kind)`): floating bubbles that stack and stay on screen. PEEK in safe levels
  (classical/allowPeekData) → "peeked: ☀/🌙" (green); in no-peek levels → "woke q2!" (red). LISTEN → BEEP!/quiet,
  RESET → "reset → quiet", IF/JUMP → a think bubble over the current actor ("yes! jump ↪" / "nope, next ↓") plus a
  pulse on the current card in the editor, END → "the end. zzz".
- **PEEK labels per level**: `EditorOpts.peekMode` = 'safe' | 'wakes'. Safe: normal card, tooltip "Peek: look at the
  bit-ball". Wakes: hazard tape, toolbox badge "wakes it!", tooltip "PEEK (wakes it!) …".
- **Canvas interactions** (`Scene.hitAny`): Qubble → 'mumble' roll-over + a sleepy line (never reveals the state;
  3 pokes in 6 s → Schrödi "No peeking!"), bot → 'wave' + `audio.botNote`, Schrödi → meow + deadpan quip, caretaker →
  yawn/cheer, gremlin (x-ray, during a noise step) → taunt pose + line, window/clock/door → small captions. Hover shows a
  pointer cursor and a DOM tooltip (`.scene-tip`). Pick-mode (editing an argument) still takes priority.
- **Timeline** (`.tl-row` above the controls): phase segments Bedtime/Night/Morning; markers coloured by event
  (gate colour per card, HIGHFIVE wider, LISTEN red BEEP / mint QUIET, PEEK pink or hazard if it woke, taken jumps,
  gremlins ONLY in x-ray). Hover → tooltip naming the event; click → `Playback.seek(k)`, which applies forward steps
  instantly and refuses to go back across a measurement/RESET (snap + toast, clamps to just after it).
- **Step mode** toggle: replaces ⏮/▶ with "◀ step" / "step ▶"; each press plays one real event with its full
  animation (walk included). Stepping back into a measurement shows the snap + toast. Space/→ step in step mode.
- **Program slots**: 3 slots (A/B/C) per editable phase (`SlotState`, saved in `save.slots[key]`; `save.programs[key]`
  still mirrors the active slots). Run/Test use the active slot; ⧉ copies a slot to another. Undo covers slots.
- **Snippets**: click a program card to select (shift-click range, ctrl/⌘ toggle) → "Save N cards as snippet". The
  📚 drawer lists snippets (localStorage `np.snippets`, try/catch); click inserts at the cursor (after the selection or
  at the end of the active column), drag inserts at the drop point; labels are renamed on insert to avoid clashes.
  Starter snippets from `src/quantum/reference.ts` unlock after their level: parity check (2-1), encode (2-2),
  bit-flip correct (2-3). Snippets that use missing cards/creatures are shown disabled with the reason.
- **Hints panel** (`.hints-panel`, non-blocking, ×-dismissible): Schrödi header, escalating "Nudge" cards (earlier ones
  stay visible; the next one sits behind "need another nudge?"), "👀 show me" highlights the creatures (`Scene.hintHL`)
  and card kinds (`Editor.flashOps`) a hint mentions. After 3 failed tests the Hints button pulses and the panel offers
  "Show solution" (two-click confirm).
- **Wall signs**: `level.signs` are mounted with `art.drawWallSign` at `wallSignSlots()` (from src/art, via
  `deps.artExtra`), right after `drawRoom`; a sign at x=0 prefers the left wall. No wall-sign art → no signs.
- **QA hooks** (`?qa`): `__np.scene`, `__np.pb()`, `__np.editor()`, `__np.screenPos(id)`, `__np.runNight(input,
  errors, paused)`, and `__np.freeze = true` pauses playback updates (for mid-action screenshots). Scripts in
  `.scratch/pw`: `actions.mjs` (every action/party + gremlins, frozen at contact), `ui.mjs` (pokes, hints, snippets,
  slots, step mode, timeline), `playthrough.mjs` (all 16 levels: load solution via Text → Test all → win card).

## v0.5: Codex
- **Screen** `codex` (`src/ui/screens/codex.ts`, styles in `src/styles/codex.css`, deep link `#codex`). Entry points: title
  menu "📖 Codex", the map topbar 📖, and Settings. Tabs per category with found/total counts; the grid uses the
  designer's `codexCardSVG` frames and `drawSilhouette` for locked "???" entries (each shows its "found by…" hint).
  Unlocked thumbnails animate at ~12 fps; element cards carry a `drawGlyph` badge.
- **Data** `src/ui/codexData.ts`: 33 entries (5 characters, 3 enemies, 5 elements, 8 objects, 12 cards from
  `CARD_GUIDE`). Each has a flavor line in the game voice, "In real life: …" (auto-linked through `learnLinks.linkify`),
  a hint, and what clicking its live view does.
- **Detail panel** (modal, Esc closes): a live art canvas; click / Enter / Space cycles poses, states and actions
  (caretaker and Schrödi actor actions, gremlin poses, bot actions plus a light button, qubble states plus a
  blanket/X-ray button and a draggable Bloch dial (φ dial with arrow keys plus a Sunny↔Moony θ slider), data box flip
  with tumble plus lid, a wall sign with your own text, props via `drawProp` with day/night). Characters speak a
  Qubblese line through `audio.voice`. Cards show the Card Guide demo canvas and tips.
- **Unlocks** (`src/ui/unlocks.ts`): `unlockCodex(id)` sets `save.flags['codex:'+id]` and shows a sparkly toast plus
  sfx. Hooks in level.ts: clicking a qubble (→ qubble, blanket if covered; in X-ray also sunny/moony/swirl and silk if
  a thread is attached), a data box (→ databox, sunny/moony), a bot (→ bot, lights if lit), Schrödi, the caretaker
  (grab), a gremlin in X-ray (→ its kind; 'both' gives Phasey too), window, clock, door, the new **sign** and **bed**
  hit kinds; moving Schrödi's box → box; LISTEN impact → lights; a PEEK impact → flashlight. Cards unlock the first
  time they appear in a placed program (editor onChange).
- **Unlock all content!** (Settings) toggles `save.flags.unlockAll`, read by every gate via `unlockAll()` /
  `levelDone(id)`: map levels, Codex entries, card-guide pro terms and starter snippets. Toast: "Everything unlocked
  (judge mode)".
- QA: `.scratch/pw/codex.mjs` (locked grid → click bot a in 2-3 → entry unlocked → detail interactive → unlock all).

## v0.6: 3D Bloch sphere (designer widget `src/ui/bloch3d.ts`, used, not edited)
- **Codex**: the Qubble entry shows the live Qubble beside an interactive sphere (`measure: true`, labels 'both'); its
  `onChange` writes `ViewState.bloch` so dragging the dot recolours the Qubble live, and the X-ray/blanket button stays.
  Sunny/Moony use draggable non-measure spheres, the Swirl's sphere is projected back onto the equator on every change,
  and the Silk thread shows a fixed r ≈ 0 sphere with the "entangled" caption. Spheres are destroyed when the panel
  closes (`wide` modal variant in codex.css).
- **Gameplay "Qubble inspector"** (level.ts `openInspector`): in X-ray only, and never on day-shift boxes, clicking a
  Qubble opens a small popover placed above or beside it, with a read-only, rotatable sphere showing the TRUE reduced
  Bloch vector from the current snapshot. It updates every frame as playback steps (mixed/entangled → short arrow plus
  the widget's caption); nerd mode adds ⟨X⟩ ⟨Y⟩ ⟨Z⟩ |r|. It replaces the poke/peek reaction for that click (Codex
  unlocks still fire: swirl/silk thread/…). Esc, clicking anywhere else or turning X-ray off closes it. It lives inside
  the scene area, so the editor and the playback controls stay usable. Gremlin clicks still win (they are hit-tested
  first). QA: `.scratch/pw/bloch.mjs`.
