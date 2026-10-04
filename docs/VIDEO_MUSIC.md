# Trailer music (Music Supervisor), v2

**Deliverables (v2; the v1 files are kept as `*_v1.*`)**
- `videos/music/trailer_edit.wav`: 70.72 s (4240 frames), 48 kHz, 24-bit stereo premaster bed. −16.2 LUFS integrated, sample peak −1.5 dBFS.
- `videos/music/cue_sheet.json`: the **source of truth for trailer timing**. Version 2 contains:
  - sections, each with its mix notes;
  - `proof_steps`, `named_hits` and `cut_rules` (including the montage cut frames);
  - `beep_pitch`, the automation values and the edit log.
- `tools/video/audio/music_edit.py`: rebuilds v2 deterministically. Overrides are accepted as `key=value` arguments, e.g. `proof_db=-9`.
- `tools/video/audio/music_gate.py`: the loudness-curve gate. It exits 1 on failure. The last result is saved in `videos/music/analysis/gate_v2.json`.
- `tools/video/audio/music_edit_v1.py`: rebuilds the v1 files.

```bash
tools/video/safe-run.sh --mem 3G -- videos/.venv-music/bin/python tools/video/audio/music_edit.py
tools/video/safe-run.sh --mem 3G -- videos/.venv-music/bin/python tools/video/audio/music_gate.py
```
The venv is on disk in `videos/` (git-ignored). It needs numpy, scipy, soundfile and pyloudnorm.

**Track decision (Director):**
- The **Rok Nardin "Twinkle Twinkle Little Star (Epic Version)"** edit is the bed for the user's **personal cut**. It is not distributed; the user has decided licensing is not a concern.
- The Sound Designer builds a **public-domain Twinkle arrangement** as the alternate. It should follow this cue sheet and treat the automation below as arrangement directives.

## Why this song
- It is a lullaby turned epic, which is the game's premise.
- It has a music-box intro, a clean riser, a big drop and a held final chord.
- Its tempo is rock steady (beat-to-beat interval std 15 ms).

Runner-up and rejects:
- **Hush Little Baby Trailerized:** it has better built-in dynamics, but its lead vocal fights the text and the Qubblese, and it drifts 31 ms.
- **The others** (Evil Star, Pure Imagination, The Clock, Playful Investigation): too dark, too generic, or no lullaby link.

The Critic's main objection to v1 was its flat energy. v2 fixes that with filter and level automation.

## Grid
- **112.5 BPM, 3/4 waltz.** The meter check found hit strength 35.1 on downbeats, against 11.6 and 9.8 on the other two beats.
- Beat = **32 frames**, bar = **96 frames**.
- `frame(k) = 50 + 32·k`. Downbeats are where `k % 3 == 0`.
- Every splice keeps the source meter.

## Cut rules (also in `cue_sheet.cut_rules`)
- **No half-bar cuts.** Half a bar is 1.5 beats (48 frames), which is off the grid.
- **Never cut on beat 2 (k%3==1) on its own.** Weak-beat cuts are allowed only inside the hemiola or every-beat runs.
- **Montage ladder 96 → 64 → 32**, 12 shots:
  - 3 downbeat cuts: f2162, 2258, 2354;
  - 2 hemiola bars: f2450, 2514, 2578;
  - 2 bars of beat cuts: f2642, 2674, 2706, 2738, 2770, 2802.
- **Every section boundary is a downbeat.**

