# NO PEEKING! Video Bible (Director)

Three deliverables, produced to a **high-production standard**. Perfection over speed.

| File | Length | Purpose |
|---|---|---|
| `videos/final/trailer.mp4` | 80 s | Cinematic, thriller-paced trailer: anticipation, drop, montage, payoff |
| `videos/final/mechanic.mp4` | ~2:30 | The core mechanic, clearly explained (hackathon requirement), with the cool features woven in |
| `videos/final/showcase.mp4` | ~4:00 | Every feature and every level (solutions, sped up), as a feature tour |

Output spec: **1920×1080, 60 fps, H.264 High profile, CRF 14–16, yuv420p, +faststart, AAC 320 kbps 48 kHz stereo**, plus a 2560×1440 master of the trailer. Loudness −14 LUFS integrated, true peak ≤ −1 dBTP.

## 1. Why the first cut failed (and the fix)
| Problem | Fix |
|---|---|
| Soft, jittery, low-bitrate picture (browser screen recording) | **Deterministic frame capture**: a virtual-time shim (rAF, performance.now, Date.now, setTimeout/setInterval) driven by the recorder; each frame screenshotted losslessly at deviceScaleFactor 2 (3840×2160), then downscaled with lanczos to the delivery size. Perfectly smooth 60 fps, frame-exact. |
| Only the background music was audible | Full mix: a **cinematic score** + **every on-screen game SFX** (rendered from the game's own audio engine at the exact frames where the event happens, using the capture's event log) + Qubblese voices under dialogue + trailer sound design (risers, impacts, whooshes on transitions). Ducking under SFX and voices. |
| Flat purple slides | **Motion-designed cards and transitions** in the game's visual language, rendered frame-by-frame (see §4). |
| Captions overlapping the dialogue box | Captions live in a **reserved safe zone**, computed per shot from the live DOM bounding boxes of the dialogue, editor and controls. An automated check fails the render if any caption intersects them. During b-roll the game's dialogue box is hidden. |
| Only the task was shown | Shot lists below include every showpiece feature. |
| Lullaby loop as trailer music | A dedicated **trailer cue** composed for this edit (§3), built from the game's motif but arranged cinematically. |

## 2. Global timing grid (all agents)
- **UPDATE (Director): the trailer is cut to a downloaded song (personal use only, not shared) chosen by the Music Supervisor.** Its `videos/music/cue_sheet.json` (BPM, beat/downbeat frames, sections, hits) is the **source of truth** for trailer timing and replaces the provisional 96 BPM grid below. The section names in §3 map onto the cue sheet's sections. The Composer and Sound Designer layers SFX and sound design on top of the song, and keeps an original-score alternate.
- Trailer tempo **96 BPM**: beat = 0.625 s, bar = 2.5 s (= 150 frames at 60 fps; a beat is 37.5 frames, so cuts land on the half-frame-safe beat: round to the nearest frame).
- Frame 0 = the first frame of the trailer. A cut "on a beat" means within ±1 frame of the grid.
- The editor works from an **EDL JSON** (`tools/video/edl/*.json`): a list of `{ shot, in, out, start_frame, transition, transition_frames, caption?, sfx_cues[] }`.

