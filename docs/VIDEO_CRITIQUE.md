# NO PEEKING! Video Critique (The Critic)

Reviewed: `docs/VIDEO_BIBLE.md`, the old cut's contact sheets (`trail_sheet.png`, `mech_sheet.png`), README, DESIGN_BIBLE §2/§7, and the screenshots in `.scratch/shots/` and `/tmp/codex-*.png`.
Every note below says what is weak, why, and what to do instead.

---

## 1. Verdict on the plan

The bible fixes the old cut's *technical* failures well (deterministic capture, a real SFX mix, the caption gate). But it carries over the old cut's *editorial* failure: a trailer that lists things rather than telling a story. The montage at bars 13–22 is eleven features in 25 seconds, and none of them shows the one idea a stranger needs: **something broke under a blanket, a robot beeped, and you fixed it without looking.** If a viewer walks away with only one sentence, it has to be that one. As written, they walk away with "cute game with a Bloch sphere and a Qiskit button".

**The single biggest risk is framing, not music or transitions.** The old contact sheet shows the full app UI at 1080p: the diorama fills about 35% of the frame, and the code editor is a wall of illegible coloured bars. The game's strongest asset is the diorama (`room3z.png` by day, `room3n.png` by night, and the curtain-call line-up in `cred_1280_36.png`), and it has to *fill the frame*. The bible's "4K capture + push-ins" does not solve this. The scene canvas caps DPR at 2 (`src/engine/scene.ts:116`), so inside the normal play layout the room is only about 1,800 px wide even at DSF 2, and cropping to it is an *upscale* for 1080p. It is worse for the 1440p master. Without a stage-only "cinema" capture layout, the new cut will be sharper but just as small, and it will feel as cheap.

---

## 2. Trailer structure, bar by bar

### 2.1 Is the cold open earned? Is 80 s too long?
- **30 seconds before the drop is too long** for this audience (judges scrolling through 40 submissions, plus social autoplay). Bars 1–12 contain three separate "intro" ideas (dreaming, one rule, gremlins), each with its own card. That is three openings.
- **"Something is dreaming."** is a vague horror-movie line that teaches nothing. A whisper card has to do two jobs at once: set the mood and set up the rule. Replace it with **"Every Qubble dreams two dreams at once."** It is honest (superposition), it is cute, and it gives the peek something to destroy.
- The cold open is *earned* only if it ends in a consequence. As written, the first collapse comes at 0:15. Move it to **0:07.5**: the first impact is the first rule being broken.
- **80 s → 70 s (28 bars).** Cut the duplicated set-up and the stutter section, not the payoff.

### 2.2 Does the montage show the hook to a non-quantum viewer?
**No.** The causal chain (gremlin strikes → bots beep → caretaker fixes the right one → X-ray proves the dream survived) never appears in order. Its pieces are spread across the montage as unrelated features (BOOP, HIGHFIVE, LISTEN, X-ray). A stranger cannot rebuild cause and effect from shuffled shots.
**Fix:** before the montage, give the hook its own **4-bar "proof" sequence in one continuous location**: the same room, the same Qubble (q2), shot in order, one bar per step (see §2.5, bars 10–13). It is the trailer's mini-story. Everything after it is "and there's more".

### 2.3 "It's just a game… where you accidentally learned quantum error correction."
Two black title cards with text on them is the weakest possible staging, and the old cut already did exactly that (`trail_sheet.png`, last panels). It *claims* the twist instead of showing it.
**Stage it as a reveal:**
1. "It's just a game…" is set **in the world**, over a cosy, nearly still morning shot of the daycare: Qubbles snoring, Schrödi blinks once. The music drops to a lone music box. Hold 2 beats of near-silence.
2. Hard cut on the downbeat, with a dry "snap" (the `snap_measure` SFX plus a paper whip): the **same program the kid just ran**, shown as the Lab Notebook's real circuit (CNOTs, the red X error, the syndrome readout) filling the frame. The second half of the line, "…where you accidentally learned quantum error correction.", sets in under it.

The joke only works if the second half arrives as *evidence*: cute world, then a textbook circuit. The README's best line ("That is quantum error correction. You just did it by accident.") deserves that visual proof.

### 2.4 Money shots vs filler

| Shot | Verdict | Why |
|---|---|---|
| Moonlit blanket close-up, breathing | **Money** | Mood, and it carries the rule |
| PEEK collapse (flashlight beam → swirl pops to one pole) | **Money** | The signature event of the game. Show it twice: the cold open and the title gag |
| Title letters collapsing on hover | **Money** | Pure Baba energy. Sync each collapse to an 8th note so the letters *play the motif* |
| Day → night, same framing (`room3z` → `room3n`), moon rising | **Money** | The prettiest asset in the game. Do it as an in-place relight, never as a cut |
| Gremlin silhouettes | Money if short | 1 beat each. The longer they're held, the more they read as clip art |
| BEEP + caretaker BOOPs the right Qubble | **Money** | This *is* the hook |
| X-ray dissolve showing the dream intact | **Money** | The payoff of the hook, and it doubles as a transition |
| Lights Out (black screen, syndrome chord) | **Money** | The only shot where *sound* is the picture. Hold a full bar; it is the montage's breath |
| Schrödi popping out of his box | Good | Character beat. 1 beat |
| Test strip ✓✓✓ | Good | Reads as "verified" at a glance, but only if it fills the frame |
| Curtain call (cast line-up, gremlins bow) | **Money** | The only shot with everyone in it. Crop out the "Built with" panels |
| Codex 3D Bloch sphere spin | Filler as UI | `codex-all.png` is a flat card grid. Use it only as a full-frame sphere with a Qubble's swirl colours, or cut it |
| Lab Notebook "cards morph into gates" | Money **only** as a bespoke motion piece | Captured raw, it is a small panel with a debug bar (`nb_circuit.png`). Save it for the payoff (§2.3), not the montage |
| Qiskit export scroll | **Filler** | Scrolling code is unreadable at montage speed, and nobody outside quantum cares. Turn it into a stamped label, "Exports to Qiskit", on the circuit shot |
| Dream-map fly-over | Filler unless Flipper hits it | The *flipped tile + blinking map bots* beat is the interesting part; a plain fly-over is not |
| Full-UI wide shots of the editor | **Cut from the trailer** | Illegible coloured bars; they read as a spreadsheet |

### 2.5 Proposed structure: 28 bars = 70.0 s at 96 BPM (bar = 2.5 s, beat = 0.625 s = 37.5 frames)

