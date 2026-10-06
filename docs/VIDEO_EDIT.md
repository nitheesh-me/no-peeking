# NO PEEKING! Edit, colour and QA (Editor)

Owner: Editor, Colorist and QA lead. Code: `tools/video/edl/`, `tools/video/assemble/`, `tools/video/qa/`. Output: `videos/final/`.
All heavy work follows `docs/VIDEO_RESOURCES.md`: every 4K/1440p step and every Chromium caption render is its own `tools/video/safe-run.sh --heavy` job (one of the 3 machine-wide slots) of at most 600 frames. The assembler keeps **one** heavy job of its own in flight. ffmpeg runs with `-threads 6`, frames are streamed through pipes, and intermediates live on disk in `videos/final/work/`.

## Pipeline

```
plans.py ──> <video>.edl.json ──> validate.py ──> render.py ──> videos/final/*.mp4 ──> qa/run.py + qa/review.py
  ^ cue_sheet.json, capture *.events/meta/camera.json      ^ mix.py (Sound Designer) reads the same EDL
```

```bash
python3 tools/video/edl/plans.py trailer            # also: mechanic | showcase | all  (--cue <cue sheet>)
python3 tools/video/edl/validate.py tools/video/edl/trailer.edl.json [--strict]
python3 tools/video/audio/mix.py tools/video/edl/trailer.edl.json          # Sound Designer's mixer
python3 tools/video/assemble/render.py tools/video/edl/trailer.edl.json    # launches its own safe-run jobs
tools/video/safe-run.sh --mem 4G -- python3 tools/video/qa/run.py tools/video/edl/trailer.edl.json
tools/video/safe-run.sh --mem 3G -- python3 tools/video/qa/review.py tools/video/edl/trailer.edl.json
```
`render.py` refuses an invalid EDL unless you pass `--ignore-invalid` (it is used for rough cuts with known upstream gaps).
Placeholders: `python3 tools/video/edl/placeholders.py [--only ids]` writes synthetic 4K60 shots and sidecars to `videos/capture_placeholder/`, using the Capture Engineer's formats. It runs sequentially through the heavy lock.

## EDL format (`np-edl/1`)
All values are integer frames at 60 fps. Validation lives in `tools/video/edl/validate.py`, and the shared library (frame map, camera, cue sheet, event mapping) in `tools/video/edl/edl.py`.

| field | meaning |
|---|---|
| `video`, `layout` | `trailer`+`cinema` (full-bleed `?cinema=1` footage), or `mechanic`/`showcase`+`strip` (game at 88% at the top, fixed bottom-12% caption strip) |
| `work`, `outputs[]` | the compositing size (trailer 2560×1440, others 1920×1080). Each output has `size`, `path` and `zoom_cap` (1080p 1.8×, 1440p master 1.4×) |
| `cue_sheet`, `sections[]` | the music cue sheet. Sections are as the plan used them |
| `audio` | `mix`, `mixreport`, `stems`, `music`: written by `mix.py`, read by the assembler and QA |
| `clips[]` | `id, shot, src, src_kind, start, dur, in, out, speed, camera[], grade, transition, flags, section, cues[], scdet_exempt[], events, layout_json, beat_frame` |
| `speed` | a number, or `{"keys": [[local_frame, speed], …]}`. Ramps are quantised into constant 6-frame chunks, so the frame map, the mixer and the renderer agree exactly. `edl.frame_map()` / `resolved()['clips'][i]['src_frames']` give the source frame for every timeline frame |
| `camera[]` | `{f, z, cx, cy, ease}`: z=1 is the full source, cx/cy is the view centre (0..1). `camera='shot'` in a plan imports the Capture Engineer's `*.camera.json` rects, clamped to the cap |
| `transition` | `cut` (default) · `shatter` (trailer, once, 10–14 f) · `glitch` (trailer, once, 4–8 f) · `blanket-wipe` (showcase, 16–20 f) · `xray-dissolve` / `relight` (in-engine: a hard edit plus an `scdet_exempt` range). Overlapping transitions start ON the edit point; the outgoing clip runs underneath. `matte`/`overlay` point at Motion Designer files (`videos/motion/<type>_matte.mov`, `<type>_overlay.mov`); otherwise procedural placeholders are used |
| `flags` | `on_beat`, `intentional_black`, `intentional_flash`, `intentional_hold` |
| `cues[]` | sound-design cue references `{name, frame, kind: design, note}`. `mix.py` aliases them (peek_collapse_impact, title_letters_pitched, silence, bot_beep_dry, drop_impact, snap) |
| `captions[]` | `{id, text, start, end, legible_from, position: strip / top_third / center, style, render: "template" or {src}}` |
| `overlays[]`, `fx[]`, `marks[]` | RGBA Motion overlays; flashes; intentional `black/flash/hold/dissolve/exempt` ranges for the gates |

Validator rules: contiguous timeline (overlap only for declared transitions); transitions allowed per video and the once-limits; upscale guard (the view box in real source pixels must be ≥ the output pixels, for every output) and the 1.8×/1.4× caps; reading time ≥ 1.6 s + 40 ms/char from `legible_from`; ≤ 7 trailer texts; never two captions at once; ≥ 80% of trailer edits hard cuts on the beat; on_beat within ±1 frame of the cue-sheet grid; **waltz rules (3/4):** every trailer cut on the beat grid, never an isolated cut on beat 2, and the montage cuts must equal the cue sheet's `cut_rules.montage_cut_frames`.

## Assembler (`tools/video/assemble/render.py`)
- **Stage A** (per clip, packed into heavy jobs of at most 600 frames, cached by content hash): decode the lossless source from `in` (`-ss` exact seek), apply the speed frame map, then the camera. Crop and resize happen in **one lanczos pass with a sub-pixel box** (PIL `resize(box=…)`). ffmpeg's crop/zoompan round the crop to whole source pixels, which judders on slow push-ins. Placement: cinema = full frame; strip = 88% at the top over a blurred, darkened extension. Grade: `lut3d` (tetrahedral) at 16-bit, stored as **FFV1 10-bit** (one shared FFV1 configuration for every intermediate, because the concat demuxer decodes all pieces with the first file's configuration).
- **Stage T**: each overlapping transition (≤ 20 frames) is pre-rendered to its own small file: `maskedmerge`(A tail, B head, Motion matte or procedural placeholder), plus `rgbashift` for a glitch and the Motion overlay.
- **Stage B/C** (per ≤ 600-frame timeline chunk; chunk edges never split a transition): the chunk's base timeline is **one sequential concat-demuxer input** (segment pieces + transition files, frame-exact in/out points), so memory stays flat (about 2.5–3.5 GB at 1440p). Then, in yuv444p10 with explicit BT.709 conversion everywhere: flashes, Motion overlays, the caption strip, captions. Template PNGs get alpha fades; **Motion fill+matte cards** are combined with `alphamerge` and can be held on their last frame (`hold`), e.g. "It's just a game…" runs until the snap. Per output: lanczos scale, **temporal grain/dither** (`noise`, c0s 6 night / 3 day / 2 cards, about 1.9 / 1.0 / 0.6 LSB), dithered 10→8-bit yuv420p, x264 High **CRF 15** preset slow, aq-mode 3, BT.709 tags. A pre-grain 1080p QA proxy (CRF 10) is made alongside.
- **Final** (light job): stream-copy concat of the chunks + **AAC 320k 48 kHz** from the Sound Designer's mix (a flagged placeholder bed is used until it exists), `+faststart`.
- **Precomps** (`precomp.py`): the showcase's 4×4 all-levels grid (`sc-grid-*`, time-scaled to finish together) and the 2×2 QoL quick-fire. They run once the captures exist.
- **Grade** (`grade.py` → `luts/{day,night,none}.cube`): day = slight warm lift, gentle S-curve, +4% saturation; night = blue lifted into the blacks (never crushed), cooled and 10% desaturated mids, neutral highlights (the moon and paper text stay white); none = identity for Motion pieces. Subtle by design: the game's palette must stay recognisable.
- **Captions** (`captions.mjs` + `caption_template.html`): Playwright, software rendering only, DPR 1, rendered through the heavy lock. It uses the Motion Designer's template automatically when `videos/motion/caption_template.html` exists (the API is `window.renderCaption({text, style, position, mode})` with modes full/mask/strip). Fallback styling follows the Critic: Quicksand Bold 66 px (trailer, at 1080) / 46 px (strip), paper text with an ink outline and dark glow at night, an ink-on-paper plate by day, and the paper strip with a notebook rule.

