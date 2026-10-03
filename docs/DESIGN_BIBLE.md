# NO PEEKING! — Design Bible (Director's document)

> Hackathon: **quriosity** (ISAQC, Infinium 2026, IIIT Hyderabad). 16-hour sprint, 3 Oct 10:30 → submit ~02:30 IST, finals before 06:00 4 Oct.
> **Option 06 — Error Syndromes and parity probes.** "Repair a broken message without ever reading it."
> Judging: physics accurate & easy to follow · core mechanic comes straight from the quantum idea · beginner can pick it up · original · one-click to run (hosted link).
> Deliverables: option name, playable hosted game, public repo, short video, README (what we learned in hours 0-3 + how it became the heart of the game).

## 0. The pitch (one breath)

You are the new night-shift caretaker at the **Qubble Daycare**, at the edge of the universe. Qubbles are gooey little creatures that dream two dreams at once. Gremlins sneak in at night and mess with their dreams. **You are not allowed to look at the Qubbles**: peeking wakes them, and a woken Qubble's double-dream collapses into one boring dream forever. So you program squeaky little **Ancillabots** to high-five the sleeping Qubbles, beep back clues, and let you fix the gremlin damage **blind**.

You accidentally learn: superposition, measurement collapse, no-cloning, entanglement-as-sharing, parity checks, syndrome tables, the bit-flip and phase-flip codes, error *discretization*, the Shor 9-qubit code, and why quantum error correction can work at all.

## 1. Pillars (every decision gets checked against these)

1. **Pull the physics out and the game collapses.** Every verb is a real gate. Every win is a real fidelity check on a real state-vector simulation. No fake quantum.
2. **Hiding is the mechanic.** The data is under a blanket. The player's only window onto it is the syndrome. Information we *withhold* is the lesson; information we *reveal* (after the run, in the X-ray replay) is the reward.
3. **Fail forward, then "ohhh".** Each idea is first taught by letting the player do the obvious-but-wrong thing (peek, copy, check bits but not phases) and watching it break. (GMTK: "teach by letting them fail safely".)
4. **Feel clever, not lectured.** Zero lectures. Text is only jokes, characters and a one-line reveal *after* the player has already done it.
5. **Programs are tested like real code.** As in 7 Billion Humans, a solution runs against many random nights (random input states × every correctable error), so the player can't fluke it. Optional size and speed challenges add mastery and replay value.
6. **Quirky, cute, a bit unhinged.** Pitched at Gen Alpha: squishy creatures, chaotic gremlins that speak in brainrot, a deadpan cat narrator, juicy feedback, a bop of a soundtrack.

## 2. Cast

- **Qubbles**: round gummy blobs with sleepy faces, tucked under blankets. Their "dream" *is* their qubit state:
  - ☀ **Sunny** = |0⟩ (warm yellow-orange glow), 🌙 **Moony** = |1⟩ (cool blue-violet glow).
  - Superposition = swirling two-tone glow. The **phase** shows as the direction the swirl spins and the hue of the rim (Bloch x/y). Fully mixed (entangled with others) = dim, misty and "shared" (thin silk threads drawn between entangled Qubbles in X-ray view).
  - Under the blanket you only see the blanket bump and snoring Zzz. In the X-ray replay the blanket turns translucent.
- **Ancillabots ("bots")**: small round robots on a single wheel with an antenna light. Each bot *is one ancilla qubit*. Their light shows the last LISTEN result: off = QUIET (0), red blink = BEEP (1). Bots may be looked at (measured) freely. That is the whole trick.
- **Gremlins** (the noise):
  - **Flipper**, a red imp who flips dreams (X error). Talks like: "skibidi FLIP 💀", "ur qubble got flipped no cap".
  - **Phasey**, a purple ghost who twists the swirl (Z error). *Invisible* to Sunny/Moony checks. Talks: "you can't see me fr fr".
  - **Wobbles**, a jelly gremlin who flips only *partway* (coherent rotation by angle θ). Shows that syndrome measurement *discretizes* errors.
  - Gremlins only attack during the NIGHT phase, with a cartoony sneak animation that is hidden by default ("lights out"). In the X-ray replay you see exactly what they did.
- **Schrödi**, the Daycare Manager: a cat in a cardboard box, deadpan, both bored and excited (in superposition, obviously). Narrator and hint-giver. Never explains math; makes dry jokes and asks leading questions.
- **The Eye (The Observer)**: the camera itself. Meta twist (see §7).

## 3. Core loop (one level)

