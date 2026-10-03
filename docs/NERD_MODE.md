# Nerd Mode: "Schrödi's Lab Notebook" (Director's spec)

**Goal:** a full quantum info dump that a quantum nerd would *love*, revealed with suspense, and never in the way of normal play.

## The fiction
Nerd mode is Schrödi's secret lab notebook, found under his box. It is a drawer docked to the left edge of the stage, collapsed to a spine tab: "📓 Lab notebook". Opening it never covers the editor, the controls or the timeline, and it remembers whether it was left open.

## Showing vs hiding: the core rule applies to nerds too
| Mode | What the notebook shows |
|---|---|
| Blankets on (normal play) | **Only classical info**: the circuit wires and gates so far, the measurement record (bot BEEP/QUIET bits), syndrome bits. The state pages are drawn **blank with a 🙈 stamp**: "State hidden: the Qubbles are asleep. Turn on X-ray to read my notes." |
| X-ray (replay / after a run / toggled) | Everything: state vector, Bloch, entanglement, stabilizers, density matrices |
| Lights Out (4-2) | Only the syndrome bits, drawn as a waveform of beeps. The notebook "can't see in the dark either" |

There are no floating ⟨Z⟩ labels on the creatures any more. Per-qubit numbers appear only on hover in X-ray (a small tooltip), and live in the notebook.

## Progressive reveal (pages unlock as the player learns; no spoilers)
Each page unlock is a **surprise beat**: the notebook spine wiggles, a page tears in with a pencil-scribble animation, and Schrödi adds a marginal note.

| # | Page | Unlocks after | What it shows | Surprise beat |
|---|---|---|---|---|
| 0 | *(the notebook itself)* | 1-1 (first collapse) | The Nerd button appears for the first time | Schrödi: "Oh. You found my notes. Don't tell the Qubbles." |
| 1 | **State vector** | 1-1 | Typeset Dirac sum `0.85|000⟩|00⟩ + 0.53e^{i0.70}|111⟩|00⟩` (ket order legend: q1 q2 q3 · a b); amplitude bars with a **phase wheel** per term; probability histogram; ‖ψ‖ = 1 check | The first superposition the player saw gets written out |
| 2 | **Bloch** | 1-2 | Mini 3D Bloch spheres (createBloch3D) for every qubit, with ⟨X⟩ ⟨Y⟩ ⟨Z⟩, purity Tr ρ² and entropy S(ρ) | |
| 3 | **Entanglement** | 1-3 | Mutual-information heatmap I(A:B) between all qubits, per-qubit entropy bars, silk-thread legend | In 1-3 the failed "copy" lights up I = 2 bits: a sticker slaps on, **"NOT A COPY. ENTANGLED."** |
| 4 | **Circuit** | 2-1 | **"Your Bot Code is a quantum circuit."** Live circuit diagram (wires q1… then bots), gates X/Z/H, CNOT dots, measurement meters, classically-controlled X with double lines, gremlin errors as red boxes (X-ray only), and a step cursor synced to playback; card ↔ gate legend | The big reveal: the cards morph into gates on the first open |
| 5 | **Stabilizers & syndrome** | 2-3 | ⟨Z₁Z₂⟩, ⟨Z₂Z₃⟩ (and XX for phase codes), measurement record, an **auto-built syndrome table** from the player's own runs, and the logical fidelity meter | When a correction succeeds, a stamp: **"LOGICAL QUBIT SURVIVED ✓"** |
| 6 | **Threshold** | 2-5 | The logical vs physical error curve (reuse the Night Lab data), with your code's measured point | |
| 7 | **Density matrix** | 3-3 | Reduced ρ for any chosen qubit or pair as a Re/Im heatmap "cityscape" | Wobbles' half-flip: off-diagonals visible before LISTEN, then they **snap away** at the measurement: "error discretization, caught in the act" |
| 8 | **Export** | 4-1 | **Export to Qiskit** (Python) and **OpenQASM 3** for this night's executed path (the exact circuit that ran, errors optional), plus a copy button | "Take it to a real quantum computer." |

`save.flags.unlockAll` (judge mode) unlocks every page.

## Easter egg: the full DUMP
Click the notebook title 5 times (or type `|ψ⟩` while it is open): a hidden **"RAW DUMP"** page appears with a JSON viewer of the whole night (every TraceStep with its full NerdInfo) and a **Download .json** button. Schrödi: "Fine. Everything. Happy now?"

## Rules
- Normal play never changes: nerd off = zero visual or behavioural difference. The drawer only mounts when nerd mode is on.
- Accurate physics only. Every number comes from the simulator (`runNight(..., { nerd: true })` → `Snapshot.nerd`).
- Performance: NerdInfo is computed only when nerd mode is on. Cap the expensive parts (MI/density) for >10 live qubits and say so on the page ("17 qubits: showing data qubits only").
- Tone: Schrödi's dry marginalia in pencil; textbook names allowed here (it's the nerd zone), but always one plain-words line under each page title.