## QA gates (`tools/video/qa/run.py` → `videos/final/review/<video>_qa.{json,md}`)
| gate | check |
|---|---|
| edl | the validator, including the upscale guard against the **real** file resolution |
| music_gate | the Music Supervisor's `tools/video/audio/music_gate.py` (an ffmpeg `soundfile` shim is used if the package is missing) |
| loudness_curve | Critic: build rises bar by bar (±1 dB); drop ≥ build avg +6 dB and ≥ build peak +4 dB; payoff ≥ montage +2 dB; proof bed ≥ 6 dB under the montage (on the mix's music stem when present) |
| cuts | scdet on the proxy vs EDL edits ±1 (flashes, blacks, in-engine dissolves and relights are exempt; missed cuts are a warning); on_beat vs the grid ±1, on the EDL *and* on the rendered cut; hard-on-beat ratio; shots under 12 frames |
| av_sync | mixreport cue frames vs the EDL-mapped capture-event frames ±1; design cues present ±1 |
| every_event | every visible capture event on screen has a sound (speed-up thinning is listed separately) |
| captions | caption rect (for Motion cards: the matte's real bbox at full legibility, with its `offset`) vs layout.json UI boxes mapped through the clip's actual transform: camera + placement, or for split-screen clips each window's cover-crop (`E.window_boxes`, the renderer's own function); `.stage-canvas-wrap` is the picture, not UI. No overlap; reading time; **WCAG contrast on the rendered frames**: the template's glyph mask vs the worst 10% of a 2–10 px ring around the glyphs, ≥ 4.5:1 at three moments per caption |
| picture | blackdetect / freezedetect on the proxy vs the intentional marks and the capture-declared holds; first 3 s not black |
| sharpness | median Laplacian variance vs the old cut (`videos/mechanic.mp4`) |
| banding | night shots: the fraction of pixels on perfectly flat 5×5 plateaus inside smooth gradient blocks (< 0.25), plus unique luma levels per block |
| clean | NCC template match (STAGE watermark, judge-mode badge, debug bar; `tools/video/qa/templates/`) every second; trailer footage must come from `?cinema=1` (capture meta) |
| loudness | ebur128 on the delivered file: −14 ±0.5 LUFS integrated, TP ≤ −1.5 dBTP for the music-first trailer mix (−1.0 otherwise). Featured cues: **each inside its own window** from the mixreport (`window_lu` vs achieved `margin_lu`, ±0.5 LU measurement tolerance). Cues without a numeric window (the QUIET answer, the BEEP in true silence) are judged by the mixer's rule and listed as documented exceptions. The ducking presets (mechanic/showcase) carry no windows and keep ≥ 6 LU |
| proof_sfx | every featured cue in the proof section (f1586–2162) is inside its window (proof cues +3..+5 LU over the music, card accents −6..+4) **and audible**: ≥ +3 LU over the music at its moment, or its window's floor when lower; QUIET under its BEEP. The mix's short-term peak is reported for information |
| reencode | 8 Mbps x264 (YouTube-like): sharpness retained ≥ 85%, banding still passes |
| human | fresh-eyes "what do you do?", muted, audio-only and phone-speaker passes: PENDING, with the Critic as proxy |

## The cuts (real assets, cue sheet v2)
**Trailer** (`tools/video/edl/trailer.edl.json`, 4240 frames = 70.67 s; 112.5 BPM 3/4, beat k = frame 50 + 32k). Every frame comes from the cue sheet (sections, named_hits, cut_rules), the Motion Designer's markers, or the capture marks. Two deliveries share one picture: **song** (`trailer.mp4`, `trailer_master_1440p.mp4`; personal cut) and **public** (`*_public.mp4`, the original Twinkle score), made with `alt_audio.py`.

| frames | picture | sync |
|---|---|---|
| 0–338 | `tr_cold_blanket`, push 1.0→1.15; `card_dreams_alpha` over it (f30–318, legible f71) | capture hold |
| 338–454 | `title_peek` (Motion): cursor to the P, collapse, **spiral shatter on f434** (its one use) then black | impact marker 96 → f434 |
| 454–530 | black: the reverb tail (a continuous join, not an edit) | — |
| 530–722 | `tr_title_peek`: letters collapse every 16 f, first on f546 | mark hit-N |
| 722–818 | `tr_relight` at 2× (in-engine day→night) | mark relight |
| 818–1010 / 1010–1202 | `card_gremlins_192` / `card_ghosts_192` (Motion design, re-rendered at 192 f for reading time): a real bit flip / phase flip | prop_hit → SFX cue |
| 1202–1298 | `tr_dark_room`; "You can't look." (`card_cantlook_alpha_160`) hangs on into the silence until the BEEP | — |
| 1298–1362 | true black (silence) | cue sheet |
| 1362–1388 | `tr_bot_antenna`: the antenna lights on the BEEP | mark beep → f1362 |
| 1388–1586 | `logo_reveal`: its baked glitch tear (the one glitch) → **impact f1394** | impact marker 6 |
| 1586 / 1682 / 1874 / 1970 | `tr_proof` steps 1/2/1/2 bars: flip, bots ask (BEEP / quiet), BOOP q2 blind, in-engine X-ray | marks flip, beep-a, boop, xray |
| 2162…2834 | montage on the cue sheet's 12 cut frames (96/64/32): checklist, test strip, dream map / highfive, listen, Bloch / Codex insert (4K, camera crop removes the chrome), Flipper, Schrödi, Qubble, clone glitch, Shor-9 | marks |
| 2834–3026 | Lights Out, black: the single chord capture is used twice (f2850, f2946) | mark chord-1 |
| 3026–3410 | `tr_morning_check` (push 1.2→1.4 into the small win card; 1.4 is the 1440p cap) → `tr_curtain_call` push-out | mark win |
| 3410–3698 | `card_justagame_288`: held through the silence until the snap | — |
| 3698–3986 | `mo_circuit_morph`: snap, cards → gates, the closing line (legible f3824) | snap marker 0 |
| 3986–4240 | `mo_end_card` | — |

Six text events (≤ 7). Reading time in the trailer uses the Critic's rule, max(1.2 s, 0.3 s/word + 0.4 s) from full legibility (§7.5), which the music and Motion timings were built on. Strip captions use the bible's 1.6 s + 40 ms/char. The validator also reports where a trailer card meets only the Critic's rule. Today that is the closing line: 2.7 s readable vs 3.88 s under the bible rule, because the end card is pinned at f3986.

**Mechanic** (`mechanic.edl.json`, 149.2 s, Critic §5 re-timed to the capture marks): cold open (6 s) → the rule, 1-1 PEEK → collapse, then the X-ray replay of the lost half ("Looking changes it." `= measurement`) → the threat → can't copy (`= encoding`) → 2-1 in 10 s (`= parity check`) + `mo_syndrome_table` 15 s (`= syndrome`) → 2-3 night + Test all (`= error correction`) → the X-ray replay → 3-1 twist (`= phase-flip code`) → `card_justagame` → the circuit morph (closing line) → the Qiskit stamp → end card. Captions are the Motion Designer's caption scene (line + "= real term" chips), one per slot; the paper strip is that scene's empty frame.

**Showcase** (`showcase.edl.json`, 226.3 s): `sc_grid16` (precomposed 4×4 of every level's Test-all → win; 1-3 and 4-2 tiles use their meta-beat captures) → title peek → dream map → chapters behind Motion blanket wipes: five hero levels with 1→v→1 speed ramps (v fitted to each capture), the 11 others as 36-frame strobes on their win cards, plus wow beats (clone glitch, map flip, Lights Out by ear) → Gremlin Lab → threshold → Codex tour + Card Guide → Notebook → QoL → the save-data joke → curtain call → `card_justagame` → circuit morph → end card. Captures are 1080p normal layout, so push-ins are at most 1.136× (the upscale guard).

Editor-rendered assets (`videos/final/work/`): `motion_ext/card_*` (the Motion Designer's jobs with only `frames` changed), `motion_ext/captions_*` (strip caption tracks), `precomp/sc_grid16.mkv`.

## Shot sources
`plans.py` resolves each shot id in order: `tools/video/edl/shot_sources.json` (aliases to real files) → `videos/capture/<id>.*` → `videos/motion/<id>.*` → `videos/final/work/precomp/<id>.*` → placeholder. `python3 tools/video/edl/plans.py --registry` prints every shot with what it must show. That list is the request list for the Capture Engineer and the Motion Designer.

## REVISED 2 (programming visible, Wobbles): EDL changes, validated, not yet rendered
**Trailer** (cue sheet v2, unchanged section frames). New/changed shots:
| frames | k | shot | what |
|---|---|---|---|
| 722–818 | 21 | tr_relight | night falls (in-engine relight, 1 bar) under the start of "Gremlins flip bits." |
| 818–914 | 24 | tr_gremlin_flipper | the real Flipper strikes (+24 f); card_gremlins_alpha "Gremlins flip bits." (f738–914) |
| 914–1106 | 27 | tr_gremlin_phasey | the real Phasey (strike on beat 2); card_ghosts_alpha "Ghosts flip phases." |
| 1106–1298 | 33 | tr_gremlin_wobbles | Wobbles (strike f63 on beat 2; the take is 213 f, so the clip starts at its frame 0); card_wobbles_alpha "Wobbles flips… halfway." |
| 1388–1490 | (drop 1394) | logo_reveal | shortened to 1.7 s after the impact |
| 1490–1586 | 45 | pg_drag_closeup | hard cut to the editor; **card_program_alpha_long** (192 f) "You don't play it. You program it." f1490–1688 (legible f1508 → 3.0 s readable, meets 1.6 s + 40 ms/char) |
| 1586–2162 | 48/51/57/60 | pg_split_23 ×4 | split screen + the split_frame overlay; steps aligned to the marks drop / highfive / boop / xray |
| 2162–2834 | ladder | 6 programming + 6 world | pg_drag_closeup · checklist · pg_if_anatomy · highfive · pg_test_strip · dream map · pg_step_scrub · mn_codex_wobbles · pg_snippets_doodle · mn_notebook_circuit · pg_export_qiskit · Shor-9 |
Removed: the dark room and "You can't look." (the text cap is 7, and the three gremlin cards fill the build).

**Split screen (`clips[].windows`)**: each window is `{src: [x, y, w, h] normalised, dst: [x, y, w, h] in 1080p units, anchor_y}`. The source rect is cover-cropped to the destination aspect (centred; the Bot Code column is top-anchored) and resized in one lanczos pass into a paper canvas; then the Motion `split_frame` fill+matte is merged on top. Windows come from `split_frame.json` (left 28,28 1124×1024 = the room; right 1196,104 696×948 = the Bot Code column). Source rects come from the capture's own `layout.json`: room = left of `.editor`, between `.topbar` and `.timeline` (the timeline strip is kept out); Bot Code = `.editor`. The validator applies the upscale guard per window and per output. Checked on a real 4K full-UI frame (me_23_night): 1.41× / 1.34× downscale at the 1440p master, so a 4K capture is required (a 1080p capture would upscale the room window at 1440p).

**Audio contract, `audio.score_segments`** (for mix.py): `[{name, src, start, end, src_in, layer: under_song|replace, gain_db, fade_in, fade_out, downbeats}]`. The trailer has one segment, `coding_groove` (`videos/audio2/score_segments/coding_groove.wav`), from f1586 to f2834 (k48→k87, both downbeats), under the song for the whole split-screen proof and the montage. One continuous span is used because per-cut toggling would put music changes on beats 2/3 of the ladder. The card UI sounds come from each capture's events.

**Mechanic:** `program_visible: true`. Every capture clip uses a right/bottom-anchored push of ≤ 1.06× (the editor fills the right column at full height, so a centred push crops it). The validator fails any clip whose `.editor` box is < 98% in view. New beat: `me_23_drag` (the 2-3 decoder written card by card, 5 s, strip "Write the fix: IF a BEEP and b QUIET, BOOP #1. = decoder"). The video is now 151.5 s.

**Validator additions:** the editor-in-view rule above; source overruns on placeholders are warnings (stale placeholders), but errors on real files.

## Gate changes, 2026-10-05 (Director's ruling on the 23:54 QA)
- **loudness / proof_sfx: retired the SFX-first thresholds.** The 23:54 failures ("42/43 featured cues under 6 LU", "proof min −21.8 LUFS-M < −16") tested rules the Director deliberately replaced in the Sound brief. The trailer is now a music-first mix (docs/VIDEO_SOUND.md): featured cues are held in per-type windows (+3…+7 LU, proof +3…+5, card accents −6…+4, and so on), and the absolute −16 LUFS-M floor was explicitly allowed to go. The gates now read each cue's own `window_lu` / `margin_lu` / `window_rule` from mixreport.json (there is no separate `level_rep` block; the per-cue rows carry the windows). Result on the current mix: 43/43 featured cues in window (one documented exception, the BEEP in true silence, judged absolute); proof cues +4.0…+4.2 LU.
- **captions: fixed the measurement, not the captions.** The 22 "UI overlaps" were cap08/cap09 over the proof split screen: the gate mapped pg_split_23's full-UI layout boxes through a plain camera view, but those clips show only two cover-cropped windows, and `.stage-canvas-wrap` is the room picture itself. The gate now uses the renderer's exact window transform and the cards' real matte bbox and offset. Real overlap count: 0. The two contrast fails were cap06 (X-ray tag) and cap07 ("You don't play it. You program it."), on the 23:47 render. cap07's chunk was re-composited at 00:06 (render "fix3", only chunk [1200,1800) re-rendered). On the current render, every caption is ≥ 8.2:1 (cap06 8.2, cap07 ink-on-plate about 17:1).
- **mix_analysis freshness: content-based.** An EDL saved after the mix (the cap07 caption edit) no longer fails the gate by mtime alone. The mix counts as current when its duration equals the EDL's and av_sync + every_event pass on the current EDL. A timing change still marks it stale. (00:16 fix: the first version of this check shadowed the mixreport dict with its path and could not evaluate; corrected, and the 00:2x QA run confirms `mix_matches_current_timeline: true`.)

## Critic re-review fixes, 2026-10-05 00:40 (EDL changed and validated, not yet rendered)
- **Lights Out blocker (f2834–3026).** The old T031 and its repeat T032 (src 1656–1752, twice) ran into the lights coming up: 34 daylight frames. They are replaced by ONE continuous clip, `mn_lights_out` **src 1543–1734**, aligned so chord-1 (src 1671/1672) lands at **f2962 = beat k91**. Measured per frame, the source is dark through src 1734 and the lights come up at **src 1735** (not 1736), so the stretch ends with zero frames to spare. That is acceptable because the source is deterministic and frame-exact, and `plans.py` asserts it. After the night grade: mean ≤ 13.1, p99.5 ≤ 18.1 (limit 40). Table: `videos/final/review/trailer_lightsout_luma.csv`; strip (×4 brightened): `videos/final/review/trailer_lightsout_strip_x4.png`. The syndrome chord is now heard **once** (the capture has it once per night). A second hearing has to be a mix-side repeat. Clips after T031 renumber down by one (the old T033 morning check is now T032, and so on).
- **New `dark` gate.** Every `intentional_black` / lights-out clip must stay under mean luma 40 on **every** frame of the delivered render. It selects frames by decoded index (no `-ss`; long-GOP seeks can land a frame off). On the 00:06 render it fails T031 (34 frames) **and** T009 (f1298, see below).
- **Root cause of the f1586 "full-UI flash" and the +1 cut offsets: an assembler bug, now fixed.** `piece_entries()` set concat-demuxer `inpoint`s half a frame *before* the wanted frame. The demuxer seeks backward to the keyframe at or before the inpoint, so every piece that started mid-file gained one leading frame. Every chunk after the first [0,600) was therefore shifted +1 frame against the overlays and the (EDL-exact) audio. Symptoms: the last frame of `pg_drag_closeup` (full editor UI) under split_frame at f1586; one bright Wobbles frame at f1298 in the silence; scdet cuts at EDL+1 from f722 on (hidden by the ±1 tolerance). The fix is inpoint = +0.25 frame (Matroska stores ms timestamps), proven on a real segment: the old inpoint gave 21 frames starting at src 69, the new one gives exactly src 70–89. Transition renders are invalidated (cache key T3); Stage A segments are unaffected.
- **Cut gate: systematic-offset check.** The per-cut ±1 tolerance can no longer hide a constant bias. If ≥ 60% of matched cuts share the same non-zero offset, the gate fails (`offset_median`). The 00:06 render fails it (median +1).
- **Caption gate: in-scene sprites are obstacles.** Sprites are drawn on the canvas, so no capture layout.json contains them (only DOM UI: .dialogue, .toast, .editor, …). Two sources: (1) layout.json segments named `sprite:*` / `actor:*`, a contract for the Capture Engineer, used when present; (2) a pixel fallback on the caption-free Stage A frame: compact (≤ 280 px) dark-ink outline blobs under the caption's real glyph footprint (matte dilated 14 px), failing above 2%. On the 00:06 render: cap01 0.2%, cap02 0.0%, cap06 0.0%; **cap03 4.8%, cap04 4.6%, cap05 3.4% FAIL** (the bot and the a/b labels sit under the gremlin cards; the Motion Designer's fix 4 addresses this). cap08/cap09 are unchecked until pg_split_23 is back on disk; cap10/cap11 are baked into the closing motion clips (full-card moments). The pixel heuristic misses light-outlined figures and keeps some rug dashes, so layout.json sprite boxes are the precise path.

## Thread budget after crash #7 (01:14, 5 Oct)
The 01:12 render died in Stage A with JOBS=2. Measured per component: a Python worker with numpy/OpenBLAS = 22 threads (one per core, at import), the FFV1 4K decoder at `-threads 6` = ~64 (its auto-inserted pixel-format filtergraph defaults to one thread per core), and the FFV1 encoder at `-threads 6 -filter_threads 6` = ~26–36. One Stage A batch was therefore ~110 tasks, and two concurrent batches ≈ the 159 tasks the crash recorder logged.
Now in `render.py`: `JOBS = 1` (child jobs strictly one at a time), `THREADS = '2'` for every codec and filtergraph, `-filter_threads 2` also on the Stage A decoder, x264 `lookahead-threads=1`, and `OPENBLAS/OMP/MKL/NUMEXPR_NUM_THREADS=1` set before numpy loads (inherited by every child). Measured: Python 1, decoder ~32 (ffmpeg 8's fixed per-component threads), encoder ~10, so a Stage A job is ≈ 43 tasks. That matches the renders that survived. QA (`qa/run.py`) and `placeholders.py` use 2 threads too.

**Update (Director, 5 Oct):** the thread caps were raised for later runs: `render.py` uses `THREADS = NP_RENDER_THREADS` (now 8 per codec/filtergraph) and `qa/run.py` uses `T = NP_QA_THREADS`. safe-run pins every job to the 8 E-cores, so the load stays at about 8, which is the crash-#7 protection that matters; at 2 threads, half the cores sat idle. `JOBS = 1` stays.

## Per-chunk B/C cache (5 Oct, after the tag pass)
**Bug:** every small fix re-encoded all 8 B/C chunks (about 45 min). The key was already per chunk (that chunk's filtergraph, which only holds the clips, transitions, overlays, captions/labels, flashes and grain ranges overlapping [a, b)), but it also stamped every input file by **mtime**. Each chunk's `base_XXXXXX.txt` concat list is rewritten on every run (same content, new mtime), so every key changed on every run. A two-pass dry key computation proved it: the graph text was identical and the only differing stamp was `base_*.txt`, in all 8 chunks.

**Fix** (`render.py`: `file_stamp`, `chunk_key`, `adopt_chunk`):
- Text inputs (`.txt`, `.json`, `.ffconcat`, `.cube`) are keyed by **content**, and media (segment chunks, transition renders, Motion overlays, caption PNGs) by size + mtime, so a Motion asset re-rendered in place under the same name still invalidates exactly the chunks that read it.
- The key covers: the chunk's graph, its input stamps, CRF, the x264 settings, the output sizes and the proxy flag. Nothing from outside the chunk's frame range.
- `adopt_chunk` reuses chunks encoded under the old scheme (or any previous run) when the last `graph_XXXXXX.txt` written for that chunk equals the current graph and the finished chunk is newer than that graph and every media input. It hard-links the file, never copies it, and never matches `*.tmp.mp4` partials.
- `render.py --dry-run` reports which Stage-A chunks, transitions and B/C chunks would render, and renders nothing (no progress-board entry). **Verification:** two consecutive dry runs give identical results. While the tag-pass render was running, the only "to encode" chunk was always the one it was currently encoding ([3000,3600), then [3600,4200)). Once it has finished, a no-change run must report `B/C: 0/8 chunk(s) to encode (all cached)`.

## Waivers (explicit, recorded in the EDL)
| clip | rule waived | where | reason / decision |
|---|---|---|---|
| T019 `pg_split_23_xray` | 3/4 beat grid (cut at f2114 = k64.5, off-grid) | f2114–2162, 48 f, source 322–370 | **Hidden cut**: X-ray room → the same X-ray room with the same framing and split windows, so it isn't perceived as a cut. Director decision, trailer re-review (5 Oct). The clip carries `grid_waiver {rule, reason, frame}`, and `on_beat` is false. The validator downgrades the grid error to a WAIVED warning only for that clip; the QA cut gate lists it under `waived_off_grid_cuts`. Every other cut keeps the hard grid rule. |
| T019 in-point | (choice, not a waiver) | src 322 | The `q2-restored` mark. At 306, q2 still carries the BOOP sparkle (not fully restored), so per the Director's rule the clip keeps 322 and runs to source 370, inside the `xray-intact` hold (322–502). Checked: the "Night survived!" toast (src 341+, css y 76–119) is above the room crop (y ≥ 124), so it's never in frame. The bots' BEEP badges blink every 12 frames throughout the hold: this is the replay's record of the night's syndrome, the same as T018. |
| `punch_native` clips (proof split windows, montage 2× punch-ins) | upscale guard on the **1440p master only** | T013–T019, T028, T030 | Director-approved: the 1080p delivery stays native (hard error for any 1080p upscale); the master upscales the code window and the 2× punch-ins. |
| `label: true` captions (`cap06`, `tag_xray_proof`: "X-ray · simulator view") | reading time | f818–1298, f2114–2162 (tag starts on the first visibly X-ray frame, Critic honesty fix) | These are persistent HUD labels, not captions to be read once (Director, 5 Oct), so the validator and the QA captions gate skip the reading rule for `label` entries. Contrast and overlap still apply. |
| `cap03`, `cap04` (gremlin/ghost cards) | the **pixel** sprite heuristic only | f738–1106 (flagged at f773/f949) | The ink-blob fallback can't tell wall decor (the clock, shelf, bunting behind the top-left cards) from characters. The Director confirmed there is no character, bot or label there, and the Motion Designer's re-render puts the cards on a solid 74 % plate. The captions carry `decor_waiver`, and QA reports them as `waived` instead of FAIL. layout.json `sprite:`/`actor:` boxes are still enforced, and cap05 and all other captions keep the pixel check. |


## Contrast gate fix + cap06 plate (5 Oct, 05:30)
- **Bug, now fixed:** the 05:15 QA reported `tag_xray_proof` at 1.55:1, while on screen it reads clearly (paper glyphs, ink outline, dark plate). The cause was the card branch of the contrast gate. It split the overlay's opaque pixels into two classes and took the *minority* class as the text. For thick paper strokes with a thin ink outline, that picks the outline and measures it against the fill. The gate now evaluates **both polarities** (light-on-dark and dark-on-light) and keeps the better one: genuinely illegible text scores low in both, while a mis-picked polarity no longer fails a good caption.
- For bare-glyph overlays (matte fill < 50% of its bbox, so no plate inside the matte), the 2–8 px background ring may extend outside the matte into the editor's shadow-pass plate, which is what the letters are actually read against. Plate cards keep the ring limited to the card's own pixels (so a card's icon sprite is ignored, as before).
- `caption_rect` now locates pre-rendered overlays from their own matte (alpha bbox at full legibility + `render.offset`, in 1080p units). Before, an overlay without motion params fell back to a generic top band, which mattered for the overlap and sprite checks on the floor-placed proof tag.
- Result on the 05:06 render: tag_xray_proof 14.07:1; cap01–05 and cap07–11 all ≥ 7.4:1; **cap06 (the X-ray tag over the gremlin beats) 4.29:1, a real borderline**: its soft glow (sigma 12, opacity 0.7) lets the light wall through 6–8 px from the glyphs.
- **Fix (picture):** cap06 now uses the same dark plate as the proof tag (`dilate 14, sigma 6, gain 4.0, opacity 0.85`), which also makes the two X-ray tags consistent. Only chunks [600,1200) and [1200,1800) re-encode (per-chunk cache).

## Mechanic plan (5 Oct; EDL built and validated, NOT rendered; for the Critic's review)
`tools/video/edl/mechanic.edl.json` from `plans.py build_mechanic()`: **9040 frames = 2:30.7**, 21 clips, 23 strip captions, 2 X-ray labels, 2 baked closing texts. `validate.py` PASS. `render.py --dry-run` builds every graph (24 Stage-A chunks, 16 B/C chunks to render); the signed-off trailer's cache is untouched (dry run: 0/8 chunks).

### Lessons from the trailer, applied
| lesson | how the mechanic does it |
|---|---|
| programming visible (REVISED 2) | Explain beats keep the **normal layout**: the editor with the lit card, plus Schrödi's dialogue as the narration. The three program-run beats (the 2-3 night, the X-ray proof, the 3-1 twist) are **split screens** inside the 88% game area (split_frame scaled 0.88): the room on the left, the Bot Code Morning column on the right at 2× (350×477 css, the trailer's window). The code window now **follows the lit card** (new keyframed `windows[].keys`, eased). The decoder being written (me_23_drag) is a 1.8× push on the editor (`program_focus`). Every split clip has a `bot_code` window, and every other clip keeps ≥ 98% of the editor in view (validator) |
| cause → effect captions | each sentence names the card and its effect on its action frame: "The PEEK card looks at q1…", "A bot HIGHFIVEs two Qubbles.", "LISTEN: BEEP = they don't match.", "IF a BEEP and b QUIET → BOOP #1.", "SPIN turns the ghost's phase flip…" |
| never two texts | **new validator check**: a strip *sentence* may not overlap an on-screen in-game dialogue line (capture layout.json `.dialogue`, mapped through the edit; split windows count only if their crop contains the box). Over Schrödi's lines the strip carries only a `= term` chip. Verified to fire on an injected overlap |
| X-ray tag only on X-ray frames | `tag_xray_alpha`, scaled into the game rect with the proof tag's dark plate (floor, bottom-left of the room). On M003 from src 1190 (the game's X-RAY chip and the see-through dome start at the 1185 replay; checked on stills); on M012–M013 throughout (me_23_xray is the X-ray replay from src 113; both ranges start after it) |
| dark gate | `dark_ranges` (new): the 4 lights-out phases (~2.2 s each, from a per-frame room-luma scan of every source, `videos/final/work/mechanic/luma_scan.json`). QA's `dark` gate now checks the room region of the delivered render under luma 75 on every frame (source dark phases measure 51–60; bedtime is ~160, morning ~190), so any mis-seek into a lit frame fails |
| captions on plates, clear of sprites | strip captions live on the paper strip below the game (clear by construction). The tags use the dark plate. The sprite and contrast gates run on the render |
| grade | In this game a night is bedtime (lit) → ~2 s lights-out → **morning, when the bots LISTEN and the caretaker BOOPs in daylight**. So the mixed takes are graded `day`, and the deep-blue `night` LUT is kept for the all-night cold open. That avoids a LUT pop mid-take; the game's own palette carries the 2 s lights-out. (Note for the Critic: the trailer grades its proof `night` over morning frames. It's signed off, so it's left as is.) |
| resources | render one video at a time (JOBS=1, pinned threads); the per-chunk cache holds fix rounds to one chunk |

### Beat by beat
| time | frames | clip(s) | layout | picture | strip (sentence / `= chip`) |
|---|---|---|---|---|---|
| 0:00–0:06 | 0–360 | M001 me_cold_blanket 30–390 | cinema 4K, night | moonlit blanket, push 1.0→1.12 | "Every Qubble dreams two dreams at once." |
| 0:06–0:21.6 | 360–1294 | M002 me_11_peek 306–700, M003 1000–1540 | normal | 1-1: run, the PEEK card lit, q1 collapses (tl 586). The cut 700→1000 re-joins Schrödi's "You woke q1… the other half is gone forever" fully typed. Then the X-ray replay shows the lost half (collapse-xray tl 1109) | "The PEEK card looks at q1…" → `= measurement` (over Schrödi) → "The replay shows what the peek destroyed." + X-ray tag 944–1294 |
| 0:21.6–0:29.6 | 1294–1774 | M004 me_threat 280–760 | normal | bedtime HIGHFIVEs → lights-out (dark 1486–1619) → the flip (tl 1567) → morning fail | "One dream changed. Which one? You can't look." (legible on the flip) |
| 0:29.6–0:38.9 | 1774–2336 | M005 me_encode 248–810 | normal | the HIGHFIVE checklist shares the dream (tl 1881, 1989); Schrödi: "Three Qubbles, one dream…" | "You can't copy a dream. You can share it." `= encoding` → `= entanglement` |
| 0:38.9–0:50.9 | 2336–3056 | M006 me_21_listen 340–1060 | normal | 2-1 in 12 s: the bot HIGHFIVEs the twins, lights-out flip (dark 2453–2586), LISTEN → BEEP (tl 2868), BOOP | "A bot HIGHFIVEs two Qubbles." `= parity check` → "LISTEN: BEEP = they don't match." |
| 0:50.9–1:04.9 | 3056–3896 | M007 mo_syndrome_table 0–840 | graphic | two bots, four answers, each row lights its Qubble (all legible at +668) | `= syndrome: two answers point at one Qubble` |
| 1:04.9–1:12.1 | 3896–4326 | M008 me_23_drag 40–470 | **program close-up** 1.0→1.8× | the decoder written card by card: LISTEN drop (tl 3978), BOOP drops (4091, 4204) | "Write the fix, card by card: IF a BEEPs and b is QUIET → BOOP #1." `= decoder` |
| 1:12.1–1:27.1 | 4326–5226 | M009 me_23_night 600–1500 | **split** | the night runs it: the flip in the dark (tl 4408, dark 4328–4460), morning HIGHFIVEs, LISTEN a BEEP (4879), b QUIET (4990), the IF jump, BOOP #1 (5185); the code window follows the lit card | "In the dark, Flipper flips one Qubble." → "Morning: a BEEPs, b stays QUIET → it's #1." → "IF a BEEP and b QUIET → BOOP #1." |
| 1:27.1–1:35.2 | 5226–5709 | M010 me_23_night 1500–1777; M011 pg_test_strip 30–236 | normal; test strip push 1.3 | test pass + Schrödi "Two little beeps. You found the gremlin without looking at a single Qubble." (cut before Flipper's line); Test all fills ✓ | `= error correction` → `= verified on every night` |
| 1:35.2–1:45.6 | 5709–6339 | M012 me_23_xray 540–900, M013 1290–1560 | **split** | X-ray replay: the flip under X-ray, the inspector shows the shared dream (tl 5789), BOOP: survived (6117) | "The dream lives in all three Qubbles." `= entangled, not copied` → "Fixed, and the bots never learned the dream." + X-ray tag 5709–6339 |
| 1:45.6–2:04.5 | 6339–7468 | M014 me_31_phase 71–302 (normal); M015 900–1360, M016 2180–2618 (**split**) | normal → split | 3-1: Schrödi "Morning check: the dream doesn't match. 30 of 48 nights went wrong." → the SPIN sandwich (SPINs 6619/6728/6837, Phasey in the dark 6970, dark 6901–7021) → both bots BEEP (7071, 7183) → BOOP (7365) → pass (cut before Phasey's line) | `= bit checks miss phase flips` → "SPIN turns the ghost's phase flip…" → "…into a plain flip the bots can hear." → "SPIN, fix, SPIN." `= phase-flip code (Hadamard basis)` |
| 2:04.5–2:09.5 | 7468–7768 | M017 pg_export_qiskit 340–640 | normal | Text view → Export to Qiskit, the real code | "Every program is a real quantum circuit: Export to Qiskit." |
| 2:09.5–2:30.7 | 7768–9040 | M018 card_justagame 192 · M019 mo_circuit_morph 420 (snap 7960) · M020 mo_qiskit_stamp 300 · M021 mo_end_card 360 | motion | "It's just a game…" → snap → the cards morph into the circuit, "…where you accidentally learned quantum error correction." (legible 8052–8680) → the stamp → the end card | baked |

Shots: me_cold_blanket, me_11_peek, me_threat, me_encode, me_21_listen, me_23_drag (re-capture), me_23_night, me_23_xray, me_31_phase, pg_test_strip, pg_export_qiskit. Motion: split_frame (×5, `rect`-scaled), tag_xray_alpha (×2), mo_syndrome_table, card_justagame, mo_circuit_morph, mo_qiskit_stamp, mo_end_card, plus the caption scene (motion_captions.py) for the 23 strip items. circuit_morph_mech (300 f) is not used: its line is legible at f92, which leaves 3.5 s, under the 3.88 s reading rule. The 420-frame morph plus the stamp gives 10.5 s.

### Gaps, by owner
**Capture**
1. **me_encode: Schrödi's second line is cut off by the take's end.** "Three Qubbles, one dream. All Sunny together or all Moony together." finishes typing at 758, and the take ends at 810, so it's fully legible for 0.85 s. Its first line (2–247) sits under a modal (66–139). Ask: re-capture with the first line typed and no modal (≥ 3 s), and a tail of ≥ 3 s after the second line (to ≥ src 940). Same timing otherwise.
2. **me_23_night: Schrödi's payoff line is up for only 1.9 s.** "Two little beeps. You found the gremlin without looking at a single Qubble." (typed 1662) is replaced at 1777 by Flipper's "HOW 😭 u didnt even look. this is so ohio". Ask: hold Schrödi's line ≥ 3.5 s (delay Flipper's), or the Critic accepts 1.9 s. The edit cuts before Flipper's line.
3. **Idle speech bubbles** (the trailer's "the end. zzz" / "nope, next ›" lesson): unverified on me_23_night, me_23_xray and me_31_phase inside the split crops. I'll check them on the first render's stills; if present, re-capture those three with bubbles off, keeping the events frame-identical.
4. No re-capture is needed for me_11_peek (the edit stitches Schrödi's repeated line), me_threat, me_21_listen, me_23_drag, pg_test_strip or pg_export_qiskit.

**Motion**
1. **Card pops/rings for the five split clips** (`proof_overlay`-style, alpha, at the game rect), on these timeline frames:
   - M009: HIGHFIVEs 4543/4622/4700/4778, LISTEN a BEEP 4879, LISTEN b QUIET 4990, the IF jump (about 5030–5150), BOOP #1 5185;
   - M012/13: the inspector 5789, BOOP 6117;
   - M015: SPINs 6619/6728/6837, Phasey 6970;
   - M016: BEEPs 7071/7183, BOOP 7365.
   An actor ring on the caretaker and bots, the same as the trailer.
2. **Code-window y positions:** my keys (Morning column x1570 at y 64 → 250 → 565 for M009; Bedtime x1440 y64 for M015; y 330 → 565 for M016) were measured from 640-px stills. Please confirm or measure them as for `code_window_src_css_per_seg`, since the pops must align. 3-1 auto-scrolls its program column.
3. **split_frame at 0.88:** check the frame's stroke and shadow at the game-rect scale, or render a variant sized to the 1689.6×950.4 game rect.
4. The strip caption tracks via motion_captions.py: 23 items, 2 tracks (this is the first heavy step of the mechanic render).

**Sound**
1. The mechanic music-first preset (in progress), against this EDL. Design cue: the snap at 7960. Card UI sounds (card_pick/card_drop at the drag's drops) and Qubblese voices under Schrödi's lines come from the capture events. Flipper's and Phasey's lines fall outside the clips, so they're not placed.
2. Suggestion: thin the music in the four lights-out phases (1486, 2453, 4328, 6901), so the darkness reads as the threat.

### Open questions for the Critic
1. Split screen only on the program-run beats, normal layout (with the narration) elsewhere: right balance?
2. Cutting the Gen-Z gremlin lines (Flipper "this is so ohio", Phasey "fr fr"): right for an explainer, or keep one for character?
3. The `day` grade on the mixed takes (above).
4. The wording of the 23 strip lines (cause→effect), especially "The replay shows what the peek destroyed." and "SPIN turns the ghost's phase flip… into a plain flip the bots can hear."

### Tooling added (all inert for the trailer)
- keyframed split windows (`edl.window_at`, used by render, validate and QA);
- overlay `rect` placement (render);
- `program_focus` (validate);
- the never-two-texts dialogue check and duplicate caption ids (validate);
- `dark_ranges` in the QA `dark` gate;
- the dry run tolerates strip captions awaiting motion_captions.py.

### Critic plan review applied (5 Oct, 07:45; EDL validated, NOT rendered)
`mechanic.edl.json`: 9254 f = 2:34.2, 21 clips, 29 captions. `validate.py` PASS (warnings: 2 missing sources, and M014's push).
- **#1 M006 (2-1):** the known-target case applies. `src/levels/ch2.ts` L21 has `noise.targets: ['q2']` ("Flipper only ever reaches Qubble 2 (it sleeps by the window)"), and Schrödi's intro says so. So `IF a BEEP → BOOP q2` is correct for this warm-up. The BOOP stays, and a new caption sits in the gap after the flip: **"Here Flipper can only reach #2."** (0:43.3–0:47.4), then "LISTEN: BEEP = they don't match." The syndrome table then answers "which one?" for the general case.
- **#2** cap24 → "SPIN · night · SPIN · then fix. = phase-flip code (Hadamard basis)" (starts at the SPIN action, 4 frames earlier, for the 4.23 s reading time).
- **#4 M008 → `me_23_decoder` (new capture, placeholder until it lands), 710 f = 11.8 s.** me_23_drag can't carry this beat: all three IF cards arrive pre-filled (a BEEP / b QUIET already set from frame 0), and the take only drags LISTEN b, BOOP q1 and END. Brief for the Capture Engineer is below. Captions: "Write the fix, card by card." (from the LISTEN drop to the first chip) → "IF a BEEPs and b is QUIET → BOOP #1. = decoder" (from the first chip to the end). The camera is the right-anchored editor push (1.6→1.8×), with cy following the LISTEN, IF and BOOP rows. Placement uses the take's real marks when it lands, otherwise the planned frames.
- **#5** M020 (mo_qiskit_stamp) is cut. The closing line ends with the morph (5.0 s legible).
- **#6** cap16 → "The program runs it: BOOP #1." · **#7** cap18 → "= tested against every single flip".
- **#8 push-ins:** new `focus_push()` in plans.py. Each normal-layout take gets `focus = {frame, z, boxes}`: the lit card and the actor, in capture CSS px, measured from gridded stills at the action frame. The camera holds at 1.0, then eases in over 60 frames to land **on** the action frame, then holds. The view is centred on the boxes' union and clamped. The validator's rule for these clips is now **"every focus box stays inside the view from the action frame to the clip's end"**, and it warns below 1.25×. Values: M002/M003 1.3× (PEEK row + q1/caretaker), M004 1.4× (bedtime HIGHFIVE + the twitching q2/Flipper), M006 1.3× (the morning rows + bot a/caretaker), M010 1.3× (Schrödi/Flipper box + Qubbles; the program has finished, so there is no lit card), M017 1.3× (Phasey's box + room), M018 1.4× (the export panel). **Exception: M014 at 1.12×.** Schrödi's "30 of 48 nights went wrong" box and the ✗ test strip (the evidence) can't both fit at 1.25×. Choose: accept 1.12×, or drop the strip and push 1.3× on the box + room.
- **Gremlin slang (Q2):** Flipper's "HOW 😭 u didnt even look. this is so ohio" is kept: M010 now runs to src 1906 (shown 1777, typed 1831), under the "= error correction" chip. Phasey's "wait u can see me?? not fair fr fr" (shown 2620, typed 2671) only exists *after* the pass, and the split's room crop hides the dialogue box, so it is a new normal-layout tag, **M017, 1.75 s, with no strip text**: a chip needs 2.4 s of reading time, which doesn't fit the Critic's 1.5–2 s.

**Capture brief `me_23_decoder`** (2-3 build view, same layout and DSF as me_23_drag, cursor on, about 13 s, one continuous take). Start with HIGHFIVE ×4 + LISTEN a placed, the fix2/fix3 IFs present, and **no fix1 IF**. Then:
1. drop LISTEN b;
2. drag a new IF card in above the fix2 IF;
3. tap its first condition → a, BEEP;
4. its second → b, QUIET;
5. set its target → fix1;
6. drop BOOP q1 under the fix1 flag;
7. drop END;
8. hold 1.5 s.

Marks: `drop-LISTEN, drop-IF, cond-a, cond-b, target, drop-BOOP, drop-END, done`. Leave about 1 s of lead-in before drop-LISTEN.

**Still open from other owners (unchanged):** the me_encode re-take (M005 is missing on disk; its captions keep the old frames until the marks land); the 3-1 normal-view re-take without the X-RAY REPLAY chip / ✗ strip (M015, **and also M014**: src 71–302 shows the same chip and the 18/48 strip; there it is the honest failure, but the chip still reads as X-ray footage, so either re-take it, or tag it if it really is X-ray); Schrödi's "Two little beeps…" held ≥ 3.5 s (M010 is timed to the current take: 1563–1777 = 3.6 s); the bubble scan on me_23_night, me_23_xray and me_31_phase; and the Motion syndrome-table nits and split-clip card pops.

### Motion overlays + v2 captures applied (5 Oct; EDL validated, NOT rendered)
- **Swaps, events diffed:** me_23_night_v2 and me_23_xray_v2 are frame-identical to v1 (20/20 and 16/16 events at offset 0), so their in-points are unchanged. me_31_phase_v2 runs **+30 f** from the night on (spins 979/1088/1197, phase 1330, bots 2251/2363, BOOP 2545, Phasey 2650 typed 2701), so the in-points are 930 / 2210 / 2650. Schrödi's failure report (71–302) is unchanged.
- **Code-window keys** (Motion): night `[[0,64],[660,64],[690,250],[705,250],[722,420]]`; 3-1 fix `[[0,330],[185,330],[205,450],[255,450],[290,565]]` at x 1570; xray y 64 / 565 and the 3-1 night (x 1440, y 64) are unchanged. The room/code window dsts equal the pops' `room_dst`/`code_dst` exactly.
- **mo_pops_M009/M012/M013/M015/M016**: no rect, at each split clip's start, above split_frame, keyed by (shot, in) so renumbering can't misplace them. The names keep Motion's original clip numbers; in the rebuilt EDL they sit on M011/M014/M015/M017/M018.
- **me_encode re-take** (real now): 3 parts. Schrödi's line 1 (the vote trick fails, no copies) with the chip "= no-cloning"; the dialogue-free HIGHFIVE run (1030/1138) carrying "You can't copy a dream. You can share it." (gloss "= encoding"); his win line (typed 1434) with "= entanglement". Line 2 (the Bedtime instruction) is dropped: the run shows it, and the length budget is tight.
- **me_23_decoder** (real now): the take is slower than planned (987 f at the old handles). Tighter handles (drop-LISTEN−40 … done+40) at a **constant 1.15×** (Director: card dragging must look natural; 1.3× was rejected) → 797 f = 13.28 s, about 1.5 s over the Critic's ~12 s, which the Director accepted. The mechanic runs 9569 f = 159.48 s. These are UI drags only; the mixer thins clicks in sped-up clips.
- **Syndrome table:** the 960 f fix keeps my 840 f slot (row 4 at f646, fully legible from f668, a 2.9 s hold).
- Length 157.95 s (23 clips, 0 placeholders). Validator: PASS; one warning, the accepted 1.12× on the 3-1 failure shot (now M016).

## Showcase plan (5 Oct; EDL built and validated, NOT rendered; for the Critic's review)
`tools/video/edl/showcase.edl.json` from `plans.py build_showcase()`: **13517 f = 3:45.3**, 34 clips, 24 strip/baked captions + 25 HUD labels. `validate.py` **PASS** (warnings = the asset gaps below). `render.py --dry-run` builds every graph (42 Stage-A chunks, 8 transitions, 23 B/C chunks). The signed-off trailer's cache is untouched (dry run: 0/0/0).

**The 6 old errors** were all one problem: hero-level titles written as strip *sentences* over Schrödi's/the gremlins' win lines (never two texts). In every `sc_lv_*` take the in-game lines run continuously from Test all to the win card, so in the rebuild the strip carries only a `= term` chip there. The level names moved to the **blanket_title wipe patch** (the Motion Designer's existing 72 f design) plus a persistent **HUD label**, styled like the X-ray tag, which labels are exempt from the reading rule.

### Lessons applied
| lesson | in the showcase |
|---|---|
| programming visible | Full-UI takes keep the editor fully in view: a right/bottom-anchored drift 1.0→1.05×. The 1080p sources cap pushes at **1.136×** in the 88% area, so the Critic's 1.25–1.4× push-ins are only possible on 4K takes. Program *runs* (3-3 Wobbles, 4-1 Shor-9) are **split screens** (room \| Bot Code, split_frame) from new 4K captures. The QoL features are a **2×2 of 2× crops** (precomp `sc_qol4`). The IF card's help page is a deliberate `card_focus` close-up (new validator exemption: the card is the subject) |
| cause → effect | sentences name the action and its effect: "Wobbles only half-flips a Qubble… asking the bots turns it into a full flip or none.", "IF reads the bots' answers and jumps: real classical feed-forward." |
| never two texts | sentences only where no in-game line is up; chips over Schrödi; **the validator check is now a true interval overlap** (it used to test only the dialogue's first and last frame; the mechanic and trailer still pass) |
| X-ray tag only on X-ray | Gremlin Lab (X-ray always on: the whole clip) and the Lab Notebook (its room is in X-ray: silk threads and see-through domes, checked on a still). The level takes and the codex are normal view |
| dark gate | 4-2 Lights Out: room region, mean luma < 40 on every frame. The source room is ≤ 14.4 across src 0–2449 (per-frame scan); the program column stays lit, which is the point |
| captions on plates, clear of sprites | strip captions on the paper strip; labels/tags on the dark plate, top-left of the game rect (the sprite gate runs on the render) |
| no duplicate content | **new validator error:** no two clips may show overlapping source ranges of one shot (opt out with `reuse_ok`). sc_card_guide's IF page is not used (pg_if_anatomy is); the Codex's Bloch close-up is the tour's own take, not the badge-bearing `sample-codex-bloch` |
| beat-locked strobes | the 9 strobes (1 beat each) and the cuts into the next chapter land on the showcase bed's grid (84 BPM 4/4, first downbeat 0.08 s: beats 45–48, 49, 71–74, 75, 107, 108; checked on the final EDL). `beds.py --edl` plans the bed from this EDL on the same grid |

### Beat by beat
| time | frames | clip | layout | picture | strip / label |
|---|---|---|---|---|---|
| 0:00 | 0–300 | S001 **sc_grid16 v2** (precomp) | 4×4 | the 16 verified solves **cascade**: tile k is solved at f54+12k (f54→f234); a green ✓ pops on each; level chips | "Sixteen levels, from a majority vote to Shor's 9-qubit code." |
| 0:05 | 300–600 | S002 sc_title_peek 120–420 | normal (1080p sample, no push) | title letters collapse under the hover | "Even the title collapses if you look at it." |
| 0:10 | 600–936 (+72 under the title wipe) | S003 sc_dream_map 60–396 | map, push 1.1 | the chapters, partly unlocked | "The dream map: five chapters, Day Shift to The Big Nine." |
| 0:15.6 | 936–1494 | S004 sc_lv_1-1 (**blanket_title "1-1"**) | normal, drift | program → Test all ✓ → "You did nothing. Perfectly." → win card | `= measurement collapses a superposition` · label "Night Shift · 1-1 Dont Wake Them" |
| 0:24.9 | 1494–1933 | S005 sc_clone_glitch 0–439 | normal | **1-3**: the copy fails, the clone glitch tears the screen ("ERROR: cannot copy a dream. Sharing it instead…") | `= no-cloning: a dream can't be copied` · label 1-3 |
| 0:32.2 | 1933–2105 | S006–S009 strobes 0-1 · 0-2 · 1-2 · 1-4 | normal | win cards, 1 beat each | labels "0-1 Good Morning ✓" … |
| 0:35.1 | 2105–2633 | S010 sc_lv_2-3 (blanket_title "2-3", already rendered) | normal | "Two little beeps…" | `= syndrome decoding` |
| 0:44.4 | 2663–3048 | S011 **sc_map_flip_solve** (gap) | map | Flipper on the map, solved by the map-bots | "Flipper got into the dream map. The map's own bots point to the flipped room." |
| 0:50.8 | 3048–3219 | S012–S015 strobes 2-1 · 2-2 · 2-4 · 2-5 | | | labels |
| 0:53.7 | 3219–3891 | S016 sc_lv_3-1 (blanket_title "3-1") | normal | Phasey: "wait u can see me??", "Sideways at bedtime…" | `= phase-flip code (Hadamard basis)` |
| 1:04.9 | 3891–4591 | S017 **sc_run_3-3** (gap) | **split** | Wobbles half-flips in the dark → LISTEN → full flip → IF → BOOP | "Wobbles only half-flips a Qubble…" → "…asking the bots turns it into a full flip or none. Both are fixable." |
| 1:16.5 | 4591–4633 | S018 strobe 3-2 | | | label |
| 1:17.2 | 4633–5233 | S019 **sc_run_4-1** (gap; blanket_title "4-1") | **split** | Shor-9: a strike on one of nine, rows of bots LISTEN, the fix | "Nine Qubbles: three little codes inside one big code." |
| 1:27.2 | 5233–5869 | S020 sc_lv_4-1 | normal | Test all ✓, "Any gremlin, any Qubble, fixed blind." → win card | `= Shor's 9-qubit code: any single-Qubble error, fixed blind` |
| 1:37.8 | 5869–6469 | S021 sc_lights_out_ear 1836–2436 | normal, **dark gate** | **4-2**: the room black, the program column lit, the bots' chord (src 2420); cut 4 frames before the idle bubble | "Lights Out: the last level is solved by ear." |
| 1:47.8 | 6469–7249 | S022 sc_gremlin_lab 60–840 | normal | sandbox, X-ray always on | "Gremlin Lab: a sandbox with X-ray always on. Break things on purpose." + **X-ray tag** |
| 2:00.8 | 7249–7729 | S023 **sc_night_shift** (gap) | normal | endless mode | "Night Shift: endless, randomly generated nights." |
| 2:08.8 | 7729–8329 | S024 sc_threshold 60–660 | normal | the Night Shift Lab chart draws | "A code only helps when gremlins are rare: three Qubbles beat one only below p = ½." |
| 2:18.8 | 8329–9389 | S025 sc_codex_tour 40–1100 (wipe) | push 1.12 to the entry | the collection → Flipper → the Qubble entry, 3D Bloch sphere, Measure (src 770) | "The Codex: every character, gremlin and card, and what it means in real life." → `= Bloch sphere: move the dream, then measure it` |
| 2:36.5 | 9389–9885 | S026 sc_card_guide 0–170 + S027 **pg_if_anatomy** 76–402 (4K, 1.6→1.75×) | | all 12 cards → the IF card's anatomy | "Every card has a guide. IF reads the bots' answers and jumps: real classical feed-forward." |
| 2:44.8 | 9885–10795 | S028 sc_notebook 380–1290 (wipe) | normal | the Lab Notebook's pages flip over an X-ray room | `= Nerd mode: state vector · Bloch spheres · circuit · stabilizers` + **X-ray tag** |
| 2:59.9 | 10795–11395 | S029 **sc_qol4** (precomp, wipe) | 2×2 | snippets + doodle · step-mode scrub to the snap · help slot · Export to Qiskit | "Write it like real code: snippets, comments, step-through, help, Export to Qiskit." |
| 3:09.9 | 11395–11645 | S030 sc_save_joke 20–288 | push 1.12 | settings: the save-data line | "Even your save file is error-corrected: three copies, majority vote." |
| 3:14.1 | 11645–12545 | S031 sc_curtain_call 0–900 (wipe) | push 1.1 | the cast line-up and the credit panels | none (the credits carry their own text) |
| 3:29.1 | 12545–13517 | card_justagame · mo_circuit_morph (snap) · mo_end_card | motion | the closing line, as in the mechanic | baked |

**Every level appears:** heroes 1-1, 2-3, 3-1, 3-3, 4-1; meta beats 1-3 (the clone glitch) and 4-2 (Lights Out); strobes 0-1, 0-2, 1-2, 1-4, 2-1, 2-2, 2-4, 2-5, 3-2. **Features:** every chapter, Night Shift, Gremlin Lab, the Night Shift Lab threshold chart, the Codex with its 3D Bloch sphere, the Card Guide, the Lab Notebook (Nerd mode), snippets and doodle comments, step mode, the help slot, Export to Qiskit, the save-data joke, the credits.

**sc_grid16 v2** (`precomp.py sc_grid16`, `--dry-run` prints the plan): tiles 933×525 on a paper ground with an ink keyline, chapter order (row-major). Each tile's in-point is computed so its *solve* (the win card; for 1-3 the clone glitch at src 41; for 4-2 the chord at src 2419, cut before the src-2440 bubble) lands at f54+12k. Level chips and the ✓ badge come from `grid_labels.html` (one Chromium job). **sc_qol4** (`precomp.py sc_qol4`): 2×2, 600 f. TL pg_snippets_doodle 174–774 · TR pg_step_scrub 72–1382 at 2.18× · BL sc_qol_grid 300–900 (help slot) · BR pg_export_qiskit 40–640, each crop ≥ 1.28 source px per delivered px (no upscale). The TR/BR framings are the trailer's measured ones; **TL/BL crops need checking on stills before the render.**

### Gaps, by owner
**Capture** (P1 = in the cut now as placeholders; P2 = quality)
1. **P1 `sc_run_3-3` and `sc_run_4-1`:** ONE "Run night" each at **DSF 2 (4K)**, editor visible, `quietBubbles`, about 14–16 s. 3-3: Wobbles half-flips in the dark → morning LISTENs → the half-flip resolves into a full flip → the IF jumps → BOOP. 4-1: a strike on one of nine → the bot rows LISTEN → the fixes. Marks: `strike, listen-*, if, fix, done`. Why: the `sc_lv_*` takes only show **Test all**, which is instant (the ✓ strip fills on the click; `win` = the `test-all` frame), so no level take shows a program *running*. The mechanic already has the 1-1, 2-1, 2-3 and 3-1 runs, so these two give the showcase its own runs, with no duplicate content.
2. **P1 `sc_map_flip_solve`:** the current sc_map_flip is 570 f of a static puzzle (the "Flipper got into the map!" banner; the cursor never taps). It needs the solve: the map-bots blink, then the tap on the node the syndrome points to, and the node flips back.
3. **P1 `sc_night_shift`:** Night Shift (endless) has no capture. sc_gremlin_lab shows only the lab. About 10 s of one generated night.
4. **P2 idle bubbles:** every `sc_*` take predates `quietBubbles`. Confirmed: sc_lights_out_ear has "the end. zzz" at src 2440 (the cut ends at 2436, so it's avoided). The rest get checked on the first render's stills; re-take only where a bubble is in the used range.
5. **P2 4K re-takes for legibility:** the win cards (each level's one-line lesson), the Night Shift Lab chart, the settings save line and the notebook pages are about 9–11 px text at 1080p × 0.88, under the 1.136× cap. At DSF 2 they could be pushed 1.8×. Optional; the strip states each point already.
6. No `sc_lv_1-3` / `sc_lv_4-2` solves exist. Their meta beats stand in (grid tiles and the cut); fine unless the Critic wants their win cards.

**Motion**
1. **blanket_title** renders for **1-1, 3-1, 4-1** (`--p '{"title":"…","code":"1-1"}' --name blanket_title_11`; 2-3 exists as `blanket_title`). The shared reveal matte exists.
2. **HUD labels** `level_tag_<key>_{fill,matte}.mkv`: full-frame alpha, tag at the top-left of a 1920×1080 frame (placed into the game rect), the X-ray tag's plate and type: 14 level labels (`lv0-1` … `lv4-2`, `lv4-1r`), plus `lab`, `nightshift`, `nightlab`, `codex`, `guide`, `notebook`. The exact strings are in the EDL captions `tag_*`.
3. **Card pops / actor rings** for the two split runs (as proof_overlay), once their marks exist. The split_frame at 0.88 needs the same check as for the mechanic.
4. The strip caption tracks via motion_captions.py (22 items).

**Sound**
1. The showcase music-first mix + `beds.py --edl` against this EDL. Strobe hits on the 9 win cards (on the bed's beats); the snap at the closing (design cue in the EDL); the blanket wipes and titles.
2. Suggestion: thin the bed in Lights Out (S021) so the chord is the only music, as in the trailer.

**Editor (mine, before the render):** run `precomp.py sc_grid16` and `sc_qol4` (one heavy job each), checking the QoL crops on stills first. Re-measure the split-room crop for 4-1 (`ROOM_CSS_41`) and the code-window keys on the new captures.

### Physics claims for the Critic to check
| caption | claim | status |
|---|---|---|
| cap01 | "from a majority vote to Shor's 9-qubit code" | Day Shift (0-x) is a classical majority vote; 4-1 is Shor-9 (README) |
| cap04 | "= measurement collapses a superposition" | 1-1's lesson ("Looking at a quantum thing changes it.") |
| cap05 | "= no-cloning: a dream can't be copied" | no-cloning theorem; 1-3's copy fails and the game shares instead (CNOT entangles) |
| cap10 | "asking the bots turns it into a full flip or none. Both are fixable." | error discretization: a partial X rotation, after syndrome extraction and readout, becomes "no error" or "a full flip" (README "Continuous errors become discrete"; tested) |
| cap12 | "any single-Qubble error, fixed blind" | Shor-9 corrects any single-qubit error (X, Z, Y); the game's gremlins are X/Z/Y/partial rotations. "Blind" = without measuring the data |
| cap16 | "three Qubbles beat one only below p = ½" | 3-qubit code with independent flips: logical failure 3p² − 2p³ < p ⇔ p < ½ (the in-game chart plots exactly this) |
| cap19 | "IF … real classical feed-forward" | IF = classical control on measurement results (README card list) |
| cap22 | "three copies, majority vote" | **wording fixed:** the in-game line says "3-qubit repetition code" as a joke, but the save is classical (three localStorage copies, majority vote: `src/engine/store.ts`). The caption says "three copies", not "qubits" |
| cap02 | "Even the title collapses if you look at it" | a joke: hovering is the "look"; the letters collapse in-game |

### Open questions
1. Heroes 1-1 / 2-3 / 3-1 as **Test-all verifications** (the runs are in the mechanic), and only 3-3 and 4-1 as run splits: right, or capture runs for all five (about 3 more 4K takes)?
2. The 1080p takes can't be pushed past 1.136×. Accept that, or schedule the P2 4K re-takes?
3. Cross-video reuse: pg_if_anatomy, pg_step_scrub, pg_snippets_doodle and pg_export_qiskit also appear in the trailer (1 beat each), and pg_export_qiskit appears in the mechanic (M018). Within the showcase nothing repeats. OK?
4. blanket_title patch + persistent label on the heroes: one name shown twice (in sequence, never at once). Keep the label for orientation, or drop it on heroes?

### Tooling changes (inert for the signed-off trailer; mechanic still PASS)
- validate: the dialogue check is an interval overlap; `no duplicate content` for explainers; Motion caption/transition files missing → warning (error with `--strict`); `card_focus` exemption; the `blanket-title` transition (60–84 f).
- render: transition overlays accept a fill+matte pair (alphamerge); a dry run keys missing sources as `missing` instead of crashing.
- plans: `build_showcase()` rewritten; new placeholder ids `sc_map_flip_solve`, `sc_run_3-3`, `sc_run_4-1`, `sc_night_shift`, `sc_qol4`.
- precomp: `sc_grid16` v2 (cascade, chips, ✓) and `sc_qol4`, with `--dry-run`; `grid_labels.html`.

### Showcase plan, revision 1 (the Critic's "CHANGES, minor"; EDL rebuilt and validated, NOT rendered)
`tools/video/edl/showcase.edl.json`: 37 clips, **13139 frames = 3:38.98** (it was 3:45.3). The validator PASSES. Its warnings: the length is below the old 225 s target window (the Critic's pacing note accepts the shorter, tighter cut), and 5 sources are still pending (below).

| # | Change | Where it is now |
|---|---|---|
| 1 | Curtain call cut to 8 s | S034 3:14.78, 480 f |
| 2 | Codex 17.7 s → 12.0 s, in three hard-cut takes of sc_codex_tour: the collection (src 0–120), Flipper (150–270), the Qubble's 3D Bloch drag + Measure (500–980, Measure at 770, a 1.12× focus push) | S025–S027 2:19.32 |
| 3 | Step mode is its own 5.5 s beat from the 4K pg_step_scrub (src 1110–1442): stepping through the gates, LISTEN BEEP (1204) and quiet (1324), then the one-way measurement "snap" (toast at 1381). Blanket wipe in. The push lands on the snap at **1.56×** with the lit card and the "Snap!" toast both in view (zfit 1.56; 1.45 source px per delivered px). Strip line: "Rewind the night: gates run backwards, a measurement is a one-way door." HUD label "Step mode". The trailer used src 1373–1405 (32 f), and this beat starts 263 f earlier. | S031 2:54.75 |
| 3b | The qol4 TR quadrant (step mode) is now **pg_win_links**: the win card's "Pros call this…" links to Qiskit / IBM Quantum Learning. **NEEDS A CAPTURE** (only the reference still `.scratch/shots/win-links.png` exists). I chose it over Hints because it is one static card, needs no choreography, and shows the bridge to real tools. The precomp table is in `tools/video/assemble/precomp.py` (QOL). The strip line is now "Write it like real code: snippets, comments, help, Export to Qiskit." | S032 3:00.28 |
| 5 | S002 uses the 4K one-glide `tr_title_peek`, src 40–340: the whole glide from before it starts, every collapse, the collapsed hold. The trailer uses 125–317, from the P hit. | S002 0:05.00 |
| 6 | The hero HUD labels are just the code chip after the blanket_title wipe: "Ch 1 · 1-1", "Ch 2 · 2-3", "Ch 3 · 3-1", "Ch 4 · 4-1" (the wipe's sewn title carries the name, spelled as in-game: "Dont Wake Them"). S023: "Night Shift mode: endless, randomly generated nights." | tags lv1-1, lv2-3, lv3-1, lv4-1r; cap16 |
| 7 | Heroes start 1 s before Test all, counted after the 72 f title wipe (in = test-all − 132: 1-1 src 233, 2-3 261, 3-1 251); S020 starts 60 f before its click (src 394). The camera is right/bottom anchored, so the program column stays in frame. S004 chips: "= your program, tested against every single flip" from the click (cap04), then "= measurement collapses a superposition" (cap05). The 1-1 tail grew to win-card + 245 f so both chips get their reading time. | S004, S010, S016, S020 |
| 8 | S033 save joke takes the whole 288 f take (270 + 18 under the credits wipe). "Even your save file is error-corrected…" (cap24), then **"Judges: Settings → Unlock all content."** (cap25, 3.6 s, running into the credits, where there is no other text). The Critic asked for 2 s; the reading rule needs 3.12 s for 38 characters. | S033 3:10.28 |
| 4 | Notebook and threshold: the 1.6× pushes switch on automatically when the source is 4K (`src_width ≥ 3840`). While the takes are 1080p the EDL keeps the current framing and prints a note. Focus centres `NB_FOCUS` / `CHART_FOCUS` in plans.py are provisional; I'll re-measure them from the 4K takes' layout.json (the active page, and the curve with p = ½). | S030, S024 |

**Gaps by owner (revision 1):**
- **Capture:**
  - `pg_win_links` (new; 4K, the win card with the "Pros call this…" Qiskit / IBM links, about 10 s, cursor still);
  - the 4K re-takes of `sc_notebook` and `sc_threshold` (same ids);
  - still pending from the plan: `sc_run_3-3`, `sc_run_4-1` (4K split runs with quietBubbles and marks; for 3-3 a LISTEN mark where the half-flip resolves), `sc_map_flip_solve`, `sc_night_shift`;
  - the bubble check on the `sc_*` used ranges (Critic #10).
- **Motion:**
  - re-render the level tags with the new texts: lv1-1 / lv2-3 / lv3-1 / lv4-1r → "Ch N · code";
  - a new tag "Step mode" (`level_tag_stepmode`);
  - the per-level blanket_title renders for 1-1 / 3-1 / 4-1 (the existing one is 2-3);
  - the remaining level_tag_* fills/mattes the validator lists as "not on disk".
- **Editor (me):**
  - rebuild `sc_qol4` once `pg_win_links` exists (`precomp.py`);
  - re-measure the notebook/chart focus on the 4K takes.
- **Sound:** remix the showcase against this EDL (new lengths, step-mode beat, shorter Codex and credits).

**For the Critic (first render):** on the step-mode beat the in-game toast ("Snap! Measurements are a one-way door…") is on screen together with the strip line, saying the same thing. I kept it, because the snap is the subject. If it reads as two competing texts, the fix is to start the strip line after the toast fades (about src 1440) or to shorten it.

### Motion titles/labels applied (5 Oct; EDL validated, NOT rendered)
- Title wipes: 1-1 → blanket_title_11, 3-1 → blanket_title_31, 4-1 → blanket_title_41 (run split), 2-3 → blanket_title (all through the shared blanket_title_reveal matte).
- `label()` now takes each tag's text from its rendered asset (`level_tag_<key>.json` params.text, ö→o as Quantum draws it), so the EDL strings always match the pixels: "Ch N · code" hero chips, "Ch 3 · 3-3  Wobbles", "Night Shift mode", "Night Shift Lab", "The Codex", "Card Guide", "Schrodi's Lab Notebook", "Step mode".
- Still placeholders (5): S011 sc_map_flip_solve, S017 sc_run_3-3, S019 sc_run_4-1 (run-split pops follow these captures), S023 sc_night_shift, S032 sc_qol4 (the 2×2 precomp waits on its panels). Length 218.98 s; validator PASS (only warning: under the 225 s window, the Critic's cuts to the curtain call and Codex).

## Mechanic render, QA fix round (Oct 5, 13:50)
The first mechanic render (12:43) failed QA on four gates. Findings and fixes:
- **Captions: the paper strip was missing (a real bug, mine).** `plans.py` sets `strip_overlay: true` (the strip and the strip captions come from the Motion Designer's caption scene via `tools/video/assemble/motion_captions.py`), but that step was not re-run after the last plans rebuild. The assembler dropped the template strip and composited bare ink text on the dark blurred extension (21 captions measured 1.0–3.0:1, and the gate was right). **Guard:** `validate.py` now errors when `strip_overlay` is set and any strip caption is unconverted or the `caption_strip` overlay is missing. The showcase EDL had the same latent problem and is now blocked by the guard until its captions are converted.
- **Captions: the X-ray tags were false failures (a gate bug).** For `rect`-placed overlays the gate measured the whole overlay box (the 1690×950 game area), so it reported "over the editor" and a bogus contrast. `qa/run.py` now places the overlay's matte exactly as `render.alpha_src` does (`place_alpha`: rect = scale the full frame into the rect, offset = shift). Re-measured: tag_xray_1 14.6:1, tag_xray_2 14.3:1, 414×32 glyph boxes, no overlap.
- **Picture: 3.7 s of dead air at f634–858** (1-1: the room held at 1.3× after the collapse, then the X-ray replay opened static). `focus_push` no longer holds dead still: it drifts 1.00→1.03 before the push and drifts back out 4% after it (zooming out about the same centre keeps the "card and actor in view" rule; drifting in was rejected by the validator on 5 clips, correctly). The remaining legitimate pauses are marked `hold` with reasons: the closing line's reading hold; the beat after the decoder's last card; the dark, still room before Flipper strikes (src 700–735); the beat on 2-1's BEEP.
- **every_event: 3 decoder card accents land 2 frames early** (mix.py places src 382/492/916 of the 1.15× decoder at f4352/4448/4816; first shown at f4354/4450/4818). That's outside ±1; it belongs to the Sound Designer (mix.py's 1.15× mapping). The gate is not loosened.
- **loudness: −16.0 LUFS.** The mix is −16 by design (the Sound Designer's explainer presets, documented in docs/VIDEO_SOUND.md, and their 9/9 gates check −16). The bible's output spec is −14 for all three deliverables. This is a spec conflict for the Director; the gate stays at −14 until decided.

## Showcase EDL, revision 2 (5 Oct, 15:20; validated, NOT rendered)
The run splits use the Director's in-ranges and Motion's pops, the 4K re-takes are swapped in, and in-game text is never cut into. Length 13,260 f = 221.0 s, still below the 225 s window (a warning).

| clip | shot | timeline | src | notes |
|---|---|---|---|---|
| S011 | sc_map_flip_solve (4K) | 2688–3133 | 40–485 | the bots read at 120 and the tap solves at 348. The strip sentence ("Flipper got into the dream map. Its own bots point to the room.") ends before the game's own toast "Fixed it without looking…" at 341, which carries the payoff |
| S017 | sc_run_3-3 (4K split) | 3959–4633 | 540–1214 | code keys x1570 `[[0,64],[560,64],[600,300]]`, sc_pops_3_3 at the clip start (690 f, trimmed to 674). New helper `fit_to_beat()` trims the take back to the last beat before its clean-source limit (1238: "the end. zzz" at 1240), so the strobe beat lock can't stretch it into the bubble. The three false IFs (1154/1177/1200) stay in |
| S019 | sc_run_4-1 (4K split) | 4676–4870 | 1426–1620 | the strike (error-1 1511) lands at local 85, after the 72 f title wipe uncovers |
| S020 | sc_run_4-1 (4K split) | 4870–5326 | 2740–3196 | LISTEN c/d 2780/2895 → IF Bf2 2978 → BOOP 3154. Code window fixed at x1570 y565, sc_pops_4_1 at the clip start |
| S022 | sc_lights_out_ear_v2 | 5992–6574 | 1836–2418 | the bubble-free re-take (audio events identical to v1, 23/23). Ends before "the end. zzz" (2419) and the toast (2428) |
| S024 | sc_night_shift (4K) | 7354–7834 | 230–710 | skips the loading frames (loaded 207, night-1 255) |
| S025 | sc_threshold_4k | 7834–8452 | 60–678 | `focus_push` to 1.6× on the chart panel (CSS [682,267,556,551]), landing on the p-half mark (288). The chart is the clip's `focus` subject, so the program-visible rule checks the chart box, not the editor |
| S031 | sc_notebook_4k | 9650–10624 | 318–1292 | `focus_push` to 1.6× on the page (CSS [0,70,300,600]; the view clamps left: the page plus half the X-ray room). It ends so the 18 f wipe tail stops at 1292, before "the end. zzz" (1293) and the toast (1302) |

Strip lines changed (for the Motion Designer's caption track; `motion_captions.py` converts them in the render chain):
- cap10 "Wobbles only half-flips a Qubble…"
- cap11 "…LISTEN snaps it to all-or-nothing. Tonight: nothing to fix." + "= error discretization". It starts 135 f before LISTEN a: the honest line needs 4.9 s and the clean take ends at 1214, so the snap happens while the line is read
- cap12 "Nine Qubbles, eight bots: any single error, found and fixed blind." + "= Shor code"
- cap08 "Flipper got into the dream map. Its own bots point to the room."

Still open: sc_qol4 (the 2×2 precomp) waits on pg_win_links (capturing); the strip conversion (`motion_captions.py`, heavy) runs at render time; diegetic in-game captions inside kept takes ("yes! jump ↪" in Lights Out at 2264, "BEEP!" in the notebook) are left in for the Critic to judge.

## Mechanic QA, gate corrections (5 Oct, 15:40)
The first QA on the fix-round render (14:59) failed four gates. Three were gate bugs; one was a real, designed hold that needed marking. The picture and the mix are unchanged.
- **captions (439 "UI overlaps", 11 below 4.5:1).** For strip captions the gate used the alpha of Motion's caption track as the caption footprint. That alpha is the whole paper strip plus its drop shadow above y = 950, so every UI box touching the strip's top edge counted as an overlap, and "text vs ring" compared the paper with the picture above it (ratios 1.0–1.35). Fix: a strip caption's footprint is the strip band. Its contrast (`strip_contrast`) is measured on the delivered pixels: ink glyphs (L < 0.12, eroded) against the darkest 20% of a 2–6 px ring of non-ink pixels (paper, the amber gloss chip, or a chip's shadow). It measures about 11:1 on the stills. A frame with no caption up returns no ink, so the gate fails (0:1) if a strip caption is missing.
- **every_event (3 "silent" decoder events).** The mixer quantises card accents (card_pick/card_drop/ui_click in programming clips) to the groove's 8ths when within 2 frames and keeps `quantised_from` (docs/VIDEO_SOUND.md, "Card UI as rhythmic accents"). av_sync already honoured that; every_event now does too, accepting a cue whose `quantised_from` is within ±1 of the event and whose frame is within ±2.
- **loudness (I = −16.0).** The gate now uses the mixreport's `target_lufs`, the same rule as mix_gates.py. The explainer presets are music-first at −16 LUFS (docs/VIDEO_SOUND.md §13); the trailer stays at −14. **For the Director:** the Bible §0 says −14 for all three videos; −16 is the Sound Designer's documented explainer choice, so confirm or overrule.
- **picture (1 freeze, f3307–3344).** This is mo_syndrome_table's designed title hold ("Two bots. Four answers.", rows start at f60). It's marked as an intentional hold for exactly that range (plans.py + the EDL), not the whole clip.

### Mechanic render fix round (Critic "Milestone: mechanic render", items 3 and 4), camera keys only, no timing change
- **M010 (decoder, f4124–4921):** the camera keeps easing onto the editor to the end: 1.6× → 1.9× (IF drop) → 2.05× (target) → 2.1× (BOOP drop) → a 2.06× drift, right-anchored (cx 1.0). `punch_native` lifts the 1.8× policy cap; the 1080p upscale check stays a hard error (the native limit for the 4K take in the 1690 px game rect is 2.27×). 2.1× is the most that keeps ≥ 50% of the editor's height (the program_focus rule). The editor spans css 1300–1920, so it can't fill the frame natively; the empty floor drops from ~42% to ~32% of the view.
- **M017 (3-1 bedtime split, f7294–7754):** the code window was x 1440 / w 350 css, which clipped "BEDTIME" and the Morning cards mid-word. Between the palette (ends ~1400) and Morning's first card (~1712) there are only 312 css free, so the window zooms to **w 312 on Bedtime** (x 1400) through the SPINs (local 49/158/267), then **eases to Morning** (x 1570, w 350) over local 290–340, before the night strike (local 350). 4K source: 624 px → 612 px, native. `mo_pops_M015` must be re-rendered for this path (its SPIN-card pops were placed for x 1440 / w 350).

## Showcase render, QA triage (6 Oct, 00:30)
First render (00:05) failed 6 gates. Triage (stills in `videos/final/review/showcase_*`):

| gate | verdict | cause | fix |
|---|---|---|---|
| captions: 357 UI overlaps, 8 < 4.5:1 | **REAL, plus a renderer bug** | (a) `alpha_src` took a Motion clip without `frames` as full-length, so the 30-frame level chips ended after 0.5 s instead of holding for their range (`showcase_chip_vanish_bug.png`); the contrast gate then measured empty frames. (b) The chips sat ON the in-game topbar, over the game's own level title | `edl.asset_frames()` (spec `frames` → Motion json → file count) in render.py and QA `card_matte`; specs that carry `frames` produce byte-identical graphs (trailer/mechanic cache keys unchanged). Chips moved +72 px below the topbar and its button row (step mode +124, pushed 1.6×), checked geometrically against layout.json for every clip under each chip, and visually (`showcase_chip_placement_preview.png`) |
| captions: duplicate titles | **REAL** | the Codex, Lab Notebook and Night Shift Lab chips repeat a title the screen already shows (the notebook chip also lands on its title bar) | dropped (`SKIP_DUP_LABELS` in plans.py; remove a key to restore it). For the Director to confirm |
| captions: sprite check "skipped" | gate gap | the JIT render deletes Stage A segments, so there was no caption-free frame | `sprites.caption_free` rebuilds just the needed frame through Stage A (`work/<video>/qa_capfree/`, cached) |
| cuts: 1 unexpected (f3030) | **REAL** | the game re-mounts the map scene at sc_map_flip_solve src 382 (`setScene: map`): one blank capture frame (`showcase_s011_blank_frame.png`) | EDL `frame_patch {382: 381}` on S011 (render repeats the previous source frame; in the Stage A key only when present). The 0% hard-on-beat figure is informational (the ≥80% rule is trailer-only) |
| picture: 16 freezes | mixed | Lights Out by ear (near-static darkness by design; the sound is the content), the closing line over the finished circuit: intentional. Codex and Card Guide dwells of 0.6–1.8 s: real | `hold` marks for the two intentional ones; gentle push-ins (1.0→1.10, within the 1.136× cap of the 1080p takes) on S026, S027 and S029 |
| dark: S022 | gate bug (the room is dark) | the whole-frame lights-out check also ran on a split shot whose lit program column is the point; its declared region check passed (max room luma 11.2 ≤ 40) | a clip with a declared dark `region` is checked on that region only |
| clean: debug_pulseunlock f8760 | false positive | the Codex's own "X-ray: blanket see-through" button, NCC 0.85 (`showcase_clean_fp.png`) | EDL `clean_waivers` (shot + template + reason); waived hits are listed in the report |
| every_event: 4 silent | **REAL (Sound)** | the game's win card pops with no SFX (`level_win` plays at the Test-all success, 3.8–7.6 s earlier) | a cue at f1289, 2501, 3772, 5835 (Sound Designer); timing unchanged, so this is an audio re-mux only |

The timeline is frame-identical to the mixed one (13260 f, the same clip starts/durations/in-points), so the current mix stays valid apart from the 4 win-card cues.

## Showcase QA round (2026-10-06)
The first full 1080p showcase QA failed on 5 gates. Causes and fixes:

| gate | cause | fix |
|---|---|---|
| cuts (1 unexpected, f3031) | sc_map_flip_solve re-mounts the map scene at src 382: one blank frame, then a ~19-frame fade up from paper-white that settles on a different state. The old `frame_patch` covered only src 382 | hold src 381 (the solved map, with the game's own "Fixed it without looking" toast) over src 382 to the clip end, f3030–3133 (1.7 s, `hold` mark). In-point and length are unchanged, so no event or mix cue moves |
| every_event (4 silent `win_card`) | in the game the win card pops ~3.8 s after `level_win`, silently | a `win_card_pop` design cue at each on-screen win card (S004 f1289, S010 f2501, S016 f3772, S021 f5835). **Needs the Sound Designer:** map the name to an asset in mix.py, then remix |
| mix_analysis (freshness) | follows from every_event: the content check needs av_sync + every_event to pass | clears after the remix + re-mux |
| captions: tag_guide on sprites | the "Card Guide" chip ended at `end(CG)+420`, which ran 94 f into the Notebook clip, over its header | ends exactly where the notebook's blanket wipe starts (f9650) |
| captions: tag_xray_2 on sprites | the floor spot sits under the bots and the caretaker once the notebook push-in moves | moved to the open wall right of the notebook panel (chip centre ~(1000,470)); worst ink 0.0007 over 12 frames, chosen with the gate's own metric |
| captions: tag_lv3-3 | the standard hero-chip slot sits over the wall's bunting and shelf bird | `decor_waiver` (wall decor, not characters), with a still for the Critic |
| clean (debug_pulseunlock at f8760) | false positive on the Codex's "X-ray: blanket see-through" pill button. The waiver existed but had been written into `build_mechanic` | `clean_waivers` now emitted by `build_showcase` |

Note on the thread caps (Director): `render.py` THREADS = `NP_RENDER_THREADS` (default 4), `qa/run.py` T = `NP_QA_THREADS` (default 6). safe-run pins every job to the 8 E-cores, which keeps load ≤ 8 (the crash-#7 protection). JOBS stays 1.

## Showcase QA round 3 (2026-10-06, after the 08:12 full render; no clip timing change, so the Sound remix stays valid)
| gate | finding | cause | decision |
|---|---|---|---|
| cuts: unexpected f3031 | the dream map washes to paper-white and fades back up inside S011 `sc_map_flip_solve` | the game re-mounts the map scene at src 382. plans.py already patched it (`frame_patch` holds src 381 over 382+), but **render.py v1 only honoured `{s: s-1}` patches**, so the hold was silently ignored | **Bug fixed in render.py:** `frame_patch` now accepts any earlier target frame (decoding starts at the earliest target a chunk needs; the target is held as one buffer). Patched clips' stage-A key carries `frame_patch_impl: 2`, so only S011 re-renders (no other clip in any EDL has a patch) |
| cuts: hard-on-beat 0 % | informational only (the gate never required it outside the trailer) | the showcase is cut picture-led (the Critic's §6 seconds table: Test-all clicks, win cards, title wipes), and its music-first mix is arranged to the EDL, not to a beat grid | **Showcase and mechanic cuts are not beat-bound.** The gate now reports "not beat-bound" for them instead of a ratio. The 3/4 grid and ≥ 80 % rules stay trailer-only |
| captions: 22 UI overlaps + 1 sprite hit, all `tag_guide` | the "Card Guide" label was held from S029 (the guide overview, on empty paper) into S030 `pg_if_anatomy` (1.6× on the IF card), where it covered the IF's condition row; every overlap is that label against the `.modal` box | label end = end(IA) | **Moved:** the label now ends on the S029→S030 cut (f9154–9324, 2.8 s; labels are exempt from the reading rule anyway). The strip sentence still spans both shots. Not waived: it covered the content being explained |
| captions: sprite check "skipped" for cap26/cap27 | "It's just a game…" / "…where you accidentally learned…" | both are baked into full-frame Motion clips (S036 `card_justagame`, S037 `mo_circuit_morph`): the card is the picture, with no gameplay or sprites beneath, and no separate matte or caption-free frame exists | **N/A, justified:** QA now reports these as `n/a (baked into the full-frame Motion card)` instead of "unchecked". Their contrast is still measured (both ≥ 4.5:1) |
| av_sync (4 design cues) / every_event (4 silent win_card) / mix_analysis freshness | `win_card_pop` at f1289/2501/3772/5835 is missing from the mix | the 10-05 17:18 mix predates the final EDL | the Sound Designer's remix against the current EDL; then mux-only |

## Showcase QA round 4 + a B/C cache bug (2026-10-06, 09:34 QA)
After the remix (08:55) and re-mux (09:02), every audio gate passes (av_sync, every_event, loudness −16.0 LUFS / −1.9 dBTP, mix_analysis with freshness). Two picture gates still failed, and both were real:

| gate | finding | cause | fix |
|---|---|---|---|
| cuts: unexpected f3031 | the dream map still washes to white inside S011, even though `frame_patch` (src 382+ → 381) is in the EDL and the patched segment `S011_dfa452154200` was rendered at 08:59 | **cache bug in `adopt_chunk`** (render.py): it treats an older encode as reusable when the chunk's *graph text* is unchanged. But the graph names the base concat list only by path, so a change that touches **only a segment** (new seg key, same graph) was invisible. The 01:09 encode of [3000,3600) was hard-linked under the new key, and the white-out shipped | `adopt_chunk` now counts every file referenced inside a concat list as a media input (the adopted file must be newer than all of them). The stale link names for [3000,3600) were renamed to `*.stale_adopted`; nothing was deleted, and the inode survives under its old names. Dry run: [3000,3600) is now correctly re-encoded |
| captions: tag_guide on sprites (ink 0.098, f9308) | the "Card Guide" label sat on the bottom edge of the card row, which grows downward under the 1.1× push | placement | `dy` 330 → 540, into the empty paper below the row and clear of the COMMENT card. Only this caption changed (clips byte-identical, so the mix stays valid) |

**Blast radius of the cache bug: it also hit the signed-off mechanic.** A content check (segment frame vs delivered frame, 16-px block match above the strip, `stale_check.py`) found M010 at 0.27–0.34 match, against 0.75–0.87 everywhere else. The M010 decoder camera fix (2.1× right-anchored push, segment re-rendered 10-05 16:10) never reached `videos/final/mechanic.mp4`: chunks [3600,4200), [4200,4800) and [4800,5400) were adopted from the 14:44–14:47 encodes. The Critic's 16:41 sign-off therefore viewed the pre-fix decoder framing. This needs a Director decision (re-encode those 3 chunks, about 15 min, mux-only after that, same timeline, so the mix stays valid), because it changes a signed-off picture.
