# Video motion pieces (Motion Designer)

Everything in `tools/video/motion/`, outputs in `videos/motion/`. Every piece is a deterministic canvas animation:
`render(frame)` draws frame *f* from scratch as a pure function of *f* and its params (no clocks, no `Math.random`;
particles are closed-form, noise is seeded). The real game art is imported directly from `src/art` (drawQubble,
drawBot, drawGremlin, drawBackground's night sky with the sleeping moon, the logo SVG paths, the Quantum and
Quicksand fonts), so the motion pieces match the game pixel for pixel.

## Timing source
All defaults are keyed to `videos/music/cue_sheet.json` **v2** (60 fps, beat = 32 frames, bar = 96, 3/4, 70.72 s):

| Trailer frame | Event | Asset |
|---|---|---|
| f338 → f454 | peek: cursor drifts to the P, it collapses, **shatter on f434** | `title_peek` (place clip f0 at f338; clip f96 = f434) |
| f530 → f722 (optional) | title letters collapse on 8ths (16 f) | `title_sweep` |
| f1388 → f1586 | drop: glitch tear (clip f0–5) → **impact clip f6 = f1394** → wordmark settles | `logo_reveal` |
| f3410 → f3602 | "It's just a game…" over the closing music box | `card_justagame(_alpha)` |
| f3698 → f3986 | the snap: program cards → circuit, closing line | `circuit_morph` |
| f3986 → f4240 | end card | `end_card` |

Change any timing per render with `--p '{"frames":240,"impact":120}'` (params below), so a cue-sheet change never
needs a code edit. Clip-relative markers are written to `videos/motion/<name>.json` (`markers`), e.g. the logo's
`impact`, the syndrome's `beeps`/`quiets` frames for SFX sync, every text's `text_legible` frame (for the
reading-time QA gate, counted from full legibility).

## How to render
Follow `docs/VIDEO_RESOURCES.md`. Every render is a heavy job (one of the 3 machine-wide render slots; never run renders in parallel outside the wrapper):
```bash
tools/video/safe-run.sh --heavy -- node tools/video/motion/render.mjs logo_reveal          # 4K FFV1
tools/video/safe-run.sh --heavy -- node tools/video/motion/render.mjs syndrome --stills 100,300   # PNG stills (1080p)
node tools/video/motion/render.mjs --list                                                            # all jobs
```
- Jobs live in `tools/video/motion/jobs.mjs` (`{ scene, params, alpha?, note }`). `--p '{json}'` overrides params,
  `--name` changes the output name (e.g. a caption track), `--scale 1` renders 1080p for quick checks.
- Output: **3840×2160, 60 fps, FFV1 (level 3, intra-only), `bgr0`** — `<name>.mkv`. Alpha jobs write
  `<name>_fill.mkv` (straight, un-premultiplied RGB) + `<name>_matte.mkv` (8-bit gray luma matte), plus
  `<name>.json` (frames, markers, resolved params). Stills: `videos/motion/stills/<name>_fNNNN.png`.
- Resource rules baked into `render.mjs`: software GL only (`--disable-gpu --use-angle=swiftshader`), one browser
  per run, JS heap capped at 2 GB, a 1920×1080 viewport with the canvas backing store at scale 2 (= 4K; scale > 2
  is refused), ≤ 600 frames per job (refused otherwise), 2 pages in parallel, ffmpeg `-threads 2` per encoder
  (≤ 6 total). It reuses a dev server on `MOTION_BASE` (default `http://127.0.0.1:4410`) if one is up, else starts
  its own vite and stops it at the end. Frames go through `canvas.toBlob('image/png')` (lossless, ~8× faster than
  a 4K CDP screenshot) and are piped straight into ffmpeg (nothing held in RAM or /tmp).
- Why not `tools/video/capture`? That tool's job is virtual time for the live game (rAF/timers/CSS shimmed). These
  pages have no clock at all (frame-indexed pure functions), so they use the same encoder settings and the same
  determinism guarantee without the shim. The X-ray dissolve and the day→night relight are captured from the game
  by the Capture Engineer.

