# NO PEEKING! deterministic capture (Capture Engineer)

`tools/video/capture/` records the game frame by frame in **virtual time**: every frame is exactly 1/60 s of game time,
grabbed losslessly at 3840×2160, with a frame-exact log of every sound the game asked for and every on-screen box.
Read `docs/VIDEO_RESOURCES.md` first: every capture runs through `tools/video/safe-run.sh`.

## Quick start
```bash
# one shared dev server (the audio hook needs the dev server's unbundled /src/main.ts)
tools/video/safe-run.sh -- npx vite --port 4410 --strictPort --host 127.0.0.1 &

# 4K lossless capture, chunked: each ≤600-frame chunk is its own `safe-run.sh --heavy` job (one of the machine's
# 3 render slots); up to 3 shots in parallel (--jobs, max 3); finished shots are registered in
# tools/video/edl/shot_sources.json
node tools/video/capture/run.mjs tools/video/capture/shots/todo_trailer.mjs --only tr_proof

# quick look (1080p JPEG → H.264 mp4, one process; wrap it yourself)
tools/video/safe-run.sh --heavy --mem 6G -- node tools/video/capture/run.mjs tools/video/capture/shots/trailer.mjs --preview --out videos/capture/preview

# one framing still at DPR 1
tools/video/safe-run.sh --heavy --mem 4G -- node tools/video/capture/still.mjs /tmp/x.png '#level/2-3' 'cinema=1&camera=on:q2,2' 1.5

# contact sheet (5 frames per shot)
tools/video/safe-run.sh -- python3 tools/video/capture/contact_sheet.py sheet.png videos/capture/tr_*.mkv

# proof that the game is unchanged without ?cinema (pixel-compares stills of a HEAD build vs the working tree)
tools/video/safe-run.sh --heavy -- tools/video/capture/check_default_off.sh /some/work/dir

# verify: CFR 60, clock audit, duplicate/skip detection, determinism vs a second take, sharpness vs the old cut
tools/video/safe-run.sh --mem 3G -- python3 tools/video/capture/verify.py videos/capture/tr-proof-room.mkv [--twin other-take.mkv]
```
`run.mjs` options: `--only a,b` (exact names, else substring) · `--chunk N` (default 600; 0 = one in-process run) ·
`--preview` · `--out dir` · `--codec ffv1|x264rgb|preview` · `--format png|jpeg` · `--scale 1|2` · `--list`.

## How it works
1. **Time shim** (`shim.js`, `page.addInitScript`, runs before any game code): `performance.now`, `Date`/`Date.now`,
   `requestAnimationFrame`, `setTimeout`/`setInterval` (+ clear*) all run on a virtual clock that moves only when the
   recorder calls `__cap.step(1000/60)`. A step fires due timers in time order (each followed by a macrotask hop, so
   promise continuations run like in a real event loop; HTML nesting clamp prevents `setTimeout(0)` storms), then the
   rAF callbacks with the frame timestamp. `Math.random` is seeded per shot (mulberry32, seed = hash of the shot name),
   so every take is identical. **CSS animations and transitions** (toasts, dialogue pop-ins, card highlights, the
   notebook morph) are paused via the Web Animations API and seeked to virtual time every frame. Smooth
   `scrollIntoView`/`scrollTo` are re-implemented on the virtual clock. The native text caret (which blinks on a
   real-time clock) is hidden. WebAudio is disabled (`AudioContext = undefined`), so the audio engine is a silent
   no-op and never stalls anything.
2. **Input sync**: the recorder sends real CDP mouse/keyboard input, then waits until the page has *handled* it
   (pointer coordinates / down / up / key counters) before stepping, so input lands on an exact frame.
3. **Frame grab**: `Page.captureScreenshot` (PNG, `optimizeForSpeed`) at deviceScaleFactor 2 → 3840×2160, piped into
   ffmpeg (`image2pipe` → **FFV1 level 3, bgr0, intra-only, `-threads 6`**) in `.mkv`. Nothing touches /tmp.
   Note: Emulation overrides are per CDP session, so the recorder sets the device metrics on its own session, or the
   grabs come out at 1920×1080 (this bit the first samples; they were recaptured).
4. **Chunking**: a chunk job replays the shot from frame 0 in virtual time but only grabs frames `[a, b)`, then exits;
   parts are joined with `concat -c copy` (exact for intra-only FFV1). The last chunk writes the JSON sidecars.
   Every chunk checks a hash of the shot file, the capture code and `src/**`: if anything changed since the shot's
   first chunk (someone edited the game mid-shot), the orchestrator restarts that shot from chunk 0 instead of
   splicing two different choreographies. The Vite HMR socket is cut (`routeWebSocket`), so source edits never
   hot-reload a page mid-capture.
5. **Audio hook**: the recorder rewrites the dev server's `/src/main.ts` response to call
   `window.__capHook({ audio, art, quantum, LEVELS, nav })`; the shim wraps `audio.sfx`, `botNote`, `syndromeChord`,
   `voice`, `setScene`, `setTension`, `setHarmony` and logs each call before passing it on.