| Bars | Time | Picture | Sound |
|---|---|---|---|
| 1–2 | 0:00.0–0:05.0 | Black → moonlit close-up of a blanket breathing (slow push, 1.0→1.15). Card at 0:01.25 (b1 beat 3): **"Every Qubble dreams two dreams at once."** Hold until 0:04.4 | Room tone, heartbeat sub on beats 1 and 1-and, detuned music-box motif fragment (4 notes) |
| 3 | 0:05.0–0:07.5 | Flashlight beam creeps across the floor toward the blanket (the PEEK). Ticking clock as 8ths | Reversed cymbal from 0:05.6, peaking at 0:07.5 |
| 4 | **0:07.5** | **COLLAPSE.** The swirl snaps to one pole; Sunny/Moony shard shatter (its only use); 2-frame white flash; then black. Card at 0:08.75: **"Look, and one dream is gone."** | Hard impact = sub drop + noise burst + layered `peek_collapse`; 1.25 s reverb tail into silence |
| 5 | 0:10.0–0:12.5 | Title-screen register: the cursor sweeps the letters and each one collapses on an 8th note | Each collapse is the peek SFX pitched to a note of the motif; the title *plays the theme* |
| 6–8 | 0:12.5–0:20.0 | b6: in-place relight day → night (the moon rises). b7: Flipper, Phasey and Wobbles as silhouettes, 1 beat each, plus a beat of empty door. b8: **"You can't look."** set over the dark room, blankets only | Pizzicato ostinato, braam swells on b7, `gremlin_flip` / `ghost_phase` / `wobble` stingers on their beats, rising Shepard riser |
| 9 | 0:20.0–0:22.5 | Card on black: **"So ask."** at 0:20.0; from 0:21.25 the screen goes black | Everything cuts at 0:21.25 (2 beats of silence, room tone at −60 dBFS). At **0:21.875** a single bot **BEEP**, dry and close |
| 10 | **0:22.5** | **DROP.** The bot's antenna flashes red, full frame. The glitch tear (its only use) resolves into the game's daylight palette | Full groove; the motif on lead; the BEEP becomes the lead's first note |
| 10–13 | 0:22.5–0:32.5 | **Proof sequence, one room, one bar each:** (10) in darkness, a gremlin flips q2: only its blanket twitches. (11) Bots HIGHFIVE and LISTEN: one **BEEP**, one quiet. Label: **"Something's wrong with #2."** (12) The caretaker walks to q2 and BOOPs it, blanket untouched. Label: **"Fix it blind."** (13) **X-ray dissolve:** the blankets go translucent, the dreams are intact, the fidelity meter fills to ✓ | Real SFX on the beat: `gremlin_flip`, `highfive`, `listen_beep` (bot note) + `listen_quiet`, `boop`, then the X-ray shimmer and `test_pass` |
| 14–19 | 0:32.5–0:47.5 | **Montage, accelerating:** b14–15 one shot per bar (Schrödi's checklist, the Phasey twist with SPIN cards), b16–17 one shot per half-bar (Test strip ✓✓✓, Flipper hits the map, the clone glitch, the Shor-9 room), b18 one shot per beat (4 hero gremlin/bot reactions). **b19: Lights Out**, black for a full bar | SFX on every cut; the groove thins at b19 to just the syndrome chord, played twice |
| 20–21 | 0:47.5–0:52.5 | Snap back to full light: the Test strip runs all nights, then the **"Morning check: perfect!"** stars burst on the b21 downbeat | Snare roll + filter sweep (b20) → `level_win` reharmonised big on b21 |
| 22–23 | 0:52.5–0:57.5 | Curtain call: the Qubbles wake, the gremlins bow, Schrödi steps out (cropped to the stage, no panels). Slow push-out | Groove resolves; fanfare tail |
| 24–25 | 0:57.5–1:02.5 | **"It's just a game…"** over a still morning daycare. Schrödi blinks on b25 beat 1 | Music box alone, then 2 beats of silence |
| 26 | **1:02.5** | Hard cut, with a snap: the real circuit (bespoke card→gate morph). **"…where you accidentally learned quantum error correction."** | Dry snap, then a warm major-7 swell (the game's "high fidelity" chord) |
| 27–28 | 1:05.0–1:10.0 | End card: the logo letters assemble *uncollapsed* (all swirling), then settle. *quriosity 2026 · Option 06* / *Play free in your browser* / the URL | Final chord, sub tail, one last snore at 1:09 |

Cut from the bible's plan: the "One rule." card (the peek *is* the rule), the stutter build "Find the error / Fix it / Never see it" (three cards in a row stalls the momentum just before the payoff, and the proof sequence already says it), the Qiskit scroll, and the Codex grid.

---

## 3. Music and sound

### 3.1 What the cue needs
- **Contrast, not genre.** "Thriller-cute" means a *cute instrument playing in an ominous context*: a celesta/music-box motif in **D major** over a **D minor/Phrygian drone** (the Eb rubs against the D). The melody stays innocent; the harmony underneath lies. When the drop comes, the harmony finally agrees with the melody. That is the emotional release.
- **One signature sound used as a motif:** `peek_collapse`. Use it three times, the way a trailer uses a "braam": the cold-open impact (b4), the title gag pitched as notes (b5), and as the transient of the final snap (b26). The bot BEEP is the *answer* motif: the last sound before the drop and the first note of the groove. Danger (peek) against salvation (beep) is the whole game in two sounds.
- **Silence is an instrument.** Use two real silences: the reverb tail into black at b4, and the 2-beat gap at b9 that only the BEEP breaks. Keep room tone at about −60 dBFS so it reads as *held breath* rather than a dropout. Do not fill the silence with a riser; the riser ends *before* the silence.

### 3.2 Arrangement notes (all synthesisable)
- **Heartbeat sub (b1–4):** sine 58→38 Hz pitch drop over 120 ms, a 2-hit "lub-dub" (beat 1 and the 16th after), lowpass at 120 Hz. Speed up subtly by moving it to beats 1 and 3 in b3.
- **Music box:** FM bell (carrier:modulator 1:3.5, fast decay, index 2→0), slight random detune ±12 cents per note, lots of pre-delay plate reverb. For the "ominous" version, add a copy 1 octave down at −18 dB, detuned −25 cents.
- **Ticking clock:** short bandpassed noise clicks at 3.2 kHz on 8ths, alternating tick/tock pitch ±200 Hz.
- **Pizzicato ostinato (b6–9):** Karplus–Strong pluck, D–F–A–Bb pattern in 8ths, filter opening across 4 bars.
- **Braam (b7, b9):** 6 detuned saws (±15 cents) + a sub sine, lowpass sweeping 200 Hz→2 kHz over 1 bar, slow attack, hard cut.
- **Risers:** a Shepard tone (5 octave-spaced sines under a bell-curve amplitude, gliding up) plus noise through a bandpass sweeping 300 Hz→8 kHz. Every riser **stops dead** half a beat before the hit.
- **Impacts:** three layers: sub drop (sine 80→30 Hz, 600 ms), a transient (a 10 ms noise click with a 40 ms body), and a tail (noise into a 3 s dark reverb). Layer the game SFX on top as the "character".
- **Drop groove (b10–23):** synth toms (pitched-down sine with pitch envelope) on 1 and 3-and; claps from layered noise bursts on 2 and 4; finger-snap ticks; a bass that walks D–A–Bb–C; the game's motif on a square-ish lead with vibrato. Brighter and wider than the lullaby, the same melody.
- **Lights Out (b19):** strip everything except a low pad and the **syndrome chord** (the bots' pentatonic notes). Play it twice: the second time with one note different, as if the error moved. Sound designers will love it.
- **Ending:** a major-7 swell (D–F#–A–C#) as the "fidelity = 1" chord the game already uses, then a sub tail and one Qubble snore.

### 3.3 SFX mix rules
- The game's SFX are designed as small UI sounds; on their own they **will vanish** under a trailer bed again. Give every featured SFX a *sweetener*: a sub thump (≤ 80 Hz, 60 ms) and a short room reverb, and boost 2–4 kHz by 3 dB.
- Carve a 2–5 kHz dip (−4 dB, sidechained) into the score bus whenever an SFX or a Qubblese voice plays, rather than relying on broadband ducking alone.
- Qubblese voices: *only* in the mechanic and showcase videos, never under the trailer groove. Gibberish under a groove reads as mud.

---

## 4. Visuals and transitions

### 4.1 Framing (fix this first)
- Add a **capture-only cinema layout**: the stage canvas fills a 1920×1080 viewport at DSF 2 (a 3840×2160 backing store), and the editor, toolbar and dialogue are hidden. All trailer b-roll comes from this layout.
- **Push-in limits:** ≤ 1.8× for 1080p delivery and ≤ 1.4× for the 1440p master. Anything beyond that is an upscale. Add a gate for it (§7).
- The full UI appears in the trailer **at most once**, deliberately: the kid's program running beside the room, for 1 bar, with a camera move so the cards are big enough to read.

### 4.2 Transitions likely to look cheap
| Transition | Risk | Decision |
|---|---|---|
| Collapse shatter | Generic Voronoi shards read as a 2009 After Effects preset | **Keep once (b4).** Shards must be the *Sunny/Moony swirl itself* breaking along the swirl's spiral, with motion blur, 10–14 frames, followed by black, not the next shot |
| Glitch tear | Glitches are the most overused trailer cliché | **Keep once (the drop).** Only 6 frames, RGB split in Sunny/Moony/Phasey colours, matching the clone-glitch look from 1-3 |
| Card flip | Looks like PowerPoint | **Cut** |
| Iris through a Qubble | Looks like a 1990s cartoon wipe | **Cut** (or use it as the final frame of the end card only) |
| Bloch-sphere portal | A 3D fly-through on an ill-fitting sphere looks amateur and costs days | **Cut** |
| Blanket wipe | Cheap if it's a flat textured rectangle | **Priority 2.** Use the game's quilt pattern, with a curved leading edge, a cast shadow and 12 px of soft fold displacement, eased in-out-cubic over 18 frames. Use it for chapter changes in the showcase |
| X-ray dissolve | Low risk: the game already renders it | **Priority 1.** Render it *in-engine* (the blanket alpha 1→0.2 plus the silk threads appearing), never as a crossfade between two clips |

**Rule: at least 80% of trailer cuts are hard cuts on the beat.** A transition on every cut is the surest sign of amateur editing. Budget: 1 shatter, 1 glitch, 2 X-ray dissolves, 1 in-place relight, and the rest hard cuts.

### 4.3 Typography
- The trailer has **at most 7 text events**, each ≤ 7 words except the closing line.
- Display (Quantum): cap height ≥ 7% of the frame height (≥ 76 px at 1080). Lines (Quicksand Bold): ≥ 52 px. Never use Quicksand Regular over gameplay.
- The letter-collapse type animation lasts **≤ 18 frames for the whole word**, staggered by 2 frames per letter. Anything longer eats reading time, and the gag wears out by the second card.
- Text over night shots: paper `#f2f0eb` with a 2 px ink outline and a soft 20 px dark glow. Text over day shots: ink `#0e0e0e` on a paper torn-note plate. Never use coloured text on a coloured background.

### 4.4 Caption placement
- **Trailer:** text sits in a full-frame card moment *or* in the top third over cinema-layout b-roll. With the dialogue hidden in that layout, overlap is impossible by construction.
- **Mechanic and showcase:** reject per-shot dynamic placement. Captions that jump from bottom-left to top-right between shots make the eye hunt, and the old cut already felt cluttered. Instead, composite the game at **88% scale into the top of the frame** and keep a **fixed caption band in the bottom 12%** on a paper strip. The caption is always in the same place, never overlaps, and needs no DOM gate (keep the gate anyway as a safety net).

### 4.5 Grade
- The night grade must survive 8-bit yuv420p. Moonlit gradients **will band**. Add 1–2% luma grain or ordered dither *before* the encode, and check for banding on a calibrated display and on a phone.

---

## 5. Mechanic video (~2:30)

Problems with the bible's §5:
- **No-cloning/encoding is never explained**, yet step 4 starts with "Schrödi's checklist encodes". A beginner doesn't know why you can't just keep a copy. One sentence fixes this: "You can't copy a dream. You can only *share* it across three Qubbles."
- **The syndrome table, the actual "ohhh", is missing.** Two bots give four answers, and each answer points at one Qubble. It needs a clean 4-row graphic (quiet/quiet = nobody; beep/quiet = #1; beep/beep = #2; quiet/beep = #3) whose rows light up in sync with the bots' antennae.
- **Captions and Schrödi's dialogue compete.** The old sheet shows both at once, so the viewer has to read two texts. Choose one: **Schrödi's in-game lines are the narration** (with a slow push-in so his box is readable), and captions are used *only* as "real term" labels, e.g. "= measurement", "= parity check", "= syndrome".
- **Step 6 is three UI tours in a row** (Card Guide, Notebook, Codex). The Card Guide is a help dialog (`guide-if.png`) and makes dull video. Move it to the showcase.
- The 2-1 → 2-3 jump repeats the HIGHFIVE explanation. Fold 2-1 into a single 10-second beat.

Re-cut with exact timings:

| Time | Beat | Content |
|---|---|---|
| 0:00–0:06 | Cold open | Moonlit blanket. "Every Qubble dreams two dreams at once." |
| 0:06–0:24 | The rule | 1-1: PEEK → collapse → X-ray shows the lost half. Label: "= measurement collapses a superposition" |
| 0:24–0:38 | The threat | Lights out, a gremlin strikes, one blanket twitches. "One dream changed. Which one? You can't look." |
| 0:38–0:50 | Can't copy | Schrödi's checklist: HIGHFIVEs share the dream across 3 Qubbles (the silk threads in X-ray). Label: "= encoding (no copies allowed)" |
| 0:50–1:15 | Ask, don't look | Bot HIGHFIVEs two Qubbles, LISTEN → BEEP. "Do these two match?" Then the **syndrome table graphic**. Label: "= parity check, syndrome" |
| 1:15–1:38 | The repair | 2-3 full night: IF a BEEP and b QUIET → BOOP q1, with the caretaker walking to it. Then **Test all**, the strip filling ✓ |
| 1:38–1:52 | The proof | X-ray replay of one night, with the Bloch sphere showing the shared dream survived. "The bots never learned the dream." |
| 1:52–2:08 | The twist | 3-1: Phasey's swirl flip, every bot quiet but the dream wrong. A SPIN sandwich turns it into a flip the bots can catch. Label: "= phase-flip code (Hadamard basis)" |
| 2:08–2:22 | Under the hood | Cards morph into the circuit (the same bespoke piece as the trailer) → a 2 s Qiskit export stamp → "a real state-vector simulator, real gates" |
| 2:22–2:30 | Close | The closing line, staged as in §2.3, then the end card |

---

## 6. Showcase (~4:00)

The risk is real: §6 is a 13-item list read out in order, which makes it a settings menu with music. Fixes:
- **Give it a spine:** "One caretaker's whole career in 4 minutes": chapters 1→5 in order, with every feature appearing *where the player first meets it*, not in a separate "features" block.
- **The 16 levels:** a 4-second **4×4 grid of all 16 levels solving at the same time** as the opener money shot. Then **5 hero levels** at 4–6× speed (1-1, 2-3, 3-1, Wobbles, Shor-9), each ≤ 12 s with a 1 s blanket-wipe title. The other 11 appear as a 1-beat strobe sequence. Sixteen sped-up solves at equal length is the most boring possible minute.
- **Energy changes every 20–30 s:** alternate a *watch* segment (a level playing) with a *wow* segment (a meta beat: the clone glitch, the map flip, Lights Out by ear). Never put two UI tours back to back.
- **Bundle the quality-of-life features** (snippets, doodle comments, help slot, step mode/timeline) into one 15-second **quick-fire split screen** with 4 panels and a label each. **Settings and fullscreen: cut** (1 s at most, as the "save data protected by a 3-qubit repetition code ✓" joke, which is worth keeping).
- **The threshold chart** needs a one-line takeaway ("Codes only help when noise is rare: below p = ½") and an animated curve draw, or it is dead air.
- Music: a 3-section cue (cosy → night → triumphant) tied to chapters, *not* the 80 s trailer cue looped.

---

## 7. Quality gates: what's missing

1. **Fresh-eyes test (blocking):** show the trailer once to 2–3 people who know nothing about quantum. Ask: "What do you do in this game?" Pass = they say some version of "fix things without looking at them". If they say "programming puzzle" or "quantum something", the hook failed. Re-cut.
2. **Muted test:** watch with the sound off. The story must still read from picture and text (most social autoplay is muted).
3. **Audio-only test:** listen with the screen off. You should still hear the peek, the silence, the beep, the drop and the payoff.
4. **Small-speaker test:** play it on a phone speaker and on laptop speakers. Every featured SFX must still be audible. Also check mono compatibility (fold-down cancellation from stereo widening).
5. **Reading time:** max(1.2 s, 0.3 s per word + 0.4 s) from when the text is fully legible (after its animation ends), not from its first frame. The bible's "1.6 s + 40 ms per character" over-allocates for short trailer cards and under-allocates for words that arrive mid-animation.
6. **Contrast:** text contrast ≥ 4.5:1 against the *actual underlying pixels* (sample the frame behind the glyph boxes), checked per text event.
7. **Minimum effective font size:** no visible game UI text below 18 px at 1080 in the trailer (catches illegible full-UI wides).
8. **Shot rhythm:** a shot-length histogram per section, a monotonic acceleration through bars 14–18, no shot < 12 frames except flash frames, and no more than 3 consecutive shots of identical length outside the beat-strobe.
9. **Upscale guard:** the effective scale factor per shot (capture px / delivered px) must be ≥ 1.0. Fail on any push-in that upscales.
10. **Clean-frame check:** no debug bars (the `nb_circuit.png` capture shows "night / step / X-ray / lights out / unlock all / pulseUnlock" controls plus a "STAGE" watermark), no "judge mode" badges (`codex-all.png`: "33/33 found · judge mode"), no cursor unless scripted, no hover artefacts, no browser chrome.
11. **Inverse SFX gate:** every visible event in the capture log (boop, beep, flip, collapse, win) has a sound in the mix. The bible only checks the reverse direction.
12. **Banding check** on night shots after the final encode, and a **re-encode check**: upload a private copy to YouTube/Drive and review *that*, since platform re-encoding is what judges will actually see.
13. **Thumbnail/first-frame:** pick a deliberate poster frame (the collapse or the curtain call), and make sure the first 3 seconds are not black-only. Autoplay previews start at frame 0.
14. **Gate brittleness:** `scdet` will flag the flashes and Lights Out as cuts, and miss the in-engine dissolves. Mark intentional flashes and dissolves in the EDL and exempt them, or the gate will produce false failures and get ignored.

---

## 8. Prioritised top-10 changes

1. **Add a stage-only cinema capture layout** (the canvas fills the viewport at DSF 2, with the editor, toolbar and dialogue hidden) for all trailer b-roll, cap push-ins at 1.8× for 1080p and 1.4× for 1440p, and add an upscale gate. Without it, the new cut will be small and soft again.
2. **Insert a 4-bar "proof sequence" (bars 10–13)** right after the drop: one room, one Qubble, in order (gremlin flips under the blanket → BEEP/quiet → caretaker BOOPs q2 blind → X-ray dissolve shows it intact). This is the hook. Without it, the trailer is a feature list.
3. **Cut the trailer to 70 s (28 bars) using the §2.5 table:** collapse at 0:07.5, drop at 0:22.5, payoff at 0:50, the line at 0:57.5–1:05. Remove the "One rule." card, the stutter build, the Qiskit scroll and the Codex grid.
4. **Make the drop trigger the bot's BEEP:** 2 beats of true silence at 0:21.25, a single dry BEEP at 0:21.875, and the groove at 0:22.5, with the BEEP becoming the lead's first note. Peek (danger) against beep (rescue) becomes the cue's motif system.
5. **Use `peek_collapse` as the signature motif three times** (the cold-open impact, the title letters pitched to the melody, the final snap), and sweeten every featured game SFX with a sub thump, a 2–4 kHz lift and a sidechained 2–5 kHz dip in the score.
6. **Restage the closing line as evidence:** "It's just a game…" over a still, cosy morning shot, then a hard cut with a snap to the kid's program as a real circuit (a bespoke card→gate morph) under "…where you accidentally learned quantum error correction."
7. **Restrict transitions:** at least 80% hard cuts; one shatter (b4), one glitch (the drop), in-engine X-ray dissolves, an in-place day→night relight, and blanket wipes in the showcase only. Cut card flip, iris and the Bloch portal.
8. **Fix captions in the mechanic and showcase videos with a fixed bottom-12% band** (the game composited at 88%), and use Schrödi's in-game lines as the narration, with captions only as "= real term" labels. Never show two texts at once.
9. **Re-cut the mechanic video to the §5 timing table:** add the no-copy/encoding beat and the 4-row syndrome-table graphic, fold 2-1 into 10 s, and move the Card Guide and Codex tours to the showcase.
10. **Add human and perceptual QA gates:** a fresh-eyes "what do you do?" test (blocking), muted, audio-only and phone-speaker passes, reading time measured from full legibility, contrast against the real background pixels, a clean-frame check (no debug bar, "STAGE" watermark or judge-mode badge), an inverse SFX gate, banding, and a review of the platform re-encode.

---

## Milestone: music edit (`videos/music/trailer_edit.wav`, `cue_sheet.json`, `docs/VIDEO_MUSIC.md`)

**What I reviewed:** the cue sheet and edit log, the candidate plots in `videos/music/analysis/`, my own RMS and spectral-centroid pass over the edit (every 0.5 s), and a meter check on the 155 `detected_hits`.

### Verdict
The *skeleton* is right, and the frame engineering is excellent. Every named hit sits on a downbeat (f434 k12, f1394 k42, f2930 k90, f3026 k93, f3794 k117). The BEEP at f1362 is the upbeat into the drop. Both silences are true digital zero. The *energy curve*, though, is wrong for this trailer, and **the track cannot ship**. In order of severity:

1. **Licence (blocking).** The doc itself says "personal use only, must not be distributed". A hackathon submission linked from the README is distribution, and a YouTube upload would get a Content ID claim or a mute. So what the judges hear will be the Composer's original-score alternate, and this edit is a **temp track**. The real danger is *temp love*: the team tunes the picture to Rok Nardin's production, and the synthesized replacement then sounds like a downgrade. **Decide today which track ships.** The good news: "Twinkle Twinkle" / "Ah ! vous dirai-je, maman" is public domain. **The Composer can legally write an original lullaby-epic arrangement of the same melody**, keep the concept, and fix the flaws below at the same time. Treat this edit as a timing and structure reference only.
2. **The 33.6 s plateau.** From the drop (f1394) to the end of the payoff (f3410), the bed sits at −18 ± 2 dB RMS with a spectral centroid stuck at about 2.1 kHz. That is one continuous source span (101.6–135.2 s) with no internal dynamics (see the A6Y82YjXMhU plot: a flat brick from 100 s to 138 s). Consequences:
   - The **payoff "slam" at f3026 is only a return to the same level** (−16.9 dB against a montage average of about −18). It is not a peak. The only shape in 34 s is the 1.6 s Lights Out dip.
   - The **proof sequence (the hook) plays under a full orchestra** whose energy sits in the 1–4 kHz band where the BEEP, the quiet and the BOOP live. The cute SFX will be masked; a broadband 4–6 dB duck will not save them.
3. **The build doesn't build.** From f810 to f1140 the level is flat at −25/−26 dB. Then it **falls 7 dB** at the pre-drop-riser splice (f1170: −33 dB) before climbing again. Energy that steps down right before a drop is anti-tension.
4. **The drop is barely bigger than the build's swells.** The drop averages −19 dB. That is about 6.5 dB over the build *average* (about −25.5 dB), but only 1–2 dB over the build's own peaks (f810 −21 dB, f1260 −20 dB). The viewer has already heard "this loud" twice before the drop, and the silence is doing all the work. Keep the build's peaks ≥ 4 dB under the drop.
5. **The peek hit is a melody restart, not a consequence.** At f434 the second music-box phrase simply enters (+24 dB after the decay, which is good), and then carries on twinkling sweetly for 3 bars as if nothing happened. After the first rule is broken, the lullaby should sound *damaged*.

### Lullaby-epic vs the runner-up
**Lullaby-epic is the right call**, and Twinkle beats Hush Little Baby:
- Twinkle is about a star at night, so it matches the moon, the sleeping Qubbles and the night shift. Hush has a lead vocal (feat. Brian Skeel), which fights the on-screen text and the Qubblese, and it is darker.
- Hush does have better *dynamics*: impacts and pockets every 5–10 s (see its plot). Its 31 ms tempo drift (about 2 frames at 60 fps) would have been workable by cutting to onsets. So the runner-up's real advantage is shape, not tempo.

The fix is to give Twinkle Hush's shape: automate the filter and level in the edit now, and write it into the original arrangement.

### Is 3/4 a problem?
**No, if the cut pattern respects the meter; and it can be an asset.** The meter check confirms a true waltz: hit strength on k%3==0 is 35.1, against 11.6 and 9.8 on the other two beats. A mod-4 fit is flat. The beat is 32 frames, which is perfect, but the bar is 1.6 s, not the 2.5 s in my §2.5 plan, so three rules change:
- **There is no "half-bar".** Half a bar is 1.5 beats, which falls off the grid. Delete "one shot per half-bar" from the montage plan.
- **The acceleration ladder is 96 → 64 → 32 frames:** downbeat cuts (1.6 s), then **hemiola cuts every 2 beats** (3 cuts across 2 bars, the classic epic-orchestral 3-against-2 that makes the cutting feel like it is pulling against the music before it locks back in), then every beat (0.53 s).
- Never cut on beat 2 alone. The weak-beat cut is the one that will feel "off" to viewers who can't say why.

### Section lengths vs picture
| Section | Now | Problem | Change |
|---|---|---|---|
| cold_open | f0–434 (7.2 s) | Fine. The music box decays to −47 dB into the hit, which makes the viewer lean in | Keep. Add the heartbeat sub under it |
| peek | f434–722 (3 bars) | The lullaby continues unharmed | **Detune phrase 2:** pitch wow ±30 cents at 0.7 Hz, −6 dB, plus a tape-stop dip on the f434 transient. The impact layer (sub drop + `peek_collapse`) on f434 comes from the Sound Designer |
| build | f722–1298 (6 bars) | Flat, then a 7 dB hole at f1170 | Automate a **low-pass sweep from 900 Hz to fully open** across all 6 bars, and a **level ramp from −6 dB to 0**. Overlap the build tail under the riser head by 1 bar (equal-power), so f1170 never drops below −26 dB. Hold the whole build ≥ 6 dB under the drop |
| silence | f1298–1394 | Correct | Tune the BEEP (f1362) to the drop's tonic (or its 5th), so it reads as the drop's pickup note |
| drop | f1394–1586 (2 bars) | Fine | Add a layered impact on f1394 |
| proof | f1586–1970 (4 bars = 1.6 s per step) | **Too short.** A stranger cannot read "gremlin flips → BEEP/quiet → walk + BOOP → X-ray + meter fill" at 1.6 s a step, and "Something's wrong with #2." alone needs about 1.9 s after its animation | **Extend to 6 bars, f1586–2162, with steps of 1/2/1/2 bars:** flip (f1586), bots ask + label (f1682), BOOP (f1874), X-ray reveal (f1970). **Duck the bed to a "submerged" mix** (low-pass at 1.2 kHz, −6 dB) so the SFX lead. This is a picture/EDL change only; the plateau is uniform, so no music splice is needed |
| montage | f1970–2930 (10 bars) | Over-long once the proof grows; flat energy | **f2162–2834 (7 bars):** 3 downbeat cuts, 2 hemiola bars (3 cuts), 2 bars of beat cuts (6 cuts) = 12 shots. **Open the filter fully at f2162**: that is the second lift after the drop |
| lights_out | f2930–3026 (1 bar) | 1.6 s of black is too short for the syndrome chord to be heard twice, and that pocket is the montage's breath | **f2834–3026 (2 bars).** Keep the 300 Hz low-pass. A reversed cymbal from f2930 lands on f3026 |
| payoff | f3026–3410 (4 bars) | Same level as the montage | Ride the montage bed −2 dB so the payoff is the loudest moment. Layer the reorchestrated `level_win` + cymbal on f3026 |
| closing music box | f3410–3698 (9 beats) + silence to f3794 | 6.4 s for a 4-word line; the pause goes slack | **Cut to 6 beats (one phrase, ending on the held "star" note), f3410–3602.** Let it decay naturally into the 3-beat silence (f3602–3698) |
| circuit reveal | f3794–3986 (2 bars) | 3.2 s for a 7-word line *plus* a circuit to take in | Snap at **f3698**, reveal for **3 bars (f3698–3986)** |
| end_card | f3986–4336 | Fine | Keep, and end at about f4240. The total drops 96 frames, to **70.7 s** |

### Concrete changes (owner: Music Supervisor / Composer, then the EDL)
1. **Decide which track ships: an original public-domain Twinkle arrangement**, synthesized, built on this cue sheet. Use the Rok Nardin edit only as the temp. Do not lock the picture to its production details.
2. **Section frames:** proof f1586–2162, montage f2162–2834, lights_out f2834–3026, closing music box f3410–3602, silence f3602–3698, snap and circuit f3698–3986, end card f3986–4240. Every boundary stays on k%3==0.
3. **Energy automation** (it becomes an arrangement directive for the original): low-pass + level ramp on the build, the 1-bar overlap at f1170, the submerged proof bed, the filter opening at f2162, the montage −2 dB, payoff peaks.
4. **Detune and wow the post-peek music box** (f434–722).
5. **Tune the BEEP to the drop's tonic.** Replace the broadband duck with a sidechained 2–5 kHz dynamic-EQ dip (−6 dB) under every featured SFX.
6. **Montage cut ladder in 3/4:** 96 → 64 (hemiola) → 32 frames. No half-bar cuts, and no isolated beat-2 cuts.
7. **Gate:** re-run the RMS curve after the changes. Require: the build rises monotonically (per-bar RMS non-decreasing, ±1 dB); drop ≥ build average + 6 dB and ≥ build peak + 4 dB; payoff ≥ montage average + 2 dB; proof bed ≥ 6 dB under the montage.

---

## Milestone: music v2

**Verdict: approved for the personal cut. All seven craft changes landed, and I checked them against the WAV and `gate_v2.json`, not only the doc.**

- **Landed:**
  - All 13 section frames match my table, and every boundary is on a downbeat.
  - The build now rises bar by bar (−37 → −23 dB).
  - The drop is +11.7 dB over the build average and +4.6 dB over its peak.
  - The payoff is +5.0 dB over the montage, so it is now the loudest section (−14.8 dB).
  - Lights Out has its 2 bars, with the reversed cymbal from f2930.
  - Both silences are digital zero. The only samples in them are the 10 ms splice pre-rolls at f1393 and f3697: inaudible and sub-frame.
- **Proof bed −8.5 dB instead of −6: accept.** The gate is what mattered: it is 6.3 dB under the montage. *Condition:* this leaves a 10.6 dB fall from the drop into the proof, so the proof's energy has to come from the SFX. Every featured cue in f1586–2162 (flip, BEEP/quiet, BOOP, X-ray shimmer) should peak around −14 dB short-term in the final mix, louder than the bed was in the drop. Otherwise the trailer deflates right after its biggest moment. Add this to the mix QA.
- **Closing phrase "lit-tle star" (A A G, ending on the held G): accept, and it is better than my note.** In C it ends on the dominant: a half-cadence, an unanswered question under "It's just a game…". The snap and final chord then resolve it. *Small catch:* it fades to zero at about f3580, not f3602, so the real silence is about 2.0 s (118 frames) rather than 1.6 s. That is the upper limit of a held breath. Either let the G ring to f3602 or keep it, but have the Editor time "It's just a game…" to hold until the snap.
- **BEEP tuned to C5: accept.** It is the tonic one octave above the C4 pickup, so it reads as the drop's first note.
- **0.3 s breath dip before f1170: accept.** It is the source's own inhale (about 6 dB, shorter than a beat), the per-bar curve still rises, and a breath before the final riser is musical, not a hole. My objection was to the 7 dB *drop that lasted a bar* in v1.
- **Nit:** the WAV is 4,243 frames, but the cue sheet says 4,240. Trim the file (or update `duration_frames`) so the Editor's assembly length check doesn't flag it.
- **Public alternate:** the Sound Designer's public-domain arrangement must pass the **same `gate_v2` thresholds**, with the same named hits. Run the gate script on it before the Director listens.

---

## Milestone: sound design (`docs/VIDEO_SOUND.md`, `videos/audio2/`)

**What I measured:** I checked the Editor-EDL mixes (`test/editor_trailer_{song,public}`) frame by frame, per stem; the mix reports; key estimates per section (Krumhansl) on both beds; and the energy shape of both beds full-range and with a 300 Hz high-pass (a phone-speaker proxy).

**Verdict:** the engineering is first-rate:
- frame-exact placement;
- the inverse-SFX log;
- band-only ducking with a solver;
- peak-to-loudness (PLR) control;
- both silences hold at room tone (about −47 dBFS peak) with only the BEEP in them.

The *taste* layer, though, has four real problems: one harmonic clash, one weak punchline, one over-stacked hit, and a public score whose drop disappears on small speakers.

1. **Key clash on the payoff (song cut).** The song's payoff estimates as **F minor** (r 0.77), and so does the drop (0.61). The cue sheet's own `drop_harmony` note says the same. `level_win_big` stacks **C-major** brass stabs on it, so E clashes against F and G against Ab, at the loudest moment of the trailer. → For the song bed (`only_with`), use a third-less version: F + C power stabs, the timpani tuned to F, the crash and the sparkle, with the game's win arpeggio dropped or its 3rd lowered to Ab. Keep the C-major version for the public score (which is C major in every section).
2. **The motif's bookends are 10 LU apart.** Measured loudness: `sig_a` at f434 is −10.6 LUFS-M, and **`sig_c_snap` at f3698 is −21.0 LUFS-M**, the quietest featured cue in the trailer, and it is the punchline after the closing silence. Both are built from a stack (the snap+whip+click+thump+clap stack and the sub drop+plate stack) in which the peek "pop" is just one layer. A motif reads when the *same* gesture is exposed each time. → Make the pop the loudest layer in the 1–4 kHz band in all three variants. Tune it consistently: sig_a pop ends on C4, the letters carry the melody, and sig_c pop lands on **C5**, the same pitch as the BEEP, so it closes the loop "peek = danger, beep = answer, snap = resolution". Bring sig_c to **about −13 LUFS-M**.
3. **f434 is over-stacked.** At the same frame the mix has: the game's `peek_collapse` + `sig_a` (which already contains `peek_collapse` twice) + `shatter_whoosh_shards` + `riser_peek_revcymbal` + the score's tape-stop. That is three copies of the peek, probably different seeded variants, which risks a flam or chorus. → Add `suppress_game: peek_collapse` within 0.5 s of f434 (as was done for the BEEP). Drop the shard scatter to −10 dB as a high-frequency tail, *after* the transient (+3 frames). The reversed cymbal is enough of a whoosh.
4. **The cliché pile.** Heartbeat + 8th-note ticking + reversed cymbal all appear before the peek (f50–434). The build then adds ticks + braam + crickets/owl + a Shepard riser, and on the public cut the score *also* plays a wood-block clock and a heartbeat in the build. → Each device appears in one section only:
   - **heartbeat:** cold open only;
   - **ticking:** build only (it is the room's wall clock, so it is diegetic), and on the public cut either the design tick or the score's wood-block, never both;
   - **reversed cymbal:** 2 beats into f434, plus the Lights Out bar;
   - **braam:** once, at the build lift;
   - **owl:** cut (it's the stock "night" sample cliché; keep the crickets, with a high-pass and −3 dB, because they share the 3 kHz band with the ticks).
5. **Lights Out is being filled.** `snare_roll_1bar` is end-aligned to f3026, so it plays **f2930–3026**, the same bar as the reversed cymbal, inside the "black screen, only the syndrome chord" pocket. → Cut the roll, or keep only its last 2 beats (f2962–3026) at −6 dB. The pocket's power comes from emptiness.
6. **The public score's drop vanishes on phones.** Full-range, the gate passes (drop +6.8 dB over the build peak by my per-bar measurement). But **75% of the drop's energy is below 120 Hz** (the song: 44%), and almost nothing is above 4 kHz. With a 300 Hz high-pass, the score's drop is only **+4.5 dB over the build peak** (the song: +11.8), and **3 dB quieter in absolute terms** than the song's drop. The payoff holds up (+5.2 dB over the montage on the high-passed signal). An oom-pah-pah with brushes is a waltz, not an epic. → In the drop: −3 dB on the sub kicks; add the `level_win_big` saw-brass stabs on beats 1 and 2-and, a crash on f1394, shaker/hat 8ths, and phrase A an octave up on a bright pluck. **Add a high-pass-300 variant of `music_gate`**: drop ≥ build peak + 6 dB on the high-passed signal too.
7. **The proof SFX at −15.7 LUFS-S: accept, but the metric is wrong.** A 3 s short-term window averages sparse transients against near-silence. The per-cue numbers are what matter, and they are healthy: gremlin_flip −12.4, highfive −14.7, BEEP −13.1, boop −15.7, test_pass −9.8 LUFS-M, all 19–25 LU over the bed. → Replace the gate with **per-featured-cue momentary ≥ −16 LUFS-M**. One exception: the **QUIET answer (f1770) is −18.4 LUFS-M with a 7.1 LU margin**. "One beeps, one stays quiet" is the hook's information, so the quiet needs to be *heard as a deliberate non-beep*. Raise it to about −16 LUFS-M (a soft marimba "dum" is fine), and keep it ≥ 4 LU under the BEEP.
8. **Reporting bugs:**
   - In `editor_trailer_public/mixreport.json`, `beep_tuned_C5` reports **−200.7 LUFS-M / margin 99**. The audio is fine (it peaks at −2 dBFS at f1362/f1368, measured), but the gate measured against the gated music and returned a placeholder pass. Fix it, so a genuinely missing BEEP would fail.
   - The public cut plays **both** `riser_drop_2bar` groups (−8 dB and 0 dB) at the same time; `drop_riser` needs an `only_with: song`.
   - The song bed reaches digital zero at about f3580, but room tone only starts at f3602, so there is a 22-frame dropout followed by hiss. Start the room tone where the bed hits zero.
9. **Got right, keep:** the C5 BEEP (the tonic in the public score, the 5th in the song's F-minor drop), sig_b's 10 notes pitch-verified and resolving on C, Qubblese off in the trailer, the 2–5 kHz ducking, and the final snore.

**Public vs song energy shape:** it is convincing in shape (the build rises bar by bar, the payoff is the loudest section, and the proof sits 7.5 dB down), but not in *weight* (item 6). Once the drop has mid and high energy, the public cut will stand on its own; until then, it is a cosy waltz with a loud sub.

---

## Milestone: trailer song cut (`videos/final/trailer.mp4`, 70.67 s)

**What I reviewed:**
- the contact sheet and the 10 stills;
- my own frame grids: the title peek f330–460 every 16 frames, the build every 32, the Wobbles beat every 16, the proof every 24, the montage every 16, and full frames at f360, f725, f2900, f3700;
- per-second ebur128 on the delivered AAC;
- the EDL caption list.

### Verdict: **FIX**
The craft is now real: the picture is crisp, every cut is on the beat, the silences are true silences, and the end of the trailer is excellent. The closing (paper "It's just a game…" → the notebook cards → the circuit with "Flipper flips q2") is the best 15 seconds the team has made.

But two of the user's four explicit asks fail on screen, and the hook still isn't communicated:
- **Ask 1, Wobbles: FAIL.** In the build's Wobbles beat (f1106–1298), Wobbles is **not visible in a single frame**: lights out hides the gremlins, and the caption icon is a *Qubble*, not Wobbles. Flipper and Phasey have the same problem: three captions about gremlins over empty dark rooms. Wobbles appears only in the 32-frame Codex portrait (T024, 0.53 s).
- **Ask 2, programming emphasised: PARTIAL.**
  - The proof split-screen is legible at 1080p (still 08: card text cap height about 20 px), but the causal link is weak: a thin outline and a small red triangle in a 15-line column, about 1,000 px away from the actor.
  - The six programming montage cuts are **full-UI wide shots that look like the same frame six times** (T017, T021, T023, T025, T027). Drag, IF anatomy, test strip, scrub, snippets/doodle and export are *present* but not *shown*.
- **Ask 3, energy and beat-cutting: PARTIAL.** Every hard cut is on the beat, and the shot ladder is 96 → 64 → 32 frames. But the **full mix inverts the anticipation**:
  - the title-letters section is the loudest moment of the first half (short-term −11.0 LUFS at 12 s, momentary −10.8);
  - the build sits at short-term −13 to −15;
  - the drop at f1394 only reaches short-term −16 to −13.

  The music-bed gate passes, but the *mix* curve is what people hear.
- **Ask 4, closing line: PASS.** It is staged exactly as intended.
- **The hook:** nothing in the trailer says *you can't look* or *you fix it without looking*. "One rule" and "Look, and one dream is gone" were cut, and the proof has no labels. Only the title "NO PEEKING!" carries the rule.

### Ranked fixes
| # | Timecode | Owner | Exact fix |
|---|---|---|---|
| 1 | build f722–1298 (T005–T008) | **Capture Engineer → Editor** | Recapture the three gremlin beats so that **the gremlin is on screen**: use the X-ray replay of that night (the bible: "in the X-ray replay you see exactly what they did"), punched in 1.5× on the gremlin and its target Qubble. Flipper flipping a dream, Phasey's swirl twist, **Wobbles' jelly wobble tipping the Qubble's swirl halfway**. Start each clip *after* lights out, so the room doesn't pump day→night three times (currently each beat re-plays the relight). Replace each caption icon with **that gremlin's sprite** (the Codex art). |
| 2 | f1586–2162 (proof) | **Motion Designer + Editor** | Make "card → action" unmissable. (a) Scroll-follow window: crop the program column to the 6–7 cards around the current line at 1.4× (from the 4K capture, so no upscale). (b) On each event-log action, the current card pops to 1.12× with a glow in its own colour (6 frames), and **a ring of the same colour pulses on the acting character** in the room on the same frame; for the first two actions only, add a thin animated connector from card to actor. (c) Hide the in-game Schrödi dialogue box (visible bottom-left from about f1990). (d) **Clear cap05 "You don't play it. You program it." by f1586**: it currently covers the room until about f1700. |
| 3 | f1586–2162 + T003/T004 | **Editor (captions)** | Put the hook in words, using 3 short captions in the top third. "**Look… and it's gone.**" on T003/T004 (f454–594). "**Something's wrong with #2.**" on the BEEP/BEEP result in the proof. "**Fix it. Never look.**" on the BOOP q2. Without these, the fresh-eyes check fails (below). |
| 4 | montage f2162–2834 (T017, T019, T021, T023, T025, T027) | **Editor** (camera keyframes); Capture Engineer only if a source was captured at DSF 1 | **Punch in to 2.0×** on the feature region of each programming cut (native from the 3840 capture): the hand dragging the card into the slot; the IF anatomy diagram (numbered callouts); the ✓✓✓ test strip row; the timeline scrubber hitting the measurement "snap"; the snippet drawer + doodle; the Qiskit text. Replace T026's grey timeline view with the notebook's **Circuit page** (gates, the red X). Each cut must be recognisable in a 0.5 s thumbnail. |
| 5 | f530–722 and f1394–1586 | **Sound Designer** | Fix the inverted mix arc: sig_b title letters −5 dB, the build's SFX stingers −3 dB, `impact_logo` +2 dB, and no ducking of the bed during the logo reveal. Add a full-mix gate: **max short-term over f1394–1646 ≥ max short-term before f1298 + 2 LU**, and the drop's momentary peak is the highest before the payoff. |
| 6 | f2834–3026 (T029–T030) | **Capture Engineer** (or Editor mask) | The white **"the end. zzz"** sleep-talk bubble in the Lights Out black (concern e) reads as "THE END" at 47 s. Disable idle speech bubbles for that capture, or mask it. Only the two red bot lights may be visible. |
| 7 | f330–434 (title_peek) | **Capture Engineer** | Concern (a): the cursor is not a stray, it *is* the peek (it reaches P at about f426), but it wanders up from the bottom-left for about 1.5 s like a forgotten system pointer. Start it near the letters, and give it one eased glide (≤ 40 frames) onto P, using the game's own cursor (or a 1.5× pointer). The P's collapse must be visible ≥ 8 frames before the shatter at f434. |
| 8 | f3698–3986 | **Motion Designer** | Concern (c): 2.70 s passes my rule (0.3 s × 7 words + 0.4 = 2.5 s, counted from full legibility), so it is not a blocker. But it is the punchline: bring the card→circuit morph forward about 30 frames, so cap07 is fully legible by about f3790 and holds ≥ 3.2 s. |
| 9 | whole mix | **Sound Designer** | Concern (d): −1.0 dBTP is in spec, but this is a lossy AAC that YouTube/Drive will re-encode (inter-sample overshoot). Set the limiter ceiling to **−1.5 dBTP** and re-measure the *encoded* file. |

**Concern (f), sharpness: PASS.** The full frames (f725, still 08) are clean line art with no ringing and no mush. The Laplacian is low because the old cut was over-sharpened and these frames have large flat areas. Fidelity 0.99, and 88% retained after re-encode. Do not add sharpening.

### The 4 human checks (my best judgement; the user should still do the phone check)
1. **Fresh eyes ("what do you do in this game?"): FAIL as cut.** Predicted answer: "you program little robots to look after sleeping blobs; something quantum". "**Without looking**" is missing, because the rule is never stated, the gremlins are invisible, and the proof has no labels. Fixes 1–3 address it.
2. **Muted: FAIL-ish.** The captions carry superposition, "program it" and the closing line, but they ask the viewer to believe in gremlins they can't see, and they never state the rule. Fixes 1 and 3.
3. **Audio only: PASS after fix 5.** Music box → collapse → silence → lone BEEP → drop → Lights Out chord → payoff → silence → snap → chord tells the story. As cut, the title letters upstage the drop.
4. **Phone speaker: probable PASS, unverified.** The SFX are presence-lifted, the BEEP (C5) and the letters sit at 400 Hz–3 kHz, and the song's drop keeps mid energy (44% below 120 Hz). The risks are the sub-only heartbeat (it has a 2nd harmonic) and the impacts. **The user must play it once on a phone** before sign-off.

**Re-review scope:** after fixes 1–7, I only need a new contact sheet, the frame grids of f722–1298 and f1586–2834, a full frame at f2900, and the per-second loudness. Fixes 8–9 are polish.

---

## Milestone: trailer song cut, re-review

**What I checked:**
- the new contact sheet;
- frame grids of f722–1298 (every 32 frames), f1586–2162 (every 24), f2066–2161 (every 12) and f2834–3026 (every 12, plus every 3 around the flashes);
- per-frame luma (signalstats) over Lights Out;
- full frames at f520, f940, f1230, f2040, f2900;
- the stems in 16-frame windows over the title letters;
- per-bar build loudness, and the phone-sim WAV per section.

### Verdict: **FIX (one blocker, then polish)**
This round fixed nearly everything, and the trailer now *tells the story*:
- **Gremlins:** Flipper zapping q2, Phasey's swirl twist and Wobbles' half-tipped q2 are all clearly on screen (f940 and f1230 are lovely), each with its own sprite.
- **Proof:** the drag of BOOP into fix2, the cards popping in sync, the ✓ on the true IF, and the "It's #2." / "Fix it. Never look." labels make cause and effect readable.
- **Montage:** the punch-ins finally show each feature.
- **Mix:** the drop is now the peak.

But one new defect is a blocker, and an old one came back in a new place.

### Ranked fixes
| # | Timecode | Owner | Exact fix |
|---|---|---|---|
| 1 **BLOCKER** | **f2914–2930 and f3010–3026** (end of T031 and of its repeat T032) | **Editor** | The Lights Out source runs past the level's end. The last 16 frames of *each* 96-frame copy are **the bright daytime room with a growing orange/purple win-orb** (luma about 190 against about 26). That is two white flashes inside the "black, only the bots' lights" pocket, and the second lands right on the payoff downbeat. This also explains concern (b): the "yes! jump →" text lives in those frames. Fix: use one *continuous* 192-frame dark range from `mn_lights_out` that ends before lights-up (source lights up at about in+80 = 1736, so in ≤ 1543, after verifying the source is dark from there), not the same 96 frames twice. **Add a QA gate:** every clip flagged `intentional_black` must have mean luma below 40 on every frame. The picture gate passed this. |
| 2 | **f2066–2090** (proof, T018) | **Capture Engineer** (or an Editor mask) | **"the end. zzz" is back**, this time as the caretaker's speech bubble after END, right under "Fix it. Never look.". Disable the caretaker/Qubble idle speech bubbles in *all* trailer captures (check `nope, next ›` at about f1990 too), or mask them. |
| 3 | f2114–2162 (proof beat 6) | **Capture Engineer → Editor** | The promised **"X-ray intact"** beat is not in the cut. The blankets stay opaque and the confetti plays (T018's "XRAY-DISSOLVE" is only the transition *into* the shot). Put the last 36–48 frames on the X-ray replay of the same night: blankets translucent, q2's dream restored, the silk threads visible, with the "X-ray · simulator view" tag. That is the payoff of "Never look." |
| 4 | f818–1298 (gremlin captions) | **Motion Designer** | Concern (a): the overlap fix is genuine *for UI*. cap07's plate is clean; "Look… and it's gone." sits on pure black (f454–530); "It's #2." and "Fix it. Never look." sit on the wall; the X-ray tag (top right) touches nothing. But the gate does not know about *scene* sprites. The bottom gremlin captions run **over bot b and the q-chips**: q3's chip pokes up between "…" and "HALFWAY" at f1230, and bot b's head sits under "Ghosts" at f940. → Move these three captions to the **top-left wall** (empty in all three shots), or add a bottom gradient plate (black at 45%, 25% of the frame height). Add the q/a/b chips and character boxes to the caption gate's exclusion set. |
| 5 | f1010–1106 (build bar 4) | **Sound Designer** | Concern (c), the build: per-bar mix RMS is −24.9 / −20.2 / −20.1 / **−21.6** / −17.4 / −17.1 dB. That is a 7.8 dB rise with a 1.5 dB sag at the Phasey→Wobbles bar. The −22 → −14 target was mine and it was too aggressive: ending the build at −14 would leave the drop (−11.2 short-term) only 3 LU of headroom. **Accept the current range.** Just fill bar 4 (+1.5 dB, or start the drop riser there) so the curve is monotonic. Polish. |
| 6 | f1586 | **Editor** (check) | In my grid, frame 1586 shows the old full-UI layout for one frame before the split-screen crop. Confirm it is not a 1-frame flash of the uncropped capture. |

**Concern (c), title letters: not lost.** The analysis files them under *design*, not *sfx*. In the 1.5–5 kHz band the design stem sits **15–28 dB above the music** for every letter window from f536 to f700. They are clearly audible.

**Concern (d), true peak:** −1.8 / −2.0 dBTP: good.

### Human checks (my judgement)
1. **Fresh eyes: PASS (once fix 1 is done).** The expected answer is now "you program little robots to find which sleeping blob got messed with and fix it **without looking**". The rule card, the visible gremlins, "It's #2." and "Fix it. Never look." deliver it.
2. **Muted: PASS.** The captions alone now carry rule → threat → method → fix → punchline.
3. **Audio-only: PASS.** Music box → collapse → letters → rising build → silence → lone BEEP → drop (the peak) → Lights Out chord → payoff → silence → snap → chord. Fix 1 also removes the two flash moments, which are visual only.
4. **Phone (sim): PASS.** Section RMS: build −24.3 → drop −17.6 (+6.7 dB), payoff −17.8, proof −22.5 (intentionally submerged). The BEEP and the snap survive. The user should still do one real-phone listen.

**After fixes 1–3, this is a PASS from me.** Fixes 4–6 are polish and don't need another full review: a contact sheet plus the luma check over f2834–3026 will do.

---

## Milestone: trailer song cut: sign-off

**What I checked:**
- signalstats on all 192 frames of f2834–3025;
- frame grids of f1580–1592, f2050–2161 (every 14 frames), f818–1297 (every 48) and f1586–2066 (every 40);
- the QA table.

### Verdict: **PASS, pending the X-ray tag**

| Fix | Status | Evidence |
|---|---|---|
| 1. Lights Out | **Fixed** | The worst frame averages 26.3 in limited-range luma (11.4 full-range); the peak is 107 (the two red bot lights). No flash, no bubble, no "yes! jump". The `dark` gate guards it. |
| 2. Speech bubbles | **Fixed** | No "the end. zzz" or "nope, next" anywhere in f1586–2161. |
| 3. X-ray payoff | **Fixed** | From about f2120 the blankets go translucent with q2 restored. The proof now ends on the proof. |
| 4. Gremlin captions | **Fixed** | Top-left on a dark plate, clear of every sprite and chip. Flipper, Phasey and Wobbles all read. |
| 5. Build bar 4 | Accepted | per the report (monotonic) |
| 6. f1586 | **Fixed** | f1586 is the split-screen. The cut is clean. |

**What the tag needs (send me one still at about f2140, plus one at about f2080):**
- **Contrast** ≥ 4.5:1 against its plate. Sitting clear of the "Fix it. Never look." box *and* of the q-chips, bots and caretaker.
- **Honesty:** the "X-ray · simulator view" tag must appear **only on the frames that actually show X-ray** (about f2114–2162). The f2066–2113 frames are normal view with opaque blankets, so labelling them "simulator view" would be wrong. If the tag currently spans f2066–2162, trim it to start on the X-ray cut.
- Same type size and style as the tags on the gremlin beats.

**Polish (not blocking):** f1580–1585, the end of cap05 "You don't play it. You program it.". The text fades faster than its grey paper plate, leaving an **empty grey box for about 3–4 frames**. Fade the plate with the text (or 2 frames ahead of it). If the Editor is already re-rendering that area, take this in the same pass; otherwise, ship it.

**Human checks:** unchanged from the re-review. Fresh eyes, muted, audio-only and phone-sim all PASS. The user's one real-phone listen is the only open item.

**Final tag check: PASS.**
- **f2140:** the "X-ray · simulator view" tag is legible on its dark plate, sits bottom-left clear of every sprite, chip and caption, and appears only on the X-ray frames.
- **f2080:** normal view, no tag. That is honest.
- **Nit, not blocking:** this tag is slightly larger than the top-right tags on the gremlin shots. Accept it.

**The trailer song cut is signed off by the Critic.** The only open item is the user's single real-phone listen.

---

## Milestone: mechanic plan (`docs/VIDEO_EDIT.md` "Mechanic plan", `mechanic.edl.json`)

**What I reviewed:**
- the plan and the EDL caption list (25 text items);
- source stills at the planned action frames: me_21_listen src 872, me_23_drag 235, me_31_phase 949;
- `mo_syndrome_table` at +700.

### Verdict: **CHANGES**
The plan is good, and much better prepared than the trailer was. The teaching order is right (rule → threat → can't copy → ask → syndrome → write → run → test → X-ray proof → twist → export → close). The syndrome table is the best explainer graphic in the project. The trailer's lessons are built into the validators.

But there are **two physics/teaching errors**, one honesty leak, and the programming hero moment is the *shortest* beat in the video.

### Ranked changes
| # | Beat / timecode | Owner | Exact change |
|---|---|---|---|
| 1 | 0:38.9–0:50.9, M006 me_21_listen | **Editor** | **Don't show 2-1's BOOP.** The 2-1 program is `IF a BEEP → BOOP q2` (src still 872). With *one* bot, a BEEP says "they differ" but **not which one**, so showing a fix teaches the exact misconception the syndrome table exists to correct. End M006 on the BEEP (about tl 2950). Change cap09 to "LISTEN: BEEP = they don't match… but which one?" so it bridges into "Two bots. Four answers." |
| 2 | 1:51–2:04, cap22 | **Editor** | **"SPIN, fix, SPIN." is the wrong order.** The program is SPIN ×3 at bedtime → night (Phasey) → SPIN ×3 in the morning → HIGHFIVE/LISTEN → IF → BOOP. Use "**SPIN · night · SPIN · then fix.**" `= phase-flip code (Hadamard basis)` |
| 3 | 1:45.6–2:04.5, M015/M016 me_31_phase | **Capture Engineer** (or an Editor crop) | At src 949 the take shows the **"X-RAY REPLAY" chip and a strip of red ✗ nights (18/48)** while the *correct* SPIN program runs. A newcomer reads "the fix fails", and it is X-ray footage without our tag. Re-capture the 3-1 run in normal view with the test strip cleared, or crop the split's room window below the chip/strip row. If any frame is genuinely X-ray, it gets `tag_xray_alpha`. |
| 4 | 1:04.9–1:12.1, M008 me_23_drag | **Editor + Capture** | **The programming hero beat is 7.2 s, the shortest in the video**, and it carries the 18-word cap11. Make it about **12 s** (take the 5 s from #5): show the IF card's condition chips being set (a → BEEP, b → QUIET), since that *is* the decoder, then the BOOP drops. Split cap11 into "Write the fix, card by card." (on the first drop) and "IF a BEEPs and b is QUIET → BOOP #1." (on the IF). `= decoder` |
| 5 | 2:09.5–2:30.7, M020 mo_qiskit_stamp | **Editor** | The close is 21 s, and the Qiskit stamp repeats M017's real export from 5 s earlier. **Cut M020 (300 f)** and give the 5 s to #4. The close becomes: just-a-game → snap → morph (line legible ≥ 3.9 s) → end card. |
| 6 | 1:12.1–1:27.1, cap14 | **Editor** | cap14 "IF a BEEP and b QUIET → BOOP #1." is word-for-word the end of cap11, only 20 s later, and only 3.8 s after cap13. Replace it with "**The program runs it: BOOP #1.**" on the lit IF and the BOOP pop. |
| 7 | 1:27.1–1:35.2, cap16 | **Editor** | "**= verified on every night**" overclaims: the test runs random input dreams × every *single* flip, not every possible night. Use "**= tested against every single flip**". |
| 8 | all `normal` clips | **Editor** (validator) | The normal layout at 0.88 scale repeats the trailer's first-cut mistake: the room is about 760 px wide and the card text about 16 px. Give every normal clip a **camera push of 1.25–1.4× toward the action** (the room for collapse/flip, the editor for the lit card) on its action frame. Relax the "≥ 98% of the editor in view" rule to "**the lit card and the actor are both in view**". |
| 9 | gap Capture #3 | **Capture Engineer** | Check the idle speech bubbles **before** rendering, not on the first render: scan me_23_night, me_23_xray and me_31_phase for bubble events, or pull stills at the split crops. It's cheap, and it saves a heavy render round. |
| 10 | gap Capture #1–#2 | **Capture Engineer** | Agreed. Re-capture me_encode (first line clear of the modal, second line held ≥ 3 s). Hold Schrödi's "Two little beeps…" ≥ 3.5 s **and then keep Flipper's line** (see Q2). |
| 11 | 0:50.9–1:04.9, mo_syndrome_table | **Motion Designer** | Two nits. The "all good" row puts the green ✓ over **q2 only**, which reads as "q2 is special": put the ✓ on all three, or next to the row. Bot b's BEEP rows lack the "BEEP!" tag that bot a has. |

### The Editor's questions
1. **Split balance:** right in principle. Split screen *is* the "card causes action" device, so use it wherever a program is running (it already is), and use normal layout for the explain beats, **but with the push-ins from #8**. Don't make the explain beats programming-first; they're about the room.
2. **Gremlin slang: keep one per gremlin, the line that *restates the lesson*.** For Gen Alpha it is the characters' voice, and the jokes are what they'll quote. Flipper's "HOW 😭 u didnt even look. this is so ohio" lands right after Schrödi's "…without looking at a single Qubble" (2.0 s, after Schrödi's held 3.5 s). It is the villain conceding the point. Phasey's "fr fr" line: if the take has it near 3-1's failing check (M014), use it there, because it is literally "bit checks miss phase flips". If it only exists after the pass (where the plan currently cuts), keep it there as a 1.5–2 s tag: the defeated ghost. In both, the strip shows only a `= chip`, never a sentence. Cut any slang that doesn't teach.
3. **Day grade on mixed takes: accept.** It's the game's true look, the 2 s of darkness reads as the threat, and a LUT pop mid-take would be worse. The cut from the night-graded cold open into M002 is a location change, so the grade change is motivated.
4. **Strip captions:** the density is fine (one per about 6.5 s), and the reading times hold. The wording is mostly excellent. Fixes are #1, #2, #4, #6 and #7. "The replay shows what the peek destroyed." is accurate; "…the dream the peek erased." is a little warmer, your choice. "SPIN turns the ghost's phase flip… into a plain flip the bots can hear." is correct (H Z H = X) and lovely: keep it.

**Physics review:** apart from #1, #2 and #7, every claim checks out. That covers the encode line (α|000⟩ + β|111⟩), "LISTEN: BEEP = they don't match", the syndrome table mapping (a = q1⊕q2, b = q2⊕q3), "the bots never learned the dream", "bit checks miss phase flips" and the Hadamard-basis label.

**Is the programming the hero?** It will be after #4 and #5: the drag, the IF being built, three split runs with pops, Test all, and the real Qiskit export.

**Re-review need:** none on the plan once #1–#7 are in the EDL. Send me the first render's contact sheet, plus stills of M006's end, M008 and M015.

---

## Milestone: showcase plan (`docs/VIDEO_EDIT.md` "Showcase plan", `showcase.edl.json`, 3:45.3)

**What I reviewed:**
- the plan and the physics table;
- source stills: sc_lv_1-1 at 8 s, sc_notebook at 12 s, sc_threshold at 6 s;
- the S002 source resolution.

### Verdict: **CHANGES** (minor; no structural rework)
Coverage is complete. All 16 levels appear (the 4×4 cascade is a great opener), every meta beat is in, and every feature on the list is shown. The physics table is correct, and the save-joke wording fix is exactly right.

The problems are proportion and legibility, not content:
- the last 31 s are credits + close;
- the Codex runs 17.7 s;
- the most interesting programming feature (step-mode's measurement "snap") is shrunk into a quarter-screen;
- the notebook and threshold chart, the pages physics-minded judges will pause on, are 1080p takes whose numbers can't be read.

### Ranked changes
| # | Beat / timecode | Owner | Exact change |
|---|---|---|---|
| 1 | 3:14.1–3:29.1, S031 curtain call | **Editor** | **Cut it to about 8 s (480 f).** Credits + close are 31 s (14% of the runtime) at the point where viewers drop off. Give the freed 7 s to #3 and #4. |
| 2 | 2:18.8–2:36.5, S025 Codex | **Editor** | **17.7 s → about 12 s.** Keep the collection pan (2 s), Flipper (2 s), and the Qubble's 3D Bloch drag + Measure (about 8 s). Drop the in-between browsing. |
| 3 | 2:59.9, S029 sc_qol4 (TR quadrant) | **Editor** | **Pull step-mode out of the 2×2** into its own 4–5 s full-frame beat (pg_step_scrub, 4K, push about 1.6× on the timeline). Scrub back through gates, then hit the measurement **"snap"**. Strip: "Rewind the night: gates run backwards, a measurement is a one-way door." It is the best programming *and* physics feature in the game, and a quarter-screen buries it. Fill the free quadrant with **Hints** (escalating hint reveal) or the win card's **"Pros call this…" link to Qiskit / IBM Quantum Learning** (`win-links.png` exists as a reference). Neither is shown anywhere yet, and both are things judges value. |
| 4 | S024 threshold, S028 notebook | **Capture Engineer** | Q2: **schedule 4K re-takes for these two only.** In the notebook still the Bloch numbers and page text are about 9–11 px after the 0.88 scale, so the feature looks like decoration. At DSF 2, push about 1.6× on the active page (Bloch → circuit → stabilizers). For the chart, push on the curve with p = ½ marked. Skip re-takes for the win cards in strobes and for the save line (the strip carries them). |
| 5 | 0:05–0:10, S002 sc_title_peek | **Editor** | S002 resolves to `sample-title-peek.mkv`, an old 1080p sample. That is the take with the wandering-cursor problem the trailer had to re-capture. Use **`tr_title_peek` (4K, the one-glide cursor)** with a different in-range from the trailer's (cross-video reuse is fine, see Q3). |
| 6 | S004 label; S023 | **Motion + Editor** | **Name collision:** the hero label reads "Night Shift · 1-1…", and S023's endless mode is also "Night Shift". A viewer will think 1-1 *is* the endless mode. Label chapters as "**Ch 1 · 1-1 Dont Wake Them**" (match the in-game title spelling, since the display font has no apostrophe), and caption S023 "**Night Shift mode:** endless, randomly generated nights." |
| 7 | hero clips S004, S010, S016, S020 | **Editor** | Q1: the Test-all heroes are fine, **but make the test the programming moment.** Start each about 1 s before the click, with the program column fully in frame (the right-anchored drift), so the click → ✓ strip reads as "run my code against every night". On the first hero (S004), put one chip: "`= your program, tested against every single flip`". |
| 8 | S030 save joke | **Editor** | It's the settings screen anyway, so add a second strip line for 2 s: "**Judges: Settings → Unlock all content.**" Free, and useful. |
| 9 | S017 / S019 run splits | **Capture + Motion** | Agreed as planned (4K, `quietBubbles`, marks). Apply the mechanic's lessons: the code window follows the lit card, pops and rings land on the event frames, and no in-game X-ray chip or stale ✗ strip is in the crop. For **3-3**, the strip line must land **on the LISTEN frame** where the half-flip resolves: that is the discretization moment. |
| 10 | P2 idle bubbles | **Capture Engineer** | Check bubbles on stills **before** the render (all `sc_*` takes predate `quietBubbles`). The sc_lv_1-1 still already shows the inspector pop-up and a cursor in the bottom-left. Accept the inspector, which is a feature. Make sure no speech bubble falls in a used range. |

### The Editor's questions
1. **Hero levels:** Test-all verifications for 1-1 / 2-3 / 3-1, run splits for 3-3 and 4-1: **yes**, with #7. Three more 4K runs would duplicate the mechanic.
2. **Push limit:** accept 1.136× for the level takes. **Re-take in 4K only the notebook and the threshold chart** (#4).
3. **Cross-video reuse: fine.** Each video has its own job, and within the showcase nothing repeats. Just avoid the *identical* in-range of the trailer's one-beat shots, so the trailer doesn't feel like a cut-down of the showcase.
4. **Hero title + label:** keep the blanket_title as the name. After the wipe, the HUD label shows **only the code chip** ("Ch 1 · 1-1") at small size. The name twice in a row is redundant; the code is useful orientation. The strobes keep their full labels.

**Pacing:** after #1–#3, about 0:15–1:48 is levels (good), 1:48–3:07 is features with energy changes every 8–15 s, and the end is about 24 s. The 9 strobes at one beat each (0.71 s) work as rhythm, not reading, which is fine because the opening grid already shows every level.

**Physics:** all nine claims check out:
- no-cloning;
- discretization ("a full flip or none", true after syndrome readout);
- Shor-9 "any single-Qubble error, fixed blind";
- 3p² − 2p³ < p ⇔ p < ½ (for independent flips: the chart's model);
- IF = classical feed-forward;
- the classical save, "three copies, majority vote".

**Is the programming the hero?** It will be after #3 and #7: two run splits with pops, the IF anatomy close-up, step-mode full frame, the QoL quadrants, and every hero level framed as "run the tests".

**Re-review:** no further plan review is needed. Send me the first render's contact sheet plus stills of S017 at the LISTEN frame, the step-mode beat, and S028.

---

## Milestone: mechanic render (`videos/final/mechanic.mp4`, 2:39.5)

**What I reviewed:**
- the contact sheet and the 8 critic stills (end of 2-1 f3270, decoder f4620/f4800, 3-1 failure f7120, 3-1 SPINs f7400, 3-1 bots f7950);
- all 28 captions against the EDL and the mix report's event frames;
- the mix analysis;
- the phone-sim WAV, cue by cue (the cue's 200 ms RMS against the 400 ms before it).

### Verdict: **FIX (minor; one sound item must land, the rest is polish)**
This is a good explainer. The order teaches. Every caption matches its event frame: cap11 "LISTEN: BEEP…" starts at f3072 on the beep at f3096, and cap17 "The program runs it: BOOP #1." sits on the BOOP. The new decoder take shows the IF being built, including the "Jump to which spot?" picker (f4620), which is real programming on screen. The 3-1 re-take is clean: no X-ray chip, the ✗ strip only in the failure shot, and the false IF passing with ✗ while both bots BEEP (f7950). The programming is the hero.

### Ranked fixes
| # | Timecode | Owner | Exact fix |
|---|---|---|---|
| 1 | **f3096 (51.6 s), M008 2-1 LISTEN** | **Sound Designer** | **The most important BEEP in the video is inaudible on a phone.** In the phone sim it is only **+0.7 dB** over the preceding 400 ms (the 2-3 BEEP at f5474 is +5.4; the 3-1 BEEPs are +10/+18). Probably bot a's F3 marimba "DUM" is below a phone speaker's range, and the music sits on top. Layer the trailer-weight `listen_beep` (2.8 kHz presence) with the botNote on this cue, dip the bed 6 dB around it, and re-check for ≥ +6 dB in the phone sim. Same check for the HIGHFIVEs at f1318 (+1.0) and f2620 (+3.1). |
| 2 | whole mix | **Sound Designer** | The analysis flags `groove_type` sitting **20 ms off the song's grid** (an audible flam on percussive hits). Shift that layer by +20 ms, or drop it. |
| 3 | f4700–4921, M010 decoder (after the IF) | **Editor** | At f4800 the left 40% of the frame is empty floor (one corner of q3) while the action is all in the program column. Ease the camera to **program_focus** (editor centred, room off-frame or at its edge) from about f4700 to the end of M010. That is the decoder beat, so the code should fill the frame. |
| 4 | f7294–7754, M017 3-1 SPINs | **Editor** | The split's code window clips the Morning column mid-word ("SPIN q…", "HIGHFIV…") at the right edge (f7400). Either crop to the Bedtime column only while the bedtime SPINs run, then pan to Morning, or widen the window so Morning's cards are whole. |
| 5 | f7063–7294, M016 | *(accept)* | Schrödi's "Morning check: the dream doesn't match. 30…" is still typing under the `= bit checks miss phase flips` chip. That's fine: the chip carries the point, and the ✗ strip shows it. |

**Mix-analysis flag "drop is not the peak": not applicable**. The mechanic has no drop (that check is trailer-only, and QA marks it N/A). The end-card jump at 159.1 s is the fade. LRA 3.1 LU is fine for an explainer at −16 LUFS.

### Physics: every caption checks out
- measurement collapse;
- "The replay shows what the peek destroyed" (an X-ray view, tagged);
- no-cloning / encoding / entanglement;
- "A bot HIGHFIVEs two Qubbles = parity check";
- "**Here Flipper can only reach #2**": accepted. It is true for 2-1 (`noise.targets ['q2']`) and it defuses the one-bot misconception honestly;
- the syndrome table;
- the decoder IF;
- "tested against every single flip";
- "The dream lives in all three Qubbles = entangled, not copied";
- "the bots never learned the dream";
- "bit checks miss phase flips";
- SPIN (H) converting Z to X;
- "SPIN · night · SPIN · then fix";
- the Hadamard-basis label;
- "Every program is a real quantum circuit: Export to Qiskit".

### Human checks
1. **Fresh eyes: PASS.** The expected answer is "you program robots that ask yes/no questions about pairs of sleeping blobs, then fix the broken one without looking". That is the mechanic.
2. **Muted: PASS.** The paper-strip captions plus the card pops carry the whole explanation. This is an explainer built to be read.
3. **Audio-only: not applicable / weak by design.** With no voice-over (Qubblese is gibberish), audio alone tells only the mood and the event rhythm. Acceptable for a captioned explainer, so this is not a blocker.
4. **Phone (sim): FAIL until fix 1** (the 2-1 BEEP). Everything else reads: peek +9/+13, flips +7/+11, the 2-3 BEEP +5.4, test_pass +16/+20.

**After fix 1 (and ideally 2), this is a PASS.** Fixes 3–4 are polish. For sign-off I only need the phone-sim numbers re-run at f3096/f1318/f2620 and stills at f4800 and f7400.

---

## Milestone: mechanic render: sign-off

**Verdict: PASS.**
- **2-1 BEEP (f3096): fixed.** It now reads +8.3 dB in the phone sim, comfortably audible.
- **f1318 highfive at +3.4 dB: accept.** It's a bedtime HIGHFIVE in the threat beat. It is not information-carrying (the flip at f1567, +8.3, is the cue that matters), it sits on a bed ramp, and pushing it further would spike. Phone readability is 66/67, with the miss on a non-critical cue.
- **Groove flag: accepted as an analyzer artefact** (the direct onset cross-correlation gives −1 ms).
- **M017 (f7400): fixed.** The full Bedtime column is in the window during the SPINs, the lit card is whole, and the pops align.
- **M010 decoder: accept at the native limit.** In my fresh pull of f4800/f4880 from the 16:43 mp4, the room still occupies the left ~40% (q3 and floor). At the 4K editor region's native maximum it can't be pushed further without upscaling, and the program column is fully legible (card text about 30 px) with the caption on it. No further work.

All captions are physically correct (see the render review), and the human checks are fresh eyes PASS, muted PASS, audio-only N/A by design, phone PASS. **The mechanic video is signed off by the Critic.**

---

## Milestone: showcase render: sign-off (`videos/final/showcase.mp4`, 3:41.0)

**What I reviewed:**
- the contact sheet;
- the critic stills (S017 LISTEN f4444, step-mode f10700/f10880, notebook f9900);
- fresh pulls from the mp4: f936/f950 title wipe, f4676, f6200 Lights Out, f8760 waiver region, f9700 notebook, top-left crops to confirm the contact sheet's yellow "BLANKET-TITLE" text is a sheet annotation and not burned in (it isn't);
- the reencode evidence;
- all 27 captions.

### Verdict: **PASS**
Every plan change landed:
- 1-1 / 3-1 / 4-1 blanket-title wipes with code chips ("Ch 3 · 3-3 Wobbles");
- the Codex trimmed;
- the curtain call cut to 8 s;
- tr_title_peek;
- the "Night Shift mode" rename;
- the judges' unlock line;
- step mode as its own full-frame beat, landing on the game's own toast "Snap! Measurements are a one-way door. You can't un-look." That is the best physics moment in the showcase;
- the notebook re-take is readable: the state vector 0.71|000⟩|00⟩ + 0.71|110⟩|00⟩ mid-encode, and 0.71|010⟩ + 0.71|101⟩ after Flipper hits q2, both correct;
- the 3-3 split puts "…LISTEN snaps it to all-or-nothing. Tonight: nothing to fix. `= error discretization`" exactly on the LISTEN a pop, with the ring and the quiet answer. That is the discretization moment, honestly shown (a quiet result projects the wobble away).

**Calls on the open items:**
- **Reencode banding (S013/S014): waive.** The master/8 Mbps comparison shows no contour bands, only slightly blotchy flat wall texture on 36-frame 6× strobes that are on screen for about 0.1 s per frame. Nobody perceives that, and 20 minutes of grain re-render buys nothing. Do refine the metric later: require the flat plateau to persist ≥ 0.5 s before it counts.
- **`debug_pulseunlock` waiver: verified a false positive.** At f8760 the matched region is the Codex's real **"X-ray: blanket see-through"** pill button, under the Qubble entry's Bloch sphere. It's game UI, not the notebook test page's debug button.
- **Phone sim 75/77 (the f4180 and f10192 highfives): accept.** Same class as the mechanic's f1318: non-information-carrying, and the beeps and flips around them read.

**Physics: every caption checks out.**
- majority vote → Shor-9;
- measurement collapse;
- no-cloning;
- syndrome decoding;
- phase-flip code (Hadamard basis);
- Wobbles: "LISTEN snaps it to all-or-nothing" (projective syndrome measurement discretizes the rotation);
- "Nine Qubbles, eight bots: any single error, found and fixed blind" (Shor-9 uses 8 stabilizer checks; X, Z or Y on any one qubit);
- "three Qubbles beat one only below p = ½" (3p² − 2p³ < p, independent flips);
- the Bloch sphere;
- IF = classical feed-forward;
- step mode: "gates run backwards, a measurement is a one-way door" (unitaries are reversible; measurement isn't);
- the save: "three copies, majority vote" (classical, correctly not called qubits).

**Optional polish (not blocking):** in S031 the X-ray tag floats mid-frame across the notebook panel's edge (f9700/f9900). It's legible, but it would sit better at the room's floor, bottom-right, as in the proof shots. Fix it only if that chunk is re-rendered for another reason.

### Human checks
1. **Fresh eyes: PASS.** "A puzzle game where you program little robots to fix sleeping blobs without looking, with tons of levels and a nerdy lab mode." The grid opener and the chaptered level run make the scale obvious.
2. **Muted: PASS.** The strip captions and HUD chips carry every feature and lesson.
3. **Audio-only: N/A by design** (a feature tour).
4. **Phone (sim): PASS** at 75/77, with non-critical misses.

**The showcase video is signed off by the Critic. With the trailer and the mechanic, all three deliverables are signed off.** The only open item is the user's single real-phone listen of the trailer.

---

## Milestone: thumbnails (`videos/final/thumbnails/`)

**What I reviewed:** contact.png (including the true 168×94 row) and trailer_A / showcase_A at 1280×720.

| Video | Main | A/B partner | Verdict |
|---|---|---|---|
| Trailer | **A** | B (after fix) | A **PASS**. B **FIX** |
| Mechanic | **A** | B | **PASS** (both) |
| Showcase | **A** (after fix) | a new B | **FIX** |

**Trailer:**
- **A: PASS.** "DON'T PEEK!" is the strongest mobile read of the six. The hand-drawn apostrophe is clean and sits right. The opaque blanket *is* the premise. The q2 chip ends at about x 1100, y 610, clear of the duration badge (about x > 1130, y > 640).
- **B: FIX.** The worry about the face through the blanket is justified. The X-ray view is real game footage, but in the trailer it carries the "X-ray · simulator view" tag, and here it's untagged. Pairing it with "DON'T PEEK!" literally shows the peek, which contradicts the hook (and a tag would be illegible at 168×94 anyway). Fix: keep Flipper striking (he's the click magnet: a villain, a lightning bolt, emotion) but show q2 **opaque**: the blanket jolting (the game's flip-shake), a red "!" over it, the Zzz broken. Everything must come from the real flip frame in normal view.

**Mechanic: PASS (A main, B partner).**
- A reads as "a programming game" even at mobile size: the purple IF card and the red BOOP card are recognisable as code blocks, and "FIX IT BLIND" reads.
- B is a genuinely different test (full-bleed room, characters). Its BEEP/quiet tags are real game UI.
- The BOOP card's right end in A is at about 86% height, just above the badge zone. Fine, but don't move it lower.

**Showcase: FIX.**
1. **The "16" misreads.** The Quantum "1" has a flag stroke that reads as **"76"/"T6"** at full size, and worse at 168×94. Set the digits in Quicksand Bold (or draw a plain-stem "1", the way the apostrophe was drawn).
2. **The text is too small at mobile size.** At 168×94 "16 LEVELS" is about 9 px tall and "SHOR CODE" about 8 px: legible only if you already know what it says. Scale the text block about 1.3×, shrinking the inset to fit (the inset's detail is lost at mobile size anyway). "→ SHOR CODE" means little to a general viewer, but it does to judges, and it's honest, so keep it, larger.
3. **A and B are the same thumbnail** (same text, same blur, only the inset differs), so the A/B test measures nothing. Make B a genuinely different concept: the **4×4 grid of all 16 solved levels** (the showcase's own opening frame) with one big line, "16 LEVELS". It's the most "there's a lot here" image the game has, and it comes from real footage.
- The hand-drawn arrow is fine. "GREML… WELCOM…" cut at the inset's edge is acceptable.

**Honesty overall:** all six use real game art. The only issue is the untagged X-ray in trailer_B (fixed above). No typos.

**Re-check:** only trailer_B (v2), showcase_A (v2) and showcase_B (v2), at full size plus the 168×94 row.

**Thumbnails v2 re-check: PASS (all three).**
- **trailer_B: PASS as the A/B partner.** It's honest now: an opaque blanket, the game's real flip marks ("!!", a sweat drop, shake lines), and Flipper as the normal-view silhouette. At full size it's a great "something's under there" image. At 168×94, Flipper shrinks to **two glowing dots plus a faint shape**, and the thumbnail reads as almost the same as A. That's acceptable for a partner, but if the Art Designer has 5 minutes: crop about 1.2× toward q2 + Flipper, with the text unchanged, so the silhouette's horns and bolt survive at mobile size. Optional.
- **showcase_A: PASS.** The Quicksand "16" reads correctly, the headline is legible at mobile size ("16 LEVELS" clear, "→ SHOR CODE" readable), and nothing sits in the duration corner.
- **showcase_B: PASS.** It is the best mobile read of the showcase pair: a big "16 LEVELS" over a wall of real solved rooms says "there's a lot of game here" instantly. The duration badge lands on the dark Lights Out tile, which is harmless.

**Final picks:**

| Video | Main | Partner |
|---|---|---|
| Trailer | **A** ("DON'T PEEK!", blanket) | B |
| Mechanic | **A** (FIX IT BLIND + IF card) | B |
| Showcase | **B** (16-level grid) | A |

The showcase pick goes against the designer's recommendation: B wins on mobile legibility and immediacy. A's "→ SHOR CODE" is the judges' hook, so it stays as the test partner. If the upload is mainly for the judging panel, swap them; for a general audience, keep B.