```
BRIEF (Schrödi, 1–3 lines, joke + goal)
  → BUILD: drag command cards into the program (Bedtime and/or Morning panel)
  → RUN NIGHT: watch bots act; gremlins strike in darkness; bots beep
     controls: ▶ play · ⏭ step · ⏩ fast · ⏮ rewind (gates are reversible! measurements are a one-way door: rewind stops at them with a 'snap' animation)
  → TEST: the program runs against N random nights (input states × errors); a strip of night-cards shows pass/fail
  → REVEAL (X-ray replay): the blankets go see-through, the gremlin's move is shown, the Qubble dreams are drawn as they really were, and the fidelity meter fills
  → ONE-LINE "OHHH" (the lesson named *after* it is learned) + challenge stars
```

Fail states (each one is a lesson, never a game-over screen):
- **PEEK a Qubble in a no-peek level** → it wakes up grumpy, its double-dream pops (collapse animation and sound), and the night fails with "You woke Qubble 2. Its dream is now just ☀. The other half is gone forever." In X-ray you see the superposition become a single pole.
- **Wrong final state** → Schrödi: "Morning check: the dream doesn't match. 3 of 12 nights went wrong." Clicking a failed night opens its X-ray replay.

## 4. The command language ("Bot Code")

7BH-style vertical list of chunky cards. Arguments are picked by clicking the creature in the scene or from a dropdown. JUMP/IF draw curvy arrows to labels. Programs also export/import as text (shareable, like 7BH).

| Card | Text form | Physics | Notes |
|---|---|---|---|
| BOOP | `BOOP q2` | X gate | "flip the dream". Works on qubbles and bots |
| SHUSH | `SHUSH q2` | Z gate | "flip the swirl" (phase) |
| SPIN | `SPIN q2` | H gate | "turn the dream sideways" |
| HIGHFIVE | `HIGHFIVE q1 -> a` | CNOT, control q1, target a | "a flips if q1 is Moony". Any qubit to any other |
| LISTEN | `LISTEN a` | Z-measurement of a bot | sets bot light BEEP(1)/QUIET(0). Bots only |
| RESET | `RESET a` | reset to \|0⟩ | bots only |
| PEEK | `PEEK q1` | Z-measurement of a qubble | allowed only in classical/tutorial levels; otherwise it fails the night (but still executes physically for the reveal) |
| IF | `IF a BEEP and b QUIET -> fix1` | classical conditional jump | conditions on bot lights (and peeked qubble results in classical levels) |
| JUMP | `JUMP fix1` | jump | |
| label | `fix1:` | label | |
| END | `END` | stop the program | |
| NOTE | `# text` | comment | |

Toolboxes are unlocked progressively, one or two cards at a time.

## 5. Progression (chapters → levels), kishōtenketsu inside each chapter

Each chapter has four beats: **introduce** the verb safely → **develop** it → **twist** (the rug-pull) → **conclude** (combine). ✦ marks a meta beat.

### Ch 0 — "Day Shift" (classical bits; peeking allowed)
- **0-1 Good Morning**: one *Bit-ball* (a classical Qubble wearing a sleep mask; just a bit). The gremlin flipped it. PEEK, then IF moony, BOOP. Teaches PEEK, IF, BOOP, and running.
- **0-2 Three's a Crowd**: three bit-balls carrying the same dream; one gets flipped. Majority vote via PEEK and IF. This is the classical repetition code. Schrödi: "Easy. Copy the important stuff, take a vote. Remember this trick. It's about to stop working."

### Ch 1 — "Night Shift" (qubbles; no peeking)
- **1-1 Don't Wake Them**: a superposed Qubble. The toolbox *includes* PEEK. Goal: keep the dream until morning (there are no gremlins). The trivial solution is an empty program, and the level wins with an empty program. Most players poke PEEK anyway: collapse, fail, reveal. One-liner: *"Looking at a quantum thing changes it."* ✦ The level list now shows the PEEK card wrapped in hazard tape.
- **1-2 Twirl**: SPIN. Turn a Sunny into a swirl and back; SPIN twice = nothing (reversible). The rewind button is introduced here.
- **1-3 The Photocopier**: "Make a copy of Qubble 1's dream so we have a backup." Toolbox: HIGHFIVE. HIGHFIVE onto a fresh Qubble *looks* like it copies when the input is ☀ or 🌙 (the test inputs at first show only those!). Then the test suite adds a swirl input, and the "copy" turns out to be an **entangled twin** (X-ray: a silk thread, both dim). Fail → reveal: *"You can't copy a dream. You can only share it. (No-cloning theorem.)"* ✦ META: the game tries to copy itself. The UI duplicates and glitches for a second, the duplicate is "entangled" (moving one moves the other), then it snaps back.
- **1-4 Twin Dreams**: make a Bell pair, then PEEK one twin in a sandbox; the other always matches. Sets up "sharing a dream across Qubbles is our backup plan".