## The DSL (`lib.mjs`)
```js
import { shot } from '../lib.mjs';
shot('name', { save, cinema, cursor, hideDialogue, scale, layout, localStorage, css, seed }, async (s) => { … });
```
All durations are **virtual seconds**.

| Call | Does |
|---|---|
| `s.goto('#level/2-3', {settle})` | first call loads the page off camera until fonts and the game are ready; later calls change the hash on camera |
| `s.wait(sec)` / `s.hold(sec, label)` | advance time; `hold` is also logged as an intentional freeze (for the freeze-detect gate) |
| `s.waitFor(selector \| () => bool, {timeout, after})` | step until true (runs in the page) |
| `s.waitForEvent(e => …, {timeout, after})` | step until a logged event matches, e.g. `e.type==='sfx' && e.name==='boop'`; it matches the *next event after the previously matched one*, so an event fired during the click that caused it still counts |
| `s.cursorTo(sel \| {x,y} \| fn, {dur, ease, arc, dx, dy, ax, ay})` | glide the drawn cursor on a gentle arc; easings `linear in out inOut inOutSine outBack` |
| `s.click([target], {dur, hold, after})` | press (cursor squash + ripple) and release with real input |
| `s.tap(target, pageFn, opts)` | the same click *visually*, without input; then runs `pageFn` in the page (force an outcome behind a real-looking click) |
| `s.drag(a, b, {dur, pre, hold, ax, ay})`, `s.type(text, {cps})`, `s.key('Escape')`, `s.scrollWheel(dy)` | input (`ax/ay` = drop point inside `b`, 0..1) |
| `s.stroke([{x,y}…], {dur})`, `s.withKey('Shift', fn)` | draw a pen stroke (doodles); hold a modifier during clicks (shift-select) |
| `s.placeCursor(t)`, `s.showCursor(on)` | teleport / fade the cursor |
| `s.loadProgram({bedtime, morning}, {onCamera, typing})` | the Text modal flow (`Text` → fill → `Load`), visibly or not |
| `s.solution(id)` | the level's reference solution as text |
| `s.np((np, arg) => …, arg)` | run code against `window.__np` (`LEVELS, quantum, runNight(input, errors, paused), testAll, setXray, openInspector, closeInspector, replay, closeDialogue, report, screenPos(id), pb(), editor(), scene`) |
| `s.skipDialogue()`, `s.hideDialogue(on)`, `s.freeze(on)` | clean-state helpers (`freeze` pauses night playback; the scene keeps breathing) |
| `s.offCamera(async () => …)`, `s.rec(on)` | time runs, nothing is recorded |
| `s.mark(name, data)` | a named frame for the editor (meta.json `marks`) |
| `s.camera(rect \| selector \| 'full', {pad, ease, at})` | camera keyframe (16:9 crop in 1920×1080 CSS px) → `<shot>.camera.json` |

