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
