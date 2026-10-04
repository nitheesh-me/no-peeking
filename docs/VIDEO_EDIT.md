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
| captions | caption rect vs layout.json UI boxes mapped through camera and placement (no overlap); reading time; **WCAG contrast on the rendered frames**: the template's glyph mask vs the worst 10% of a 2–10 px ring around the glyphs, ≥ 4.5:1 at three moments per caption |
| picture | blackdetect / freezedetect on the proxy vs the intentional marks and the capture-declared holds; first 3 s not black |
| sharpness | median Laplacian variance vs the old cut (`videos/mechanic.mp4`) |
| banding | night shots: the fraction of pixels on perfectly flat 5×5 plateaus inside smooth gradient blocks (< 0.25), plus unique luma levels per block |
| clean | NCC template match (STAGE watermark, judge-mode badge, debug bar; `tools/video/qa/templates/`) every second; trailer footage must come from `?cinema=1` (capture meta) |
| loudness | ebur128 −14 ±0.5 LUFS, TP ≤ −1 dBTP; featured cues ≥ 6 LU over the music (mixreport) |
| proof_sfx | Director: proof-section SFX short-term peak about −14 LUFS (−16..−12) on the sfx stem |
| reencode | 8 Mbps x264 (YouTube-like): sharpness retained ≥ 85%, banding still passes |
| human | fresh-eyes "what do you do?", muted, audio-only and phone-speaker passes: PENDING, with the Critic as proxy |

## The cuts
**Trailer** (cue sheet v2, 112.5 BPM 3/4, beat k = frame 50 + 32k, 4240 frames = 70.67 s). Section edges are the cue sheet's exact frames, and every interior cut is on the grid (or a baked Motion effect whose hit is on the grid).

| section | frames | picture |
|---|---|---|
| cold_open | 0–434 | moonlit blanket (push 1.0→1.15) under the Motion alpha card "Every Qubble dreams two dreams at once." · the **Motion `title_peek`** from k9 (f338): cursor to the P, the collapse and its **spiral shatter on f434** (its one use, baked) |
| peek | 434–722 | the shards run out to black (continuous) · true black under the reverb tail · in-place **relight** day→night (k15) |
| build | 722–1298 | Motion **`card_gremlins`** (Flipper zaps a Sunny Qubble: a real bit flip) · **`card_ghosts`** (Phasey mirrors a swirl: a real phase flip) · the dark room under the alpha card "You can't look." (each 6 beats; a silhouette fills in while the cards are 96 frames) |
| silence | 1298–1394 | 2 beats of true black · the antenna on the dry BEEP (f1362) · the Motion **`logo_reveal`** starts at f1388, so its baked **glitch tear** (its one use) hits the impact at clip f6 = **f1394** |
| drop | 1394–1586 | the logo settles |
| proof | 1586–2162 | one room, 1/2/1/2 bars: flip f1586 · bots ask f1682 · BOOP f1874 · X-ray (in-engine) f1970 |
| montage | 2162–2834 | 12 shots exactly on `cut_rules.montage_cut_frames` (96 → 64 hemiola → 32): checklist, test strip, dream map / highfive, listen, Bloch inspector / Codex sphere, Codex inserts, clone glitch, Shor-9 |
| lights_out | 2834–3026 | black; the syndrome chord twice |
| payoff | 3026–3410 | "Morning check: perfect!" on the slam · curtain call (push-out) |
| closing_musicbox + silence | 3410–3698 | still morning under the Motion alpha card "It's just a game…", **held continuously until the snap** |
| snap / circuit | 3698–3986 | **snap** to `circuit_morph` · "…where you accidentally learned quantum error correction." |
| end_card | 3986–4240 | `end_card` |

6 text events (cap 7): the REVISED list. Dropped against the Critic's §2.5: "Look, and one dream is gone." (the Motion title_peek leaves 76 frames of black, too short to read it) and the proof labels. Both are open questions for the Critic.

**Mechanic** (157 s; Critic §5 table): cold open → rule (1-1 PEEK, X-ray) → threat → can't copy (encoding) → ask, don't look (2-1 at 10 s + the 4-row syndrome graphic) → repair (2-3 night + Test all) → proof (X-ray replay + Bloch) → twist (3-1 SPIN sandwich) → under the hood (circuit morph + Qiskit stamp) → close (the staged closing line) → end card. Strip captions are "= real term" glosses only; Schrödi's lines are the narration.

**Showcase** (226 s; Critic §6): 4×4 all-levels grid → title peek → dream map → chapters 1–4 behind blanket wipes, with hero levels at 1→4× speed ramps (1-1, 2-3, 3-1, 3-3 Wobbles, 4-1 Shor-9), the 11 others as 0.6 s 6× strobes, wow beats (clone glitch, map flip, Lights Out by ear) → Gremlin Lab + threshold → Codex + Card Guide → Notebook → QoL 2×2 quick-fire → save-data joke → curtain call → closing → end card.

## Shot sources
`plans.py` resolves each shot id in order: `tools/video/edl/shot_sources.json` (aliases to real files) → `videos/capture/<id>.*` → `videos/motion/<id>.*` → `videos/final/work/precomp/<id>.*` → placeholder. `python3 tools/video/edl/plans.py --registry` prints every shot with what it must show. That list is the request list for the Capture Engineer and the Motion Designer.