### Compositing recipes (ffmpeg)
```bash
# A/B transition with a matte (white = B): glitch tear (6 f) or blanket reveal (18 f)
ffmpeg -i A.mkv -i B.mkv -i videos/motion/glitch_tear_matte.mkv -filter_complex "[0][1][2]maskedmerge" out.mkv
# overlay a fill+matte clip (quilt, letters, shards, captions) on footage
ffmpeg -i bg.mkv -i X_fill.mkv -i X_matte.mkv -filter_complex "[0][1][2]maskedmerge" out.mkv
# blanket wipe = reveal matte between A and B, then the quilt on top
ffmpeg -i A.mkv -i B.mkv -i blanket_wipe_reveal.mkv -i blanket_wipe_fill.mkv -i blanket_wipe_matte.mkv \
  -filter_complex "[0][1][2]maskedmerge[ab];[ab][3][4]maskedmerge" out.mkv
```
(Inputs must share size/format: add `format=gbrp` / `scale` as needed; mattes are full-range gray.)

## Edit slots (videos/final/work/shot_todo.json, kind: motion)
Registered in `tools/video/edl/shot_sources.json`. Full-frame (no matte), 3840×2160 FFV1, 60 fps; the Editor trims.

| Shot id | Frames | File | Content / key frames |
|---|---|---|---|
| `mo_circuit_morph` | 660 | `videos/motion/mo_circuit_morph.mkv` | snap on f0 (trailer f3698), cards → gates f18–77, closing line from f96 (legible f126), hold. Trailer uses f0–287 (= `circuit_morph`). |
| `mo_end_card` | 360 | `videos/motion/mo_end_card.mkv` | identical to `end_card` for f0–253 (trailer f3986–4240), then holds; URL legible f134. |
| `mo_syndrome_table` | 960 | `videos/motion/mo_syndrome_table.mkv` | rows start f60/240/420/600 (180 f each); bot a lights at row+10, bot b at row+24 → beeps f250, f430, f454, f624; quiets f70, f84, f264, f610; all legible f668. |
| `mo_qiskit_stamp` | 300 | `videos/motion/mo_qiskit_stamp.mkv` | the finished circuit + closing line; "EXPORTS TO QISKIT" stamp slams on f40 (scale 1.8 → 1 over 8 f). |

Exact markers are in each `<id>.json`. Clips over 300 frames render as resumable ≤ 300-frame segments (a killed run
skips finished segments on re-run) and are concatenated losslessly.

## REVISED 2 additions (build overlays, the programming card, the proof split screen)
All alpha (`<name>_fill.mkv` + `<name>_matte.mkv`), registered in `tools/video/edl/shot_sources.json` as `mo_<name>`
(each entry gives fill, matte and meta paths). Reading time = 1.6 s + 40 ms per character, counted from full legibility.

| Asset | Frames | Placement / content | Legible → held |
|---|---|---|---|
| `card_gremlins_alpha` | 192 (2 bars) | lower-left: a small Sunny Qubble flips to Moony on f40 (red zap) + "Gremlins flip bits." (left-aligned from x 330, y ≈ 905). No gremlin sprite: the real gremlin is in the footage, and the upper/right ¾ of the frame stay clear. | f29 → 163 f held (needs 142) |
| `card_ghosts_alpha` | 192 | lower-left: the Qubble's swirl mirrors on f40 (phase flip, purple swirl) + "Ghosts flip phases." | f29 → 163 f (needs 142) |
| `card_wobbles_alpha` | 192 | lower-left: Wobbles' green jelly ripple on f40 jiggles a Sunny Qubble whose dream tilts only part of the way toward Moony (θ 0 → 70°, a coherent partial rotation; the colour mixes, it never fully flips) + "Wobbles flips… halfway." | f≈32 → 160 f (needs 151) |
| `card_program_alpha` | 144 (1.5 bars) | centred on a torn paper note: "You don't play it. / You program it." ("program" in red). Starts right after the logo impact. | f18 → 126 f (2.1 s). **Below the reading rule (needs 175 f)** |
| `card_program_alpha_long` | 192 (2 bars) | same; meets the rule | f18 → 174 f |
| `split_frame` | 576 (proof f1586–2162) | paper frame with two transparent windows: left (room) x 28, y 28, 1124×1024; right (Bot Code) x 1196, y 104, 696×948 (1080p units; ×2 at 4K). Soft inner shadows, ink outlines, a stitched edge, a thin ink divider, and a Sunny "your program" chip above the right window (pops in over f0–14). | — |