### Ch 2 — "Whisper Network" (parity checks = the heart)
- **2-1 Do You Match?**: two Qubbles share a dream (α|00⟩+β|11⟩, or possibly with one flipped). Find out *whether they match* without waking either. The solution is HIGHFIVE q1→a, HIGHFIVE q2→a, LISTEN a. The win check verifies the superposition survived *and* the bot's light is correct. Reveal: *"The bot learned whether they match, but not what they dream. That's a parity check."*
- **2-2 Tuck-In**: write the **Bedtime** program that spreads one dream across three Qubbles: |ψ⟩|00⟩ → α|000⟩+β|111⟩ (two HIGHFIVEs). Win = the exact encoded state, for random ψ.
- **2-3 Who Got Flipped?**: the full 3-qubit bit-flip code. Pre-encoded. Flipper hits at most one Qubble. Two bots, four syndromes (QUIET-QUIET = fine, BEEP-QUIET = q1, BEEP-BEEP = q2, QUIET-BEEP = q3). Tested against random ψ × {none, X1, X2, X3}. **The core "ohhh" of the game.**
- **2-4 Budget Cuts**: same task with ONE bot (use RESET and reuse it). Introduces RESET.
- **2-5 Double Trouble** (twist): two flips hit. The decoder "fixes" the wrong Qubble and the logical dream flips. Toolbox unchanged. This level *cannot be won with 100% success*; the goal is to beat the uncoded Qubble's survival rate. ✦ The **Night Shift Lab** appears: a chart of logical vs physical error rate p across 1000 simulated nights. The player sees the crossover (3p² − 2p³ < p when p < ½). Reveal: *"A code doesn't make errors impossible. It makes them rarer, as long as errors are rare to begin with."*

### Ch 3 — "Ghost Stories" (phase)
- **3-1 Something's Off**: the player's 2-3 solution, carried over unchanged, against Phasey. Every syndrome is QUIET, yet the morning check fails on swirl inputs. (X-ray: Phasey twisted a swirl.) Reveal: *"Some damage is invisible to the question you asked."*
- **3-2 Sideways Glasses**: SPIN all three, then checks, then SPIN back. Phase flips become bit flips in the sideways basis. The player builds the phase-flip code (Bedtime: encode into |+++⟩/|−−−⟩; Morning: correct).
- **3-3 Wobbles** (twist): Wobbles rotates a Qubble *partway*. The player's unchanged phase/bit-flip decoder still wins every night. Reveal: *"Listening forces a half-flip to become a full flip or no flip. Measuring the clue squashes a tiny error into one you can fix."* (Error discretization: arguably the deepest idea in the game.)

### Ch 4 — "The Big Nine"
- **4-1 Nesting Dolls**: the Shor 9-qubit code, guided in parts: three bit-flip blocks inside a phase-flip code. Bedtime is provided; the player writes the Morning program for X *or* Z on any one Qubble. (The player can mostly copy-paste their 2-3 and 3-2 programs; reuse is the point.)
- **4-2 Lights Out** ✦: The Eye closes. The screen goes dark and the scene stays hidden even during the run. Feedback is only *sound*: each bot's LISTEN plays a note, and the syndrome pattern forms a chord (see Audio §8). The player must trust their program, as a real quantum computer does. A win fills the screen with color and plays the full soundtrack resolution.
- **Credits**: the Qubbles wake up, all dreaming correctly. Schrödi steps out of the box (finally collapses: alive, obviously).

### Endless — "Night Shift" (infinite replay)
- A daily seed plus a "new shift" button generates a random code family (repetition-n for bits or phases, Shor-9), a noise model (p, gremlin mix, coherent angle), bot budget and step budget.
- Score = nights survived over a 100-night shift (logical fidelity) and how far below physical error rate p the result is. Local best scores are saved.
- **Gremlin Lab sandbox**: free play with any number of Qubbles and bots, with the X-ray always on and a live state view (amplitudes bar chart). For curious and expert players.

## 6. Showing vs hiding (explicit table)

| Hidden during play | Why | Revealed when |
|---|---|---|
| Qubble dreams (under blanket) | It's the whole point: you can't look | X-ray replay after the run |
| What the gremlin did | Forces the player to rely on the syndrome | X-ray replay |
| Amplitudes and Bloch math | Beginner-friendly | Gremlin Lab and the "nerd mode" toggle (shows ⟨Z⟩, \|α\|², \|β\|², kets) |
| Notation such as \|0⟩ or CNOT | Rule 04: keep heavy notation out of sight | Nerd mode and the level-complete card ("Pros call this a CNOT") |
| Most test cases | No overwhelming wall of nights | Test strip shows the count; click to expand |
| Hidden generosity: the rewind step stops right before a measurement; drag targets snap generously; fast-forward skips idle frames | GMTK "invisible help" | never (it is meant to stay unnoticed) |