Shot options: `save: { unlockAll, progress: [ids] | {id: LevelProgress}, codex: [ids], flags, settings, programs, mapAt }`
(written to a fresh profile before load), `localStorage: {…}` (raw keys, e.g. the notebook's `np.nb.*`),
`cinema: true | { camera, hud, toasts, dialogue, nb, insert, part }`, `cursor: false`, `hideDialogue: true`, `scale: 1|2`.
Timing parameters come from `shots/params.mjs`: `P('shot.key', default)`, overridable from
`videos/music/cue_sheet.json` (`capture` object), `tools/video/capture/params.json` or `CAP_PARAMS`.

## Cinema layout (`?cinema=1`, in the game code, flag-gated)
`src/engine/cinema.ts` + `src/styles/cinema.css`; without the flag `cinema.on === false` and nothing changes.
- The stage canvas fills the 1920×1080 viewport (3840×2160 backing store at DPR 2); top bar, editor, controls,
  timeline, hints, HUD, dialogue, toasts, notebook, title menu, the credits roll/controls and the Codex "judge mode"
  badge are hidden. Game logic, playback and audio events run as normal.
- `&camera=` frames the room **in-engine** (vector art redrawn at the zoom, so always ≥1:1 pixels):
  `wide | room (1.2×) | tight (1.45×) | close (1.8×) | zoom:<z>[,fx,fy] | on:<creatureId>,<z>[,fx,fy]`.
- `&hud=1` keeps the phase pill / fidelity / Test strip, `&toasts=1`, `&dialogue=1`, `&nb=1` (the Lab Notebook,
  allowed to fill the width; its circuit SVG scales with it).
- Codex hero inserts: `#codex` + `&insert=<entryId>` shows that entry's live animation full-frame on paper;
  `&part=sphere` shows its 3D Bloch sphere instead.
- Credits: the stage alone, the room allowed to grow past its normal 150 px tile cap.

## Outputs (`videos/capture/<shot>.*`)
| File | Content |
|---|---|
| `.mkv` | FFV1 lossless, 3840×2160 (or 1920×1080 for `scale: 1` shots), 60 fps CFR |
| `.meta.json` | frames, duration, size, seed, URL, `marks` (named frames and holds), timing per frame, clock audit (`vtStep`), page errors |
| `.events.json` | `events[]`: every audio call (`sfx` + opts, `botNote`, `syndromeChord`, `voice` per character, `setScene/Tension/Harmony`), routes, dialogue (`dialogue_show/typed/hide`), toasts, modals, win card — each with `frame` (clip frame; `null` = off camera) and `vt`. Also `card_current` (a Bot Code card lighting up as it executes: op, line, phase, text). Plus summaries: `dialogue[]` (who, text, show/typed/hide frames), `toasts[]`, `voiceLines[]`, `cardHighlights[]` |
| `.layout.json` | run-length segments `{ sel, from, to, rects:[[x,y,w,h]…] }` for `.dialogue .editor .controls .toast .modal .win-card .popover .topbar .timeline .nb-drawer .inspector .cd-controls .title-menu`, CSS px in 1920×1080 (×2 for capture pixels); only visible boxes |
| `.camera.json` | camera keyframes, when the shot sets any |

## Shot lists
`shots/programming.mjs`: the REVISED 2 programming shots (`pg_*`, normal UI at 4K, card highlights logged).
The production lists follow `videos/final/work/shot_todo.json` (ids = the Editor's shot ids):
`shots/todo_trailer.mjs` (21 trailer shots + `tr_title_peek`, `mn_bloch`; cinema, 4K), `shots/todo_mechanic.mjs`
(`me_*` classic layout at 4K with Schrödi's dialogue as narration, plus `me_cold_blanket`, `sc_morning_still` in
cinema), `shots/todo_showcase.mjs` (`sc_*`, classic layout at DPR 1: every level via the Text modal + Test all,
meta beats, labs, Codex, notebook, QoL, save joke, credits; `sc_grid16` is tiled by the Editor from `sc_lv_*`).
Exploratory/alternate takes: `shots/samples.mjs` (self-test), `shots/trailer.mjs`, `shots/mechanic.mjs`,
`shots/showcase.mjs`. Helpers in `shots/common.mjs` (`prepLevel`, `runNight`, `waitSfx`, `waitDark`, …).

## Measured (this machine, software rendering as mandated)
- 4K: PNG grab 300–480 ms (SwiftShader), step 85–140 ms → **1.3–2.2 fps per job** when it has a slot; with 3 slots
  shared machine-wide, the trailer batch (24 shots, ~8,900 frames) took ~1 h wall. DPR 1 (1080p): ~7–9 fps per job.
- (For reference, before the resource rules: the iGPU did 4K at ~10 fps per job and 6 jobs ran at ~24 fps aggregate.
  That configuration contributed to the machine freezes and is now forbidden.)
- Determinism: same shot captured twice → frame-identical except sub-perceptual raster noise (≤ a dozen pixels in a
  handful of frames during drags); clock audit: every step exactly 1/60 s; no duplicate frames during motion.
- Sharpness (variance of the Laplacian at 1080p): the old cut (`videos/mechanic.mp4`, 30 fps screen recording) has a
  median of ~2500 over busy UI frames; see the verify report for the new samples (comparable content scores
  higher; the title screen is mostly soft sky, so its absolute value is lower and not comparable).

## `?cinema` off = no change (regression proof, 2026-10-04 21:48)
`tools/video/capture/cinema-off-check.sh` (run under `safe-run.sh --heavy`) builds the pre-cinema commit (a265667) and
the working tree, renders 10 deterministic scenes from each without the flag (title, map, 2-3 build, 2-3 mid-night with a
flip, 1-3, 4-2 Lights Out, Codex grid, Codex Qubble detail, credits at 12 s, 2-3 with nerd mode + Lab Notebook circuit)
and compares pixels: **all 10 identical**. `tsc --noEmit` clean; `vitest run`: 110 passed, 1 skipped.

## Known limits (things that resist determinism)
- **Hover transitions** while the cursor glides over DOM cards: Chrome updates `:hover` partly from real-time
  synthetic mouse moves, so a hover transition can start one frame apart between takes. Visible only as a 1-frame
  timing difference; avoid chunk seams inside such glides.
- **ResizeObserver / IntersectionObserver** callbacks are delivered on Chrome's real rendering cadence. They fire on
  layout changes (screen load, drawer open), not during normal playback.
- Image decodes (portrait data URLs) are awaited before each grab.
- Audio is not captured: the Sound Designer renders it from `events.json`. Two side effects of muting: `audio.voice`
  per-character calls are logged although nothing plays, and the music scheduler never runs.
- The audio hook needs the **dev server** (it rewrites `/src/main.ts`); against a production build the events log
  lacks audio calls (meta.json `audioHook: false`).
- PNG grabs at 4K are the bottleneck (~400 ms in SwiftShader). `--format jpeg --quality 95` halves it at a small
  fidelity cost; FFV1 remains lossless with respect to whatever was grabbed.