Split-screen recipe: scale/crop the capture's room into the left window and its editor column into the right
window on a canvas, then `maskedmerge` the `split_frame` fill+matte on top. The window rects are also in `split_frame.json`.

## Critic fix round (trailer song cut)
**Proof overlay — `proof_overlay` (576 f, alpha; place at f1586 above `split_frame`).** Driven by
`videos/capture/pg_split_23.events.json` + `.layout.json`: on each action frame the executing card (its logged
`.card.current` rect) pops (halo in the card colour 1.0 → 1.12 → 1.06, glow, white flash, ▶ marker, ~30 f) and on the
same frame a ring of that colour pulses on the actor (two pulses 7 f apart); the first two actions also get an
animated card→actor connector. IF lines are evaluated from the log (an IF is true when the next executed card is not the next line): the false IF (fix1, a BEEP and b QUIET) gets only a dim grey outline sweep (9 f) and a small ✗ at trailer f1937; the true IF (fix2, BEEP·BEEP) gets the full pop + a ✓ at f1960 and a jump arrow down the gutter; at the head of the next segment (f1970) an arrow lands on ⚑ fix2, which pops, before the BOOP pop at f2010. It assumes these EDL segments and crops:

| Trailer start | Dur | pg_split_23 in | What happens | Action (trailer f) |
|---|---|---|---|---|
| 1586 | 96 | 124 | cursor drags BOOP q2 into the program | — |
| 1682 | 96 | 980 | HIGHFIVE q1 → a (bot a + q1), connector #1 | 1715 |
| 1778 | 96 | 1300 | LISTEN a: bot a BEEP, connector #2 | 1826 |
| 1874 | 96 | 1420 | LISTEN b: bot b BEEP; IF lines light (1937, 1960) | 1913 |
| 1970 | 96 | 1600 | BOOP q2 (caretaker + q2 rings) | 2010 |
| 2066 | 96 | 1749 | X-ray: dreams intact | — |

