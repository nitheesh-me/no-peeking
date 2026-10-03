# Honesty audit: physics claims in user-facing text (Quantum Expert)

Scope: src/levels/*.ts, src/ui/cardGuide.ts, src/ui/codexData.ts, src/ui/nerd/*, src/ui/bloch3d.ts, src/ui/screens/credits.ts,
README.md, src/dlc/aficionado/content/en.json (as of 2026-10-04, branch dlc/aficionado). Line numbers are from that snapshot.
Severity: **ERROR** = false as stated · **MISLEADING** = true only in a special case, or teaches a misconception · *nuance* = optional.

The four themes the Director asked about, in one place:
1. **Observability.** The X-ray view, the notebook's state pages and the DLC oracle show a *simulator-only* object. No experiment can see it without measuring (and disturbing) the qubits. The DLC labels this well. The classic game never says it (items C1 to C3).
2. **Cloning vs entangling.** The classic text is correct everywhere: 1-3, the cards, the codex and the README all say "shared, not copied".
3. **Listening to an ancilla is not automatically safe.** Whether it disturbs the data depends on what the circuit put on the ancilla (items B1, B2, D1). The 2-1 trap "Ask Qubble 2 alone" demonstrates exactly this, so the card text contradicts the game's own lesson.
4. **Timing of error discretisation.** The coherence between "no error" and "flipped" leaves the data at the **entangling gates** (it moves into data–ancilla correlations). The **readout** then selects one branch. Several texts put the vanishing of the off-diagonals at the measurement (items A1, A2, D2, E1 to E3). The notebook's density page (notebook.ts:485) already has this right and is the model for the fixes.

---

## A. Classic levels (src/levels)

| # | File:line | Current | Proposed | Why |
|---|---|---|---|---|
| A1 | ch3.ts:195 (3-3 hint 2) | "Watch the Qubble right when the bot LISTENs. Is it still half flipped after that?" | "Watch the Qubble during the bots' high-fives and their LISTEN. The high-fives tie the half-flip to the bots; the LISTEN picks a side." | **MISLEADING.** In X-ray, the data's reduced state stops being a coherent half-flip at the HIGHFIVEs (it becomes a mixture of "flipped" and "not flipped"). The LISTEN only selects the branch. A player who watches only the LISTEN sees the wrong moment. |
| A2 | ch3.ts:202 (3-3 reveal) | "Listening forces a half-flip to become a full flip or no flip. …" | "Asking about the damage turns a half-flip into a full flip or no flip: the high-fives tie the two possibilities to the bots, and listening picks one. Both are fixable." | **MISLEADING** (timing), as A1. The proTerm line 203 ("Syndrome measurement projects…") is fine if "syndrome measurement" means the whole extraction. |
| A3 | ch3.ts:196 (3-3 hint 3) | "Listening forces the half-flip to pick a side." | "The high-fives and the LISTEN together force the half-flip to pick a side." | *nuance*, same point as A1. |
| A4 | ch3.ts:206 (3-3 trap name) | "Do nothing (half-flips add up)" | "Do nothing (a half-flip is still damage)" | **MISLEADING.** There is exactly one wobble per night in this level, so nothing "adds up". Doing nothing fails because one partial rotation leaves fidelity cos²(θ/2) < 0.999. |
| A5 | ch2.ts:46 (2-1 hint 2) | "A bot that high-fives BOTH Qubbles flips twice if they agree, and once if they do not." | "A bot that high-fives BOTH Qubbles flips an even number of times (0 or 2) if they agree, and exactly once if they do not." | **ERROR** as stated. If both are Sunny the bot flips 0 times, not twice. |
| A6 | ch4.ts:214 (4-2 proTerm) | "Pros call this: fault-tolerant thinking. Syndrome extraction plus a decoding table, run blind." | "Pros call this: blind syndrome extraction and decoding, the core loop of quantum error correction. (Full fault tolerance also survives faulty gates and faulty readouts.)" | **ERROR (term).** "Fault tolerance" specifically means tolerating faults inside the correction circuit (gates, measurements). Gates and readout are perfect here. |
| A7 | ch4.ts:213 (4-2 reveal) | "A real quantum computer never sees its data. It only hears the clues, and that is enough." | "While it protects its data, a real quantum computer never looks at it. It only hears the clues, and that is enough." | *nuance.* Real experiments do measure the data qubits at the end (final logical readout). |
| A8 | ch4.ts:154 (4-1 win) | "That is a real quantum memory." | "That is how a real quantum memory works, in miniature." | *nuance.* This is one round, perfect gates and one error per night. |
| A9 | ch1.ts:25, README:11, cardGuide.ts:58 | "dreams two dreams at once" / "both dreams at once" | (optional) "dreams a blend of two dreams" / "is in a superposition of both dreams" | *nuance.* "Both at once" is the most common superposition misconception. It is acceptable as a cartoon, but the Codex entry (codexData.ts:91) should keep the precise version, which it does. |

All other level text checked and correct, including 1-2's "Flipper cannot flip a sideways dream" (inputs |0⟩/|1⟩ only, so SPIN·X·SPIN = Z is harmless) and 2-5's 3p² − 2p³ < p ⇔ p < ½ with p = 0.1 → 2.8%.

## B. Card Guide (src/ui/cardGuide.ts)

| # | Line | Current | Proposed | Why |
|---|---|---|---|---|
| B1 | 78 (LISTEN tip) | "Listening to a bot is safe: it's a bot, not a Qubble." | "Listening never wakes a Qubble by itself, but it is a real measurement. If the bot copied ONE Qubble, listening reads (and collapses) that Qubble. Safe questions compare two Qubbles." | **ERROR.** Measuring an ancilla that is entangled with one data qubit's value collapses the data. This is the game's own 2-1 trap. |
| B2 | 154 (peekTips) | "PEEK at a bot instead of a Qubble and nothing wakes up: bots don't dream. It works just like LISTEN." | "PEEK at a bot instead of a Qubble and no Qubble is marked awake. It works just like LISTEN: a real measurement, so a bot tangled up with a Qubble's dream still disturbs it." | **MISLEADING**, same physics as B1. |
| B3 | 85 vs 90 vs 91 (RESET) | "it forgets everything. Back to QUIET" · "A bot still remembers its last BEEP until you RESET it." · "IF still sees the last LISTEN result after a RESET…" | what: "Press a bot's button and its qubit goes back to \|0⟩, ready to help again. (Its light keeps showing the last LISTEN.)" · tip 90: "A bot's qubit still holds its last answer until you RESET it: high-fiving it again would add to it." | **ERROR / contradiction.** The VM keeps the light after RESET (tip 91 is right). The card's "what" and tip 90 say RESET clears it. |
| B4 | 36 (BOOP tip) | "Booping a swirly Qubble leaves the swirl alone." | "Booping a sideways (\|+⟩ or \|−⟩) Qubble leaves it alone. It only swaps Sunny and Moony." | *nuance.* X leaves \|±⟩ unchanged (up to a global phase) but maps \|+i⟩ to \|−i⟩. |

## C. Classic UI captions: X-ray is a simulator superpower (not observable)

| # | Where | Current | Proposed |
|---|---|---|---|
| C1 | src/ui/screens/level.ts:69 (X-ray button title) | "X-ray: see the true dreams (X)" | "X-ray: see the true dreams (X). Simulator only: a real lab can't see this without measuring." |
| C2 | src/ui/settings.ts:32 | "for replays and the curious (spoils the blanket!)" | "for replays and the curious (spoils the blanket! Only a simulator can do this)" |
| C3 | README.md:22 | "Watch the **X-ray replay** to see what really happened under the blankets." | "… under the blankets (a simulator-only view: no real experiment can watch this without disturbing it)." |
| C4 | src/ui/nerd/notebook.ts state pages (hiddenView, line 194) | (no caveat once X-ray is on) | Add one pencil line on the State/Bloch/Entanglement/Density pages: "Simulator notes: a real lab only gets the bots' beeps." |

**MISLEADING by omission.** The DLC already does this correctly (`afi.oracle.explain`, `afi.orientation.c5`, `afi.lab.judgedByOracle`).

## D. Codex (src/ui/codexData.ts)

| # | Line | Current | Proposed | Why |
|---|---|---|---|---|
| D1 | 143 (LISTEN) | "…safe, because the ancilla only holds parity information." | "…safe when the high-fives put only parity information on the ancilla. If a bot copied a single data qubit, listening would measure that qubit." | **MISLEADING**, as B1. |
| D2 | 77 (Wobbles) | "measuring the syndrome forces the wobble to become either 'no error' or 'a full flip'…" | "syndrome extraction ties the 'no error' and 'full flip' possibilities to the ancillas, and reading them selects one: no error or a full flip, which the code can fix." | Timing (theme 4). |
| D3 | 129 (time) | "Error correction has to find and fix errors faster than they appear (the threshold idea)." | "Error correction has to find and fix errors faster than they pile up. The threshold theorem says this works once the physical error rate is below a threshold: then bigger codes give exponentially fewer logical errors." | **MISLEADING** definition of threshold. |
| D4 | 95 (entanglement) | "so no single error can read or ruin it" | "so no single-qubit error can reveal or ruin it" | *nuance* (wording). |
| D5 | 144 (RESET) | "RESET is mid-circuit measurement and reset" | "RESET puts a used ancilla back to \|0⟩ (on hardware: measure and flip if needed, or an active reset pulse)" | *nuance.* Reset is not necessarily a measurement. |

## E. Notebook / nerd (src/ui/nerd)

| # | Line | Current | Proposed | Why |
|---|---|---|---|---|
| E1 | notebook.ts:440 | "…Real codes chase the same crossing (the threshold)." | "…This crossing is a pseudo-threshold. The real threshold is where bigger codes start beating smaller ones." | **MISLEADING** term. The DLC text (bench.tasks.pseudothreshold) already makes this distinction. |
| E2 | notebook.ts:485 | "The half-flip's coherence just leaked into the bot. From here on it is either flipped or not…" | (keep) optionally add "…and the LISTEN will say which." | Correct, and the model for A1/A2/D2. |

## F. README

| # | Line | Current | Proposed | Why |
|---|---|---|---|---|
| F1 | 42 | "A *small* rotation error, measured by the syndrome, collapses into either 'no error' or 'a full flip'." | "A *small* rotation error becomes, once the syndrome is extracted and read, either 'no error' or 'a full flip'. The entangling gates remove the half-flip's coherence; the readout picks which." | Timing (theme 4). |
| F2 | 58 | "*partial* rotations exp(−iθX/2) (Wobbles)" | "*partial* rotations exp(−iθX/2) or exp(−iθZ/2) (Wobbles)" | **Incomplete.** Level 4-2 uses Z-axis wobbles. Fixed in docs/QUANTUM_NOTES.md already. |
| F3 | 65 | "…and measurement is perfect." | add: "(The Technical Aficionado extension adds readout errors and repeated noise rounds.)" | Keeps the accuracy statement true once the DLC ships. |

## G. DLC content (src/dlc/aficionado/content/en.json)

Overall very good: correct formulas, honest captions, and the right pseudo-threshold vs threshold distinction. I checked the
M0–M9 numbers and identities: H S† for Y; XX·ZZ = −YY; (HS†⊗HS†)|Φ⁺⟩ = |Ψ⁺⟩; fidelity ½ for measure-and-prepare; cos²(θ/2);
3p² − 2p³ = 0.028; 1 + 3·5 = 16; both Shor logicals; the five-cycle graph-state encoder and its logical mapping; and the
surface-code generators, logicals and the X₂X₅X₈ equivalence. Items:

| # | Key | Current | Proposed | Why |
|---|---|---|---|---|
| G1 | afi.viz.captions.freeze | "The syndrome measurement projects the coherent error: the off-diagonal terms vanish at this frame. What remains is either no error or a definite Pauli error." | "The extraction gates entangle the 'no error' and 'X error' branches with the ancilla: at this frame the data's off-diagonal terms vanish (the coherence now lives in the data–ancilla correlation). The readout then selects one branch: no error, or a definite Pauli error." | **ERROR (timing).** The data's reduced off-diagonals vanish at the last entangling gate, not at readout. |
| G2 | afi.modules.M5.ex.M5-1.analysis | "Projection-freeze layer: slow the ancilla readout, freeze on the frame where the off-diagonal terms … vanish." | "Projection-freeze layer: slow the extraction, freeze on the CNOT after which the off-diagonal terms between code space and error space vanish from the data's reduced state; then the readout picks a branch with probabilities cos²(θ/2), sin²(θ/2)." | Same as G1. **The Visual Director should freeze on the last extraction CNOT, not on the measurement.** |
| G3 | afi.modules.M5.analysis.oracle | "…The frame freezes where the off-diagonal terms vanish." | (fine if G2's frame is used) add "…which happens at the entangling gates; the readout then chooses." | Same as G1. |
| G4 | afi.modules.M5.objectives.3 | "Recognise that the syndrome measurement itself performs the discretisation." | "Recognise that syndrome extraction performs the discretisation: the entangling gates remove the coherence between branches from the data, and the readout selects one." | Precision (theme 4). |
| G5 | afi.modules.M2.summary | "…with an ancilla, without learning, or disturbing, either qubit." | "…with an ancilla, without learning either qubit's value. Only superpositions of different parities are disturbed." | **MISLEADING.** A parity measurement projects onto a parity sector. M2.objectives.2 states this correctly. |
| G6 | afi.map.teasers.M9 | "The architecture of current hardware." | "The layout most current hardware experiments use." | Overclaim. It is the leading approach, not the universal one. |
| G7 | afi.modules.M7.ex.M7-2.briefing.context, traps.singleRound | "p + q − 2pq ≈ 0.069" · "about 2q ≈ 8%" | Fill these numbers from {p},{q} at runtime (or check them against the level's p and q). | Hard-coded numbers drift when p/q change. With q = 0.04, 2q = 7.8% ✓; 0.069 implies p ≈ 0.031. Also say that the unencoded baseline includes its own readout, while the encoded criterion is final-state fidelity: a fair but different metric. |
| G8 | afi.modules.M7.ex.M7-2.term, M7.ex.M7-2.reveal | "fault-tolerant syndrome extraction" / "Fault tolerance turns…" | keep; M7.analysis.honesty already states the restricted model. | OK, because of the honesty note. |

## H. Fixed directly in my own files
- docs/QUANTUM_NOTES.md: the physics statement now lists Z-axis wobbles and the DLC's readout and noise-round extensions.
- src/quantum/nerd.ts: 9-qubit DLC levels are no longer labelled with Shor generators when `LevelDef.stabilizers` is set (approved contract addition).