## 3. Trailer structure (80 s = 32 bars at 96 BPM)
| Bars | Time | Picture | Sound |
|---|---|---|---|
| 1–3 | 0:00–0:07.5 | Cold open in darkness. Extreme close-up of a blanketed Qubble breathing, lit only by the moon through the window. A whisper card fades in: *"Something is dreaming."* | Near silence, a low sub pulse like a heartbeat, a music-box note detuned in reverb, room tone |
| 4–6 | 0:07.5–0:15 | *"One rule."* Then the title screen: the cursor drifts toward a letter-Qubble. The hover peek collapses it, with a **shatter transition** on the hit at 0:15. | Ticking clock enters; a reversed-cymbal riser into a **hard impact plus peek_collapse SFX** |
| 7–12 | 0:15–0:30 | Night falls over the daycare (day→night lighting). Gremlins sneak in as silhouettes (Flipper, Phasey, Wobbles), with quick dark cuts. Cards: *"Gremlins flip bits."* / *"Ghosts flip phases."* / *"You can't look."* | Pulsing ostinato, pizzicato tiptoe, rising tension, a gremlin_flip stinger, a ghost whoosh; the build peaks with a **1-beat silence at 0:29.4** |
| 13 | 0:30 | **DROP: logo reveal.** The NO PEEKING! letters land as Qubbles that collapse into the wordmark (a motion-designed sequence), with a flash and particles | Big impact plus the full groove with the game's motif on lead |
| 13–22 | 0:30–0:55 | **Feature montage, cut on beats:** caretaker tiptoes and BOOPs → bots roll and HIGHFIVE (sparks) → LISTEN, BEEP! → Schrödi hops out for his checklist → **X-ray transition** (the blanket goes translucent as the transition itself) → Test strip filling ✓✓✓ → Codex 3D Bloch sphere spin → Lab Notebook "cards morph into gates" → Qiskit export scroll → the dream map fly-over → Lights Out (screen goes black; only the bots' syndrome chord is heard) | Each cut lands with its real SFX (boop, highfive, listen_beep, …) on the beat; whooshes on transitions |
| 23–25 | 0:55–1:02.5 | Stutter build, one per beat: *"Find the error."* / *"Fix it."* / *"Never see it."*, intercut with the decoder program lighting up | Riser, snare roll, filter sweep |
| 26 | 1:02.5 | **Payoff:** "Morning check: perfect!" with stars bursting, then the credits curtain call (Qubbles wake, gremlins bow, Schrödi steps out) | level_win fanfare, re-orchestrated big |
| 27–30 | 1:05–1:15 | *"It's just a game…"* (hold, near silence), then *"…where you accidentally learned quantum error correction."* | A music-box motif alone, then a warm swell |
| 31–32 | 1:15–1:20 | End card: animated logo, *quriosity 2026 · Option 06*, *play: nitheesh-me.github.io/no-peeking* | Final chord with a sub tail |

Honesty: on-screen claims are limited to what is true (a real state-vector simulator, real gates, verified levels).

## 4. Visual language for cards and transitions
- **No flat gradient slides.** Cards are set inside the game world: the night sky with the sleeping moon, paper notebook pages, the daycare wall, or full-bleed gameplay with a soft vignette and depth blur.
- **Typography:** Quantum (display) for titles with letter-by-letter "collapse" animation (each letter is a Qubble that pops into the glyph); Quicksand for lines; subtle ink outline and glow consistent with the game.
- **Transition catalog** (each is deterministic and keyed to beats):
  - **Blanket wipe:** a quilt sweeps across the frame.
  - **Collapse shatter:** the frame splits into Sunny/Moony shards.
  - **X-ray dissolve:** the blankets go translucent, revealing the next shot.
  - **Card flip:** a Bot Code card flips to reveal the next scene.
  - **Iris through a Qubble.**
  - **Glitch tear:** the clone-glitch look, used once at the drop.
  - **Bloch-sphere portal:** zoom into the sphere and out into the next shot.
- **Codex as a b-roll source:** the Codex detail panels render every character, gremlin, prop and card in isolation on a clean background, with every pose and action (caretaker actions, the Schrödi actor, gremlin poses, the bot's high-five/listen/lights, the Qubble states and the 3D Bloch sphere, the data-box flip with tumble). Use them for crisp hero shots and montage inserts, framed full-bleed with the panel chrome cropped out.
- Light **camera moves on gameplay** (slow push-ins and pans on the 4K capture), so footage is never static.
- Grade: a slight warm lift by day, deep blue at night, consistent across shots; subtle film grain and vignette on cards only.

## 5. Mechanic video (~2:30)
1. Cold open (5 s): a Qubble breathing; "You may never look."
2. **The rule:** 1-1, PEEK → collapse → X-ray reveal of what was lost. Caption: "Looking changes it."
3. **Asking instead of looking:** 2-1, a bot high-fives two Qubbles, LISTEN gives a BEEP. Caption: "A bot can ask: do these two match? It never learns what either dreams."
4. **The repair:** 2-3, a full night (Schrödi's checklist encodes; the gremlin strikes in darkness; the bots ask; the caretaker fixes). Then **Test all**, with every night ✓, then the **X-ray replay** of one night (actually clicked this time), with the inspector's 3D Bloch sphere showing the shared dream.
5. **The twist:** 3-1, the phase ghost is invisible to bit checks; the SPIN sandwich fix.
6. **Under the hood (cool features):** Card Guide anatomy for IF, the Lab Notebook's circuit page plus Qiskit export, the Codex Bloch sphere measure demo.
7. Closing: *"It's just a game… where you accidentally learned quantum error correction."* plus the end card.

## 6. Showcase (~4:00)
Title peek beat → dream map → all 16 levels solved (sped up, with level-title wipes) → meta beats (clone glitch on 1-3, map flip, Lights Out by ear) → Gremlin Lab and Night Shift → the Night Lab threshold chart → Codex tour (silhouettes → unlock toast → interactive entries) → the Lab Notebook pages in X-ray → snippets, doodle comments, help slot → step mode and timeline → settings and fullscreen → the credits curtain call → the closing line.

## 7. QA gates (automated; the render fails if any gate fails)
1. **Cut timing:** ffmpeg scene detection (`scdet`) on the trailer; every detected cut is within ±1 frame of an EDL cut, and every EDL cut marked `on_beat` is within ±1 frame of the 96 BPM grid.
2. **Audio–video sync:** every `sfx_cue` in the mix is within ±1 frame of the matching capture event-log timestamp.
3. **Caption safety:** the captured DOM boxes of captions never intersect the dialogue, editor, controls or toasts (checked per frame range). Minimum on-screen time is 1.6 s plus 40 ms per character.
4. **Picture:** no black frames except intentional ones (`blackdetect` against the EDL), no frozen frames longer than 0.5 s unless they're intentional holds (`freezedetect`), and no letterbox errors.
5. **Loudness:** −14 LUFS ±0.5 integrated and true peak ≤ −1 dBTP (`ebur128`), with SFX audible (each cue ≥ 6 LU above the bed at its moment).
6. **Fidelity:** the delivered 1080p is downscaled from the 4K capture; spot-check sharpness (variance of the Laplacian) against the old cut's frames.
7. A **contact sheet** plus 10 full-res stills per video, reviewed by the Director before final sign-off.

## 8. Ownership
| Area | Owner |
|---|---|
| `tools/video/capture/` (virtual-time capture, scene scripts, event log, caption safe-zone data), the raw 4K frame sequences in `videos/capture/` | **Capture Engineer** |
| `tools/video/motion/` (cards, logo reveal, transitions as deterministic HTML/canvas/three.js animations rendered through the capture tool), `videos/motion/` | **Motion Designer** |
| `tools/video/audio/` (trailer cue composition, SFX rendering from event logs, voices, mixing, mastering), `videos/audio2/` | **Composer & Sound Designer** |
| `tools/video/edl/`, `tools/video/assemble/` (compositing, camera moves, grade, encode), `tools/video/qa/` (all gates), `videos/final/` | **Editor & QA** |
| This bible, sign-off | Director |

---
## REVISED (Director, after docs/VIDEO_CRITIQUE.md): these decisions override §3–§7 where they conflict
All 10 of the Critic's top changes are **accepted**. Read docs/VIDEO_CRITIQUE.md for details; the binding decisions are:

1. **Cinema capture layout.** A capture-only game mode, `?cinema=1` (flag-gated, zero effect otherwise; built by the Capture Engineer in the classic code). The scene canvas fills the whole viewport at DPR 2. The editor, toolbar, top bar and dialogue are hidden. All judge, debug and "STAGE" watermarks and badges are hidden. All trailer footage uses it. Push-ins are capped at 1.8× (1080p) and 1.4× (1440p master); the QA gate fails any shot that upscales beyond its source resolution.
2. **The trailer tells the hook as a story.** Section intents, mapped onto the song's cue-sheet sections (the timing comes from `videos/music/cue_sheet.json`, target ~70 s):
   - **cold_open**: a blanketed Qubble breathing in moonlight. Card: *"Every Qubble dreams two dreams at once."*
   - **peek** (early, ~0:07): the cursor peeks a title letter-Qubble, which collapses on a hit (the signature sound, #4). The collapse shatter is used once here.
   - **build**: night falls (in-place relight); gremlin silhouettes; *"Gremlins flip bits."* / *"Ghosts flip phases."* / *"You can't look."*
   - **silence**: 2 beats of true silence, then a single dry bot **BEEP**. The drop hits after it ("the beep is the rescue").
   - **drop**: the logo reveal (letters land as Qubbles and pop into the wordmark), with the glitch tear used once here.
   - **proof** (4 bars right after the drop, one room, in order): a gremlin flips q2 and only its blanket twitches → the bots answer BEEP and quiet → the caretaker BOOPs q2 without lifting the blanket → an X-ray dissolve (rendered by the game) shows the dream intact.
   - **montage** (hard cuts on beats, with real SFX on each): Schrödi's checklist; HIGHFIVE sparks; LISTEN beeps; the Test strip filling ✓; Lights Out (black screen, chord); the dream map; the 3D Bloch inspector; Codex hero inserts (isolated animations).
   - **payoff** (~0:50): "Morning check: perfect!" stars, then the credits curtain call bow.
   - **closing**: *"It's just a game…"* over a cosy morning shot; then a hard cut with a snap to the player's program morphing into a real quantum circuit (the Lab Notebook circuit reveal) under *"…where you accidentally learned quantum error correction."*
   - **end_card**: the animated logo, quriosity 2026 · Option 06, the play URL.
   Cut entirely: the "One rule." card, the Find/Fix/Never-see stutter, the Qiskit scroll, the Codex grid.
3. **Transitions:** ≥80% hard cuts on the beat. Allowed: the shatter (once), the glitch (once), game-rendered X-ray dissolves, the in-place day→night relight, and blanket wipes (showcase only). **Removed:** card flip, iris, Bloch portal.
4. **Sound:** the **peek-collapse is the signature**, used 3×: the cold-open impact, the title letters collapsing on 8ths (pitched), and the snap before the closing line. Every featured SFX gets a sub thump + a 2–4 kHz presence layer, and the music gets sidechain-style dips under SFX so they stay audible (each cue ≥ 6 LU above the music at its moment). The song is the bed; the sound designer layers on top and keeps an original-score alternate.
5. **Mechanic and showcase captions:** the game sits at the top at 88% scale, with a **fixed bottom 12% caption strip**. Schrödi's in-game lines are the narration; captions only add short "= real term" glosses. There are never two texts competing.
6. **Mechanic video** follows the Critic's §5 timing table:
   - add the "you can't copy a dream" beat;
   - add the **4-row syndrome graphic** (two bots, four answers, each pointing at one Qubble);
   - 2-1 compressed to ~10 s;
   - the Card Guide and Codex tours move to the showcase.
7. **Showcase** follows the Critic's "whole career in 4 minutes":
   - it opens on a 4×4 grid of all 16 levels solving at once;
   - 5 hero levels get ~12 s each, and the other 11 get one beat each;
   - the energy changes every 20–30 s;
   - the QoL features are one split-screen quick-fire;
   - no settings screen.
8. **QA additions:**
   - human checks: a blocking "what do you do in this game?" test with the Critic as proxy; muted, audio-only and phone-speaker passes;
   - legibility and contrast: reading time counted from full legibility; text contrast measured on the actual pixels;
   - clean frames: no debug, watermark or badge;
   - every visible event has a sound;
   - no banding at night (add dither or grain);
   - platform re-encode review;
   - intentional flashes and dissolves marked in the EDL for the cut gate.
9. **The Critic reviews every milestone** (the capture samples, motion tests, the music edit plus sound design, the rough cut, the final) before sign-off.