## Sections (v2)
| Section | Frames | Bars | Music / mix |
|---|---|---|---|
| cold_open | 0–434 | – | Music box (first note at f50). It decays to near silence into the hit. |
| peek | 434–722 | 3 | **Damaged lullaby:** a tape-stop dip on the f434 hit (speed 1→0.7→1 over 25–275 ms, so the attack stays crisp), then a ±30 cent wow at 0.7 Hz and −6 dB. Phrase 2 ends 37 ms behind the source, which is harmless. |
| build | 722–1298 | 6 | The LPF sweeps **900 Hz → open** (log), with a **−6 → 0 dB** ramp plus per-bar trims. The build tail overlaps the pre-drop riser head over **k35–38 (f1170–1266)**, equal-power, with no hole. Lift at f818. |
| silence | 1298–1394 | 1 | **Digital zero.** Bot **BEEP at f1362**, tuned to **C5 (523 Hz)**. |
| drop | 1394–1586 | 2 | Full orchestra. A **+4 dB transient lift** on f1394 settles to +1 dB. |
| proof | 1586–2162 | 6 | **Submerged bed:** LPF 1.2 kHz at **−8.5 dB**. The brief said −6 dB, but the gate needed −8.5, because this source span is louder than the montage's. Steps: flip f1586 (1 bar), bots ask + label f1682 (2 bars), BOOP f1874 (1 bar), X-ray reveal f1970 (2 bars). |
| montage | 2162–2834 | 7 | The filter opens over k65–66 and **lands on f2162** (the second lift). Bed at −2 dB. |
| lights_out | 2834–3026 | 2 | LPF 300 Hz at −8 dB. A **reversed cymbal from f2930 lands on f3026**. |
| payoff | 3026–3410 | 4 | **The loudest bed moment (+2.5 dB).** The Sound Designer adds the fanfare and `level_win` on f3026. |
| closing_musicbox | 3410–3602 | 2 | One phrase, "lit-tle star" (A A G, ending on the held G "star"). It decays into the silence and stops before the C4 pickup. |
| closing_silence | 3602–3698 | 1 | **Digital zero.** |
| snap_circuit_reveal | 3698–3986 | 3 | **Snap + the final orchestral chord at f3698**, for the circuit reveal and the closing line. |
| end_card | 3986–4240 | – | The chord rings out and fades to zero by f4240. |

## Loudness-curve gate (v2: PASS)
Levels are energy-average RMS in dBFS; peaks are the maximum 0.5 s window.

| Check | Requirement | Result |
|---|---|---|
| Build rises bar by bar (per-bar, ±1 dB) | non-decreasing | −37.2, −30.0, −29.0, −28.0, −25.7, −23.1 ✓ |
| Drop vs build average | ≥ +6 dB | −15.45 vs −27.13 → **+11.7 dB** ✓ |
| Drop vs build peak | ≥ +4 dB | build peak −20.07 → **+4.6 dB** ✓ |
| Payoff vs montage | ≥ +2 dB | −14.77 vs −19.78 → **+5.0 dB** ✓ |
| Proof bed under montage | ≥ 6 dB | −26.05 vs −19.78 → **6.3 dB** ✓ |

- The payoff (−14.8) is louder than the drop (−15.5), so it is the loudest moment.
- A short dip just before f1170 (about 6 dB over ~0.3 s) is the source's own breath before its next hit. The per-bar curve still rises.

## The edit (source → trailer)
| Trailer | Source |
|---|---|
| cold_open (f0–434) | 0.00 s → beat 12 |
| peek (damaged) | beats 12–21 |
| build | beats 105–108 (riser), then 108–122 (body; the tail fades out over the overlap) |
| pre-drop riser | beats 182–186 (fades in equal-power over k35–38; stops before the 100.05 s hit) |
| silence | — |
| drop → payoff | beats 189–252 (101.7–135.3 s), continuous |
| closing music box | beats 6–11.35 |
| silence | — |
| final chord | beat 252 (135.25 s), +9.04 s, with a 3.5 s fade |

**Processing details:**
- **Splices:** a 10 ms pre-roll with sine/cosine fades.
- **Filter automation:** a time-varying 4th-order Butterworth low-pass, processed in 64-sample blocks.
- **Reversed cymbal:** synthesized from high-passed noise with 5.2, 7.4 and 9.8 kHz resonances, reversed, and left unfiltered.

## Hand-off notes for the Sound Designer and Editor
- **Ducking:** use a sidechained **2–5 kHz dynamic-EQ dip (−6 dB)** under each featured SFX instead of a broadband duck. Master the full mix to −14 LUFS and −1 dBTP.
- **Peek-collapse ×3:**
  - f434;
  - the title letters on 8ths after f1394 (an 8th = 16 frames);
  - the snap at f3698.
- **Other cues:**
  - heartbeat sub under cold_open;
  - layered impact on f1394;
  - fanfare and `level_win` on f3026.
- **Silences:** only the BEEP (f1362) and the snap (f3698) may sound inside them.
