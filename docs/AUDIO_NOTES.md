# AUDIO NOTES — NO PEEKING! (v0.2)

Fully procedural WebAudio: no assets, no dependencies. Everything lives in `src/audio/`:
`index.ts` (engine + `audio` singleton), `music.ts` (sequencer/scenes), `instruments.ts`, `sfx.ts`,
`bots.ts` (syndrome voices), `voice.ts` (Qubblese babble), `core.ts` (helpers/buffers).
Test bench: `npx vite` → `/src/audio/test.html` (scenes, sliders, all SFX, syndromes, voices, offline level meter).

## Music
- **Key F major, 84 BPM, swung 8ths (swing 0.62).** 8-bar loop, sunny I–IV–ii–V:
  `| Fmaj9 | Bbmaj9 | Gm9 | C9sus→C9 | Fmaj9 | Bbmaj9 | Am7 | Gm7 C9 |`
- **Theme** (music box, C5–D6): `C F G A~ | C' A F E D | D F G Bb~ | A G F G~~ | C F G A C' | D'~ C' A F | G A G E~~ | F E D G C`.
- Lookahead sequencer: 25 ms `setTimeout` tick that schedules 120 ms ahead on `ctx.currentTime`. The tab-hidden state suspends the context.
- **Layers:** pad, EP (FM Rhodes + tremolo), bass, drums (soft kick/brush/hats), lead (music box), crackle, clock, arp, plus tension (pizzicato/heartbeat/drone).
- **Scenes** (cross-fade on the next bar; outgoing layers play one more bar while fading):
  | scene | content |
  |---|---|
  | title | pad + music-box theme + soft EP hold, no drums |
  | map | full groove, theme 8 bars on / 8 off |
  | build | relaxed groove, sparse theme fragments |
  | run | walking bass + tick-tock clock, no lead |
  | win | sting on the next **beat**: ii–V → Fmaj9 with the theme tag, then auto → build |
  | lightsout | pad + soft EP + pedal bass, dark lowpass, no drums (syndromes stay clear) |
  | lab | curious lydian triangle arps, pedal bass, soft hats |
  | credits | full theme from bar 1, octave-doubled by EP in the second half |
- **Warmth rule (v0.2):** `setHarmony` and `setTension` only colour **run** and **lightsout**. In every other scene the music is forced consonant (harmony = 1, tension = 0) whatever value was last sent, so a failed run never leaks eeriness into map, build or title. The stored values come back when you re-enter run.
- **setHarmony(f)** (night scenes): a dead zone at f ≥ 0.95. As f drops: the lowpass closes (lpMax → 1.3 kHz), gentle pitch wobble (≤16 cents), slight per-voice detune, a soft b9 under 0.65, a faint tritone under 0.35. At high f a lush shimmer note is added.
- **setTension(t)** (night scenes): a cartoon tiptoe pizzicato (C4–F4), a soft heartbeat when t > 0.35, and an open-fifth drone. It plays even when the gremlins are hidden visually.

## SFX
All 25 `SfxName`s. `opts.pitch` is a **multiplier** (1 = normal, clamped 0.25–4); `volume` 0–2; `pan` −1..1.
Each call gets ±3% pitch and −10% volume jitter. Anti-spam: the same SFX within 30 ms is dropped, and at most 4 copies overlap.

## Syndrome sonification (Lights Out)
Each bot has its own pitch, register, timbre **and rhythm**:
a = F3 marimba "DUM", b = C6 bell "ding-ding", c = G4 kalimba grace, d = F5 whistle swell, e = C4 toy triple,
f = A5 glock trill, g = D4 wood boing, h = D6 octave sparkle. QUIET = a soft muted "tk".
2-bit syndromes: `00` "tk tk" · `10` "DUM tk" · `01` "tk ding-ding" · `11` "DUM ding-ding". Bots are strummed 60 ms apart.
Bot notes duck the music (~−7 dB) for clarity.

## Qubblese voices (v0.2)
`audio.voice(who, ch, index, line)`: call once per revealed character, at about 30–40 cps.
- Each line is parsed once (cached) into syllables (consonant cluster + vowel group). A syllable fires on its first character, so you get about one grain per 2–3 chars, and spaces and punctuation are silent.
- Vowels set the formant pairs (a/e/i/o/u/y); diphthongs glide. Plosives give a click, s/z/f/v/sh/th a hiss, h a breath, m/n/l/r/w a soft scoop.
- **Deterministic:** pitch is hashed from the syllable letters, so the same text gives the same sound.
- Inflection: `?` rises on the last word, `!` is louder and punchier, `…`/`...` trails down and slows. Each sentence also falls slightly in pitch.
- Speakers: schrodi lazy purr-meow · flipper squeaky chipmunk · phasey breathy ghost (phaser + vibrato) · wobbles gloopy wobble · qubble tiny coos · eye deep slow reverberant hum · system neutral blip.
- Self-throttled per speaker (50–130 ms minimum gap), so "reveal all" doesn't burst. Music ducks about −2 dB while someone speaks.
- `audio.setVoiceVolume(v)`: default 0.5. Voices also follow the SFX slider.
- **For the programmer:** in `src/ui/dialogue.ts`, replace the per-3-chars `ui_click` blip with `audio.voice?.(line.who, ch, i, line.text)`, and drop the random `schrodi_meow` (the voice already meows).

## Integration notes
- Call `audio.unlock()` on the first click or keypress. Every method before that is a safe no-op, but scene, harmony, tension and volumes are remembered.
- During runs, call `setHarmony(snapshot.logicalFidelity)` every step (it is smoothed). Call `setTension(0.7)` in the night phase and `0` after.
- On a bot measure event, `botNote(idx, result)` is the bot's voice. `listen_beep`/`listen_quiet` can layer on top, but in Lights Out prefer `botNote` alone.
- `setScene('win')` is one-shot and returns to build by itself.

## Levels & CPU
- Master chain: glue compressor → limiter (−9 dB, 20:1) → trim. Measured offline (OfflineAudioContext in headless Chrome, 12 s per scene): music peaks −6.8 to −11.5 dBFS, RMS −20 to −23.6 dBFS, **0 clipped samples** anywhere; SFX peaks −7 to −20 dBFS (UI ticks quieter); voices −7 to −14 dBFS peak.
- CPU: one shared noise buffer, one convolver (2 s IR), voices auto-disconnect on `onended`, polyphony is capped at 72–90 voices, and notes are only scheduled for active layers. The busiest scene runs roughly 30–50 oscillators. Expected to stay well under 5% on a laptop (estimated, not profiled).