## 7. Metagame beats (Baba Is You energy)

1. **Title screen is a register.** The letters of NO PEEKING! sit on Qubbles. Hovering the mouse over a letter *peeks* it, and it collapses to ☀ or 🌙 and changes color. The player messes up the title within the first five seconds, which foreshadows the whole game.
2. **The rules hang on the daycare wall** as physical signs: "LOOKING = WAKING", "NO COPIES", "GREMLINS ONLY AT NIGHT". In 1-3 the "NO COPIES" sign shakes when the player tries. In Ch 4 the player has rearranged their understanding: the sign reads "NO COPIES… BUT SHARING IS CARING".
3. **The game tries to copy itself** (1-3 failure): a short UI clone glitch that is "entangled".
4. **The level-select map gets hit by Flipper** between chapters. A level tile is flipped (it shows the wrong chapter art) and two map bots' lights blink a syndrome. The player taps the right tile to fix it, which is a syndrome-reading exercise *in the menu*.
5. **Lights Out** (4-2): the camera/Eye closes. Audio-only syndrome decoding.
6. **Save file joke**: settings → "Save data protected by 3-qubit repetition code ✓".

## 8. Audio direction

- **Music**: a lo-fi, bouncy, slightly jazzy lullaby (Animal Crossing × Lofi Girl × 7BH's quirky score). Adaptive layers: base pad (always) → night layer (the bass walks during runs) → tension layer (tracks the gremlin attack, hidden as a sound cue *even when hidden visually*) → resolution layer (on win).
- **The game's harmonic sense is its physics**: the logical-state fidelity drives harmony. High fidelity = consonant major-7 chords; low fidelity = detuned and dissonant. Each bot has a note in a pentatonic set, so a LISTEN BEEP plays that bot's note. A syndrome pattern = a chord, and every correctable error has its own recognizable chord. Lights Out depends on this.
- **SFX list (contract)**: `boop, shush, spin, highfive, listen_beep, listen_quiet, reset, peek_collapse, gremlin_sneak, gremlin_flip, ghost_phase, wobble, test_pass, test_fail, level_win, ui_click, ui_hover, card_pick, card_drop, rewind, snap_measure, qubble_snore, qubble_giggle, schrodi_meow, glitch`.

## 9. Visual direction

- **2.5D isometric diorama**: a cozy daycare floor on a floating island at the edge of a starry universe. Soft, rounded shapes, thick friendly outlines, gentle gradients, drop shadows. (Vibes: 7 Billion Humans' inked whimsy × Monument Valley's clean isometric × Kirby.)
- **Palette anchored to the hackathon site**: paper `#f2f0eb`, ink `#0e0e0e`, ink-2 `#55524b`, red `#fe443d` (bots' BEEP light and Flipper); plus Sunny `#ffb72b`, Moony `#6c63ff`, Phasey `#b04dff`, mint `#3ddc97` (pass), night sky `#1a1a2e`.
- **Fonts**: `Quantum` (display; site font; covers only A–Z a–z 0–9 ! ? and accented Latin, so use it for titles, buttons and big numbers) and `Quicksand` (body, code cards and everything else).
- **Juice**: squash-and-stretch, little particles on high-five, screen shake on collapse, gremlin smear frames.

## 10. Tech

- Vite + TypeScript, plain Canvas2D for the scene and DOM for the UI. No heavy engine. Hosted as static files (GitHub Pages / any static host). One click to play.
- `vitest` for tests. **Physics correctness is tested**: the simulator is checked against known identities, and every level's reference solution is verified to pass every test case. The intended "wrong" solutions are verified to fail.
- Directory ownership (agents only edit their own area; contracts live in `src/core/` and are owned by the director):
  - `src/core/` → **Director** (contracts, shared types). Request changes by writing to `docs/CONTRACT_REQUESTS.md`.
  - `src/quantum/`, `tests/quantum/`, `scripts/verify-levels.ts` → **Quantum Expert & Tester**
  - `src/engine/`, `src/ui/`, `src/main.ts`, `index.html`, `src/styles/` → **Programmer**
  - `src/art/`, `public/art/` → **Art Designer**
  - `src/audio/`, `public/audio/` → **Audio Designer**
  - `src/levels/` → **Level Designer**
  - `docs/` → everyone may append to their own file (`docs/<role>_NOTES.md`)
