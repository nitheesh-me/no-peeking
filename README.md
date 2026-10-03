# NO PEEKING!

**Repair a dream you're not allowed to look at.**

*quriosity 2026 (ISAQC × Infinium, IIIT Hyderabad) · **Option 06: Error Syndromes and parity probes***

▶ **Play:** https://nitheesh-me.github.io/no-peeking/ · 🎬 **Video:** _link goes here_

---

You are the night-shift caretaker at the **Qubble Daycare**. Qubbles are gooey little creatures that dream two dreams at once. At night, gremlins sneak in and mess with those dreams. You may not look: **peeking wakes a Qubble, and its double-dream collapses forever.**

So you program squeaky **Ancillabots** to high-five the sleeping Qubbles and beep back clues. From those clues alone, you fix the damage blind.

That is quantum error correction. You just did it by accident.

## For judges: a 3-minute tour

1. **Open the game** (no install): https://nitheesh-me.github.io/no-peeking/
2. **Unlock everything:** ⚙ Settings → **"Unlock all content!"** (judge mode: every level, the Codex, Nerd mode).
3. **The core idea in two levels:**
   - **1-1 "Don't Wake Them"**: PEEK a Qubble and watch its superposition collapse (measurement).
   - **2-3 "Who Got Flipped?"**: two bots ask parity questions, and you fix a bit flip you never saw (the 3-qubit bit-flip code). Press **Test all**, then open a failed or passed night in **X-ray** to see what really happened.
4. **For the physics-minded:** turn on **Nerd** in a level to open *Schrödi's Lab Notebook*, with the state vector, Bloch spheres, entanglement, the live quantum circuit, stabilizers, and **Export to Qiskit / OpenQASM 3**.
5. **The Codex** (📖 on the title or map): every character, object and card, with an interactive 3D Bloch sphere and an honest "In real life" note.

## What's inside