Window crops (capture CSS px of the 1920×1080 capture frame; ×2 for the 4K source):
- room: src `[240, 124, 838, 763]` → dst `[28, 28, 1124, 1024]` (1.34×; this also crops out the toast at the top
  and Schrödi's dialogue box, which starts at y 887, so nothing needs masking).
- bot_code: src `[1570, codeY, 350, 476.7]` → dst `[1196, 104, 696, 948]` (1.99× CSS ≈ 1.6× the old crop; ~9
  lines visible), with codeY per segment = 565, 64, 160, 250, 565, 565 (the current line stays in view).
All of it is in `proof_overlay.json` (`segs_trailer`, `code_window_src_css_per_seg`, `room_window_src_css`,
`action_frames_trailer`). If the Editor changes the segments, re-render with `--p '{"segs":[…]}'`.

**Gremlin caption placement (re-review polish 4):** the three cards now sit on the empty top-left wall of the X-ray gremlin shots (`layout: 'topleft'`): sprite icon at x ≈ 104 (feet y 296), text left-aligned from x 206 in two lines at 92 px, block ≈ y 150–290, on a 74 % dark rounded plate (feathered edge) spanning the icon and both lines plus a margin (≈ x 26–(text end + 44), y 101–350), so the paper text holds ≥ 12.7:1 even over the light page outside the room in the wide tr_relight frames (measured 12.7–16.5:1 at f766, f790, f870, f942, f1020, f1137, f1220; still `videos/motion/stills/final/gremlin_cards_contrast_check.png`). Checked against tr_gremlin_flipper/phasey/wobbles at the EDL camera (z 1.0→1.08) at three frames each: clear of the rug, every sprite and label, and of the top-centre "X-ray · simulator view" tag (x 721–1199, y 41–91). Still: `videos/motion/stills/final/gremlin_cards_topleft_check.png`.

**Gremlin caption icons:** `card_gremlins/ghosts/wobbles_alpha` now use each gremlin's own game sprite
(`drawGremlin`: Flipper, Phasey, Wobbles) striking on clip f40 (with sparks in its colour; Wobbles jiggles), in place of the Qubble.

**Program card, two beats — `card_program_alpha_160` (160 f, alpha; place at f1426).** The note and "You don't play it." arrive at
clip f0 (legible **f10** = f1436; `text_legible` = 10) on a torn note in the lower third (y 790–920, under the settled wordmark);
"You **program** it." at clip f48 (legible f62 = f1488); letters exit f146–158; fully clear at clip f160 = **f1586**.
Line 1 holds 150 f from f10 to the exit at f160; line 2 holds 98 f (1.63 s) from legibility: it meets the Critic's rule (0.3 s/word + 0.4 = 1.3 s), not the bible's
1.6 s + 40 ms/char (2.2 s). That rule can't be met inside f1394–1586 without covering the logo impact.

**Circuit morph 32 frames earlier:** morphStart 18 → 6, stagger 3 → 2, line at clip f62 (was 96), legible clip
f92 = **trailer f3790**, holding 196 f (3.27 s) to f3986. Re-rendered: `circuit_morph`, `mo_circuit_morph` (660),
`circuit_morph_mech`. cap07's `legible_from` becomes 3790 (start 3760).

## Assets

### 1. Logo reveal — `logo_reveal` (198 f, 3.3 s) · **impact = clip f6 (trailer f1394)**
Glitch tear from black (clip f0–5, the clone-glitch look: stepped slices, hue-rotated multiply twin offset (14, −6),
Sunny/Moony fringes, Phasey/Sunny scan sparks) into the wound-up row of letter-Qubbles (real `drawQubble` on
beds with the Quantum letters on top, exactly the title look, trembling and squashed, swirls spinning faster).
**Impact (clip f6):** full-white flash (1.0, .75, .45, .25, .12, .05 over f6–11), camera kick (16 px shake,
22 f), every Qubble pops in the game's collapse burst, a white shockwave ellipse, a warm sunburst, confetti, and
the real wordmark letters (paths parsed from `public/art/logo.svg`) fly up from the small letters with
outBack + damped squash/stretch, popping centre-out (0–4 f stagger). Settles by ~f50 after impact, then bobs
gently with twinkles.
- Timeline (logo frames): letters fall (12 f, stretched) and land with squash/stretch + dust on 16ths (every 8 f)
  from f8 to f80, wind-up f82–96, impact f96. `logo_reveal` shows timeline f90–288 (`offset: 90`, `glitchAt: 90`).
- Variants: `logo_reveal_alpha` (same timing, no sky/glitch; letters, particles and the flash only, + matte),
  `logo_reveal_long` (192 f from the drop: glitch on f0, letters land visibly on 16ths, impact clip f96 = f1490,
  the strongest detected hit; use if the Director wants to see the letters land),
  `logo_reveal_preroll` (the 96 frames before the impact).
- Params: `frames, offset, bg (day|night|dusk|image|none), glitchIn, glitchAt, landStart, landEnd, lands[],
  fall, impact, anticip, width (1640), y (500), grain`.
- Markers: `impact`, `flash[]`, `glitch[]`, `lands[]` (each letter's landing frame → pitched SFX).

### 2. Title-letter collapse — `title_peek` (116 f) · **shatter = clip f96 (trailer f434)**
Bespoke (better than capturing the real title screen: no UI, frame-filling, controllable hit frames). The NO
PEEKING! letter-Qubbles dream on the title's day sky; the camera pushes in (1 → 1.9×) on the P while the cursor
drifts to it; on clip f96 the P collapses (awake-grumpy, Sunny/Moony recolour, collapse burst) and the frozen
frame shatters along log-spiral cuts (the swirl's own spiral) from the P: 2-frame flash (1.0, .55), shards rimmed
Sunny/Moony with an ink edge fly toward camera with 3-sample motion blur over 13 f, then black (7 f).
- `title_sweep` (192 f): all ten letters collapse on 8ths (16 f) with outcomes `0110100110` — markers `hits[]`
  for the pitched peek SFX ("the title plays the motif").
- Params: `frames, hits[10] (null = not peeked), outcomes, cursor, focus, focusZoom, shatterAt, shatterDur,
  shatterTail, zoom, bg, grain`.

### 3. Cards (in-world, letter-by-letter collapse type)
Each letter drops in as a tiny dreaming Qubble (Sunny/Moony swirl gumdrop, sleepy eyes), squashes and pops into
its Quantum glyph (outBack, white tint, sparks). The whole line is fully popped in ≤ 18–34 f (`reveal`, scales
with length). Night style: paper `#f2f0eb` text, ink outline, soft 20 px dark glow. Day style: ink text on a
torn paper note with tape. Subtle film grain (also dithers the night gradients for 8-bit delivery). Slow 5% push.

| Job | Frames | Background / prop | Text legible at |
|---|---|---|---|
| `card_dreams` | 288 | night sky + a swirling Qubble dreaming a sun and a moon (thought bubbles) | f8 + reveal (marker `text_legible`) |
| `card_dreams_alpha` | 288 | text only + matte (over the moonlit blanket footage) | 〃 |
| `card_gremlins` | 96 | Flipper sneaks in and zaps an exposed Sunny Qubble → Moony (a real bit flip) on clip f44 | f4 + reveal |
| `card_ghosts` | 96 | Phasey drifts by; a swirl Qubble's swirl mirrors (+ → −, a real phase flip) on clip f40 | 〃 |
| `card_cantlook` / `_alpha` | 96 | three tucked-in Qubbles in moonlight / text only + matte | 〃 |
| `card_justagame` / `_alpha` | 192 | morning sky + tucked-in Qubbles, ink on a torn note / note + text only + matte (over the cosy morning capture) | f10 + reveal |
| `card_learned` | 192 | notebook page (standalone; the trailer uses `circuit_morph`) | 〃 |
| `end_card` | 254 | night sky: the wordmark letters drift in *uncollapsed* (each filled with a turning Sunny/Moony swirl), land by f54, settle into the logo colours by f110 (staggered), then "quriosity 2026 · Option 06" (f84), "Play free in your browser" (f104), the URL on a red game button (f120, legible f134), and a tucked-in Qubble rises and snores | markers |

Card params: `text ('\n' = break), frames, bg, bgImage (blurred gameplay still), style, y, size (Quantum ≥ 104 →
cap height ≥ 7% of the frame; defaults 118–150), maxW, font, start, reveal, exitStart, exitDur, prop
(dream|flip|phase|blankets|morning|none), propHit, sub/subY/subSize/subStart (Quicksand line), plate, grain`.
Trailer cards default to a hard cut out (no exit); set `exitStart` for a letter exit.

### 4. Transitions (the approved ones only)
| Job | Frames | What | Use |
|---|---|---|---|
| `shatter` | 36 | a big swirling Qubble close-up snaps to Moony (f12–15), **shatter on f16** (flash f16–17), black f29–35 | standalone peek option |
| `shatter_alpha` | 36 | shards only, fill + matte | put the next thing behind |
| `glitch_tear_matte` | 6 | stepped bands, white = incoming shot | `maskedmerge` A/B at the drop (the logo reveal already contains it) |
| `glitch_tear_fx` | 6 | Sunny/Moony/Phasey scan sparks + band edges, fill + matte | overlay on the merged A/B |
| `glitch_tear_demo` | 6 | reference: day tearing into night | — |
| `blanket_wipe` | 18 | the game's quilt (pink/cream/teal patchwork, hearts, dots, stitching) sweeping left→right, curved leading edge, 12 px fold displacement, rolled hem, cast shadow, ink edges, in-out cubic — fill + matte | showcase chapter changes |
| `blanket_wipe_reveal` | 18 | white = incoming shot (left of the trailing edge) | under the quilt |
| `blanket_title` / `_reveal` | 72 | cover 18 / hold 36 with a sewn-on level-title patch ("2-3 · Who Got Flipped?") / uncover 18; B shows from f18 | showcase hero-level titles (`--p '{"title":"…","code":"3-1"}' --name blanket_title_31`) |

Shatter params: `src ('qubble' | absolute image path → shatter any frozen frame), pre, dur, tail, flash, cx, cy,
pole, seed`. Blanket params: `mode (pass|title), dur, hold, out (overlay|reveal|demo), title, code`.

### 5. Syndrome graphic — `syndrome` (486 f)
Notebook page, "Two bots. Four answers." Four rows, one bar (96 f) each from f30, all content above the caption
strip (y < 950): bot a (q1 = q2?) and bot b (q2 = q3?) built from `drawBot` (their own antenna light and
BEEP!/quiet word pop) + BEEP/QUIET chips, an arrow, three tucked-in Qubbles q1 q2 q3 (the culprit gets the game's
red dashed highlight, trembles, sparks and a red "!"; the quiet-quiet row gets a mint ✓), and the fix as a
card chip ("all good" / BOOP q1 / BOOP q2 / BOOP q3). Rows: QUIET-QUIET → nobody; BEEP-QUIET → q1; BEEP-BEEP → q2;
QUIET-BEEP → q3. Highlighter swipe on the active row.
- Markers (clip frames): row starts 30/126/222/318; bot a light +10, bot b light +24 → `beeps` [136, 232, 246, 342],
  `quiets` [40, 54, 150, 328]; culprit highlight +46; `all_legible` 386.
- Params: `bg, start, rowFrames, hold, title, grain`.

### 6. Program → circuit — `circuit_morph` (288 f, trailer f3698–3986) · **snap = clip f0**
Bespoke (chosen over capturing the Lab Notebook's own morph: that is a 360 px panel with a debug bar; this fills
the frame and is the same circuit). Clip f0 is the hard cut with a small slam settle: the real 2-3 program as
Bot Code cards in three columns (Schrödi's bedtime checklist HIGHFIVE q1→q2, q1→q3; the night's "Flipper flips
q2"; the morning decoder). From f18 each card (3 f stagger, 26 f each) flies in an arc to its gate and morphs into
it while the wires draw on: HIGHFIVE → CNOT, the gremlin → red dashed X error, LISTEN → measurement (ancilla
wires turn classical/double after it), IF … → BOOP qN → X with classical controls (filled = BEEP, open = QUIET on
a and b). Section labels BEDTIME·encode / NIGHT·error / MORNING·syndrome / FIX·correct; coloured halos remember
which card each gate was. The closing line "…where you accidentally learned quantum error correction." sets in
from f96 (legible f126).
- `circuit_morph_mech` (300 f): same + an "EXPORTS TO QISKIT" rubber stamp at f200 (mechanic video §2:08).
- Params: `frames, morphStart, stagger, morphDur, line, lineAt, lineReveal, stamp, bg, grain`.

### 7. Caption strip template — scene `caption` (`caption_strip_demo`, 360 f)
Mechanic/showcase layout: the game at 88% at the top (`GAME_RECT` = x 115.2, y 0, 1689.6 × 950.4 at 1080p), a
fixed paper strip in the bottom 12% (y 950–1080) plus side gutters, a stitched seam, an ink frame and soft shadow
around the game hole (transparent). Captions: Quicksand Bold 44 px ink, centred in the strip, with up to two
"= real term" gloss chips (Quantum on a Sunny pill, ink outline + drop shadow). In: text fades/slides up 10 f, chips
pop (outBack) at +6/+12 f; out: 8 f fade. Render a whole caption track as one alpha clip:
```bash
tools/video/safe-run.sh --heavy -- node tools/video/motion/render.mjs caption_strip_demo --name captions_mech \
  --p '{"frames":540,"items":[{"in":0,"out":200,"text":"Looking changes it.","gloss":"= measurement"},
        {"in":220,"out":520,"gloss":"= parity check","gloss2":"= syndrome"}]}'
```
then `maskedmerge` (or overlay) `captions_mech_fill/_matte` over the game scaled to 1689.6×950.4 at (115.2, 0)
(4K: 3379×1901 at (230, 0)). Clips longer than 600 frames: render in ≤ 600-frame pieces (shift `in`/`out`).
Live preview of any scene/template: `index.html?scene=caption&preview=1&scale=1&p={…}` on the dev server.