- **16 levels in 5 chapters**, from classical majority vote to the **Shor 9-qubit code**, each verified against every correctable error. Plus a **Night Shift** endless mode and a **Gremlin Lab** sandbox.
- **Every card is a real gate** (X, Z, H, CNOT, measurement, reset, classical feed-forward), and every program is tested like real code against random nights.
- **Hiding is the mechanic.** Qubbles stay under blankets (you can't look); **X-ray** is labelled as a simulator-only view.
- **Learning aids:** a ❓ Card Guide with annotated card anatomy and step-through demos, escalating hints, a threshold chart, and "Pros call this…" lines linked to Qiskit and IBM Quantum Learning.
- **Feel:** a 2.5D daycare diorama, a caretaker who walks to and performs every card, adaptive procedural music and "Qubblese" voices, and meta beats (the title letters collapse when you hover; a final level is played by ear).

## How to play

1. Drag command cards into your bots' program (like *7 Billion Humans*).
2. Press **Run Night**. The lights go out, the gremlins strike, and your bots listen.
3. Press **Test**. Your program runs against many random nights: random dreams × every gremlin attack.
4. Watch the **X-ray replay** to see what really happened under the blankets (a simulator-only view: no real experiment can watch this without disturbing it).

| Card | What it does in the game | What it really is |
|---|---|---|
| BOOP | flips a dream | X (bit-flip) gate |
| SHUSH | flips the swirl | Z (phase-flip) gate |
| SPIN | turns the dream sideways | Hadamard gate |
| HIGHFIVE q → a | a flips if q is Moony | CNOT |
| LISTEN a | the bot beeps or stays quiet | measuring an ancilla |
| RESET a | wipes the bot | reset to \|0⟩ |
| PEEK q | look at a Qubble (it wakes!) | measuring a data qubit (collapse) |
| IF / JUMP | branch on beeps | classical feed-forward on the syndrome |

## What we learned in hours 0–3

_(Team: fill in with your real "wait, what?" moments. Draft prompts below.)_

- **"Wait, you can't just copy it?"** The classical fix for noise is to keep three copies and take a vote. The no-cloning theorem forbids copying an unknown qubit. A CNOT doesn't copy |+⟩; it entangles. So the repetition code does not store three copies of the state. It *spreads one state* across three qubits: α|000⟩ + β|111⟩.
- **"How do you find an error without looking?"** You ask a *parity* question ("do qubits 1 and 2 agree?") instead of a value question ("what is qubit 1?"). An ancilla collects the parity through two CNOTs. Measuring it reveals the syndrome but nothing about α or β, so the superposition survives.
- **"Phase errors are invisible?!"** The bit-flip code is blind to Z errors: every syndrome comes back quiet, yet the state is wrong. A Hadamard on every qubit swaps the roles of X and Z, so the same trick works sideways (the phase-flip code). Nest both and you get Shor's 9-qubit code.
- **"Continuous errors become discrete?!"** A *small* rotation error becomes, once the syndrome is extracted and read, either "no error" or "a full flip". The entangling gates remove the half-flip's coherence; the readout picks which. Both of those we can fix. This is why QEC works at all, and it was our biggest "ohhh".
- **"Codes aren't magic."** With two errors, the decoder confidently fixes the wrong qubit. The code only helps when the physical error rate p is low: the logical failure rate is 3p² − 2p³, which beats p only when p < ½.

## How the idea became the game

- **The hidden information *is* the mechanic.** The data qubits are under blankets, and the player can't look, just as a real QEC circuit can't. The only window onto the data is the syndrome the bots beep back.
- **Every verb is a gate, and every win is a fidelity check.** Under the hood is a real state-vector simulator (up to 17 qubits). A level is passed only if the final data state has fidelity ≥ 0.999 with the ideal state, across random input states × every correctable error.
- **Each idea is taught by letting the player break it first:** peek and collapse; "copy" and get entangled twins; check bits and miss Phasey's phase flip; meet the coherent "Wobbles" error and watch the syndrome squash it.
- **The physics is accurate and tested.** The automated tests check gate identities, the no-cloning demo, the bit-flip, phase-flip and Shor-9 codes against every single error, error discretization, and the 3p² − 2p³ curve. Every level's reference solution must pass, and every "tempting wrong answer" must fail.

## Physics accuracy

Every Qubble and every Ancillabot in NO PEEKING! is a real qubit in an exact state-vector simulation
(complex amplitudes, double precision, up to 17 qubits). Every card is a real operation: BOOP = X,
SHUSH = Z, SPIN = Hadamard, HIGHFIVE = CNOT, LISTEN/PEEK = projective measurement in the computational
basis with Born-rule random outcomes and true collapse, RESET = reset to |0⟩. Gremlins apply real
errors: X (Flipper), Z (Phasey), Y (both) and *partial* rotations exp(−iθX/2) or exp(−iθZ/2) (Wobbles). Nothing is
faked: a level is won only if the final state of the Qubbles has fidelity ≥ 99.9% with the ideal
encoded state, checked on many test nights (random input states × every error the code should fix).
The bit-flip, phase-flip and Shor 9-qubit codes in the game are the textbook ones, and our test suite
verifies that they correct every single error, that two errors defeat the 3-qubit code, that
partial "wobble" errors are corrected perfectly (error discretization), and that the logical error rate
of the 3-qubit code matches the textbook 3p² − 2p³. Simplifications: gates themselves are perfect,
errors only strike during the "night" between encoding and correction, and measurement is perfect.

Details and conventions: [`docs/QUANTUM_NOTES.md`](docs/QUANTUM_NOTES.md).

## Further reading (linked in-game)

After you win a level, the "Pros call this…" line links its textbook terms to real material:

- Qiskit guide: [classical feedforward and control flow](https://quantum.cloud.ibm.com/docs/en/guides/classical-feedforward-and-control-flow) (the conditional X gate behind every IF → BOOP)
- Qiskit docs: [XGate](https://quantum.cloud.ibm.com/docs/en/api/qiskit/qiskit.circuit.library.XGate), [ZGate](https://quantum.cloud.ibm.com/docs/en/api/qiskit/qiskit.circuit.library.ZGate), [HGate](https://quantum.cloud.ibm.com/docs/en/api/qiskit/qiskit.circuit.library.HGate), [CXGate](https://quantum.cloud.ibm.com/docs/en/api/qiskit/qiskit.circuit.library.CXGate), [measuring qubits](https://quantum.cloud.ibm.com/docs/en/guides/measure-qubits)
- IBM Quantum Learning, *Foundations of quantum error correction*: [repetition codes](https://quantum.cloud.ibm.com/learning/en/courses/foundations-of-quantum-error-correction/correcting-quantum-errors/repetition-codes), [the Shor code](https://quantum.cloud.ibm.com/learning/en/courses/foundations-of-quantum-error-correction/correcting-quantum-errors/shor-code), [discretization of errors](https://quantum.cloud.ibm.com/learning/en/courses/foundations-of-quantum-error-correction/correcting-quantum-errors/discretization-of-errors)
- IBM Quantum Learning, *Basics of quantum information*: [no-cloning](https://quantum.cloud.ibm.com/learning/en/courses/basics-of-quantum-information/quantum-circuits/limitations-on-quantum-information), [entanglement](https://quantum.cloud.ibm.com/learning/en/courses/basics-of-quantum-information/multiple-systems/quantum-information)

## Run locally

```bash
npm install
npm run dev      # play at http://localhost:5173
npm test         # physics + level verification
npm run build    # static build in dist/ (host anywhere)
```

## Credits

Built during the quriosity 16-hour sprint by Nitheesh Chandra, with a crew of AI agents (Claude): director, quantum expert, programmer, art designer, audio designer and level designer. Fonts: *Quantum* (from the quriosity site) and *Quicksand*. All art and audio are procedural, made in code.
Inspirations: *7 Billion Humans*, *Baba Is You*, GMTK.
