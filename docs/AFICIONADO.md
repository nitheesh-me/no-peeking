# Technical Aficionado: DLC spec (Director)

> Branch `dlc/aficionado`. An optional, lazily loaded extension of NO PEEKING!: the same physics engine, a completely different presentation.
> **No characters, no anthropomorphism, no game metaphors.** Straight mathematics and accurate visualisation in a *neo-technical dreamscape* style: elegant, surreal, beautiful, mysterious.
> It must work as a **training environment** someone could use in a professional QEC course, while still delivering setup, anticipation and surprise.

## 0. Non-negotiables
1. **Zero degradation of the classic game.** The classic bundle must not grow by more than ~5 KB (baseline `index-*.js` = 489,901 bytes at v0.6). Everything else ships as separate chunks loaded only on entry. All classic tests, the 16-level playthrough and the visual behaviour stay unchanged.
2. **No lies.** Every number comes from the state-vector simulator (`src/quantum`). Anything that is not physically observable in a real experiment (amplitudes, the true state mid-circuit) is labelled **"simulator oracle: not observable on hardware"**. Measurements are projective and Born-rule sampled; nothing is faked for drama. Wherever a visual is a metaphor, it says so in its caption.
3. **No anthropomorphism.** No "Qubbles", "bots", "gremlins", "dreams", "waking". The vocabulary is: data qubits, ancilla qubits, noise channel (X/Z/Y/coherent rotation), syndrome, stabilizer, logical operator, fidelity, logical error rate.
4. **Swappable and localisable.** All DLC strings live in a content pack (`src/dlc/aficionado/content/<locale>.json`) accessed through `t(key, vars)`. All colours, typography and motion tokens live in a theme (`src/dlc/aficionado/theme/*.css` as CSS variables + `theme.ts` for canvas/WebGL colours). Visual modules read tokens; they never hard-code colours or copy. A second theme or locale must be a drop-in file.
5. **Accessible and professional.** Keyboard operable, reduced-motion respected (static fallbacks for every animation), WebGL fallback to 2D canvas/SVG when WebGL is unavailable, legible at 1280×720. A "Presentation / Lecture" toggle enlarges type for projectors.

## 1. Architecture
```
src/modes/registry.ts            (Director) tiny registry the classic title screen uses to offer the DLC entry; lazy import only
src/i18n/index.ts                (Director) t(key, vars), locale loading, fallback to 'en'
src/dlc/aficionado/
  manifest.ts                    entry: export async function mount(root, ctx) → () => void   (dynamically imported)
  loader/                        the loading sequence (real progress over real chunk loads)
  shell/                         the app shell: routing between Briefing, Lab, Bench, Archive, Settings
  editor/                        circuit editor (wires × time grid, drag gates) + QASM-like text view, two-way synced
  viz/                           three.js scenes + d3 charts (state space, Bloch, stabilizer tiling, lattice, threshold, MI graph)
  levels/                        DLC module curriculum (LevelDef-compatible + DLC metadata)
  content/en.json                every string
  theme/tokens.css, theme.ts     style tokens
src/quantum/**                   (Quantum) shared engine; additions must be backward compatible and tested
```
- The classic game imports only `src/modes/registry.ts` (a few hundred bytes). The registry exposes `{ id: 'aficionado', title, unlocked(save), load: () => import('../dlc/aficionado/manifest') }`.
- The DLC reuses `src/quantum` (`runNight`, `testLevel`, `{ nerd: true }` NerdInfo, `toQiskit` / `toOpenQASM3`) and the classic `LevelDef` shape. DLC levels may add metadata in a side table (code parameters `[[n,k,d]]`, stabilizer generators, logical operators, learning objectives).
- Persistence: its own localStorage namespace (`np.afi.*`), wrapped in try/catch. It never mutates classic save keys except to read progress for unlock gating.
- Libraries: three.js (WebGL scenes) and d3 (charts, scales, layouts) are loaded only inside the DLC chunk(s).

## 2. Entry, setup and anticipation (what to show, when)
| Moment | What the player sees | Why |
|---|---|---|
| Before finishing Ch.1 (classic) | Nothing. No hint the DLC exists. | Protect the classic first experience. |
| After Ch.1 is complete | A faint, slowly breathing glyph **⟨ψ|** in the title screen's lower-left corner. No label. Hover shows a tooltip: "an extension". | Curiosity: an unexplained artefact. |
| Click the glyph | The screen dims and a single line types: `load module: technical_aficionado`, then the loading sequence. | Commitment and ceremony. |
| Loading sequence | **The loading bar is a quantum circuit being assembled.** Each real loading stage (DLC core → three.js → d3 → shaders/fonts → content pack → level data) places one gate column on five wires. Progress text shows the real stage names and byte counts. The final stage measures every wire; the outcomes (real Born samples from a real small circuit) resolve into the DLC wordmark. | Honest progress (no fake percentages), and the first taste of the style. |
| First entry | A 20-second "orientation" in the dreamscape: a single Bloch sphere in fog, then the camera pulls back to reveal that it is one of many points in a vast, dim lattice (a visual metaphor for Hilbert space growing as 2ⁿ, captioned as a metaphor). Then the menu fades in. Skippable. | Wonder and scale; sets the tone. |
| Judge mode / unlock-all | The glyph is visible immediately. | Judges can reach everything. |

## 3. Inside the DLC: the curriculum ("Modules")
Each module is a lab exercise with a **Briefing** (objective, code parameters, noise model, gate set, success criterion and its statistical meaning), a **Lab** (circuit editor + live classical record), and a **Post-run analysis** (the oracle reveal).

| Module | Content | Reuses |
|---|---|---|
| M0 Calibration | single-qubit states, Bloch, projective measurement in Z/X/Y, Born statistics over N shots with confidence intervals | new |
| M1 No-cloning & entanglement | CNOT on |+⟩|0⟩, reduced states, mutual information, why repetition ≠ copying | classic 1-3/1-4 physics |
| M2 Parity measurement | ancilla-mediated Z₁Z₂ measurement, back-action-free parity readout | classic 2-1 |
| M3 [[3,1,1]] bit-flip code | encoder, stabilizers Z₁Z₂/Z₂Z₃, syndrome table, decoder; logical error rate vs p | classic 2-2..2-5 |
| M4 Phase-flip code & basis change | H-conjugation, X-type stabilizers | classic 3-1/3-2 |
| M5 Error discretisation | coherent rotations exp(−iθX/2), syndrome projection, fidelity = 1 after correction | classic 3-3 |
| M6 Shor [[9,1,3]] | concatenation, 8 generators, any single-qubit Pauli | classic 4-1 |
| M7 (new) Repeated syndrome extraction | **measurement errors**: noisy ancilla readout, why one round is not enough, majority over rounds | VM: optional readout-flip noise |
| M8 (new) [[5,1,3]] perfect code *or* Steane [[7,1,3]] | stabilizers XZZXI…, smallest code correcting any single error | VM: Y, S, CZ gates if needed |
| M9 (new, finale) Distance-3 rotated surface code | 9 data + ancillas (reused), X/Z plaquettes, logical operators as strings across the lattice, a full syndrome-extraction round | VM: ancilla reuse keeps the state vector ≤ ~13 qubits |
| Bench (sandbox) | build any circuit, choose noise p and type, run Monte Carlo (seeded, reproducible), plot logical vs physical error with Wilson intervals, export CSV/JSON/Qiskit/QASM3 | everything |

Scoring is professional: logical error rate with confidence interval, gate count, depth, ancilla count. Reproducible seeds are shown on every run. Exports work from anywhere.

## 4. Showing vs hiding (honest suspense)
- **During a run:** only what an experimenter could know: the circuit, the classical measurement record and syndrome history, and running statistics. The state-space visual is **veiled** (rendered as a dim fog with the caption "state not observable during execution").
- **Post-run analysis (the reveal):** the veil lifts with a slow, beautiful transition into the **simulator oracle view**: amplitudes as luminous pillars on the computational-basis lattice (height = |a|², hue = phase), Bloch spheres for reduced states, entanglement as filaments weighted by mutual information, stabilizer expectation values as a tiled surface. Always captioned "simulator oracle: not observable on hardware".
- **Progressive layers (surprise beats tied to modules):**
  - M1 unlocks the entanglement filaments: the first time I = 2 bits appears, the two filaments braid.
  - M3 unlocks the stabilizer tiling: syndrome flips light up tiles.
  - M5 slows down the projection of a coherent error, freezing on the frame where the off-diagonal terms vanish.
  - M6 adds the concatenated hierarchy view (3×3 blocks unfolding).
  - M9 is the finale reveal: the full surface-code lattice materialises as a glowing tessellation floating in the dreamscape, and a logical error appears as a luminous string spanning boundary to boundary.
- **What never shows before it's earned:** later-module visual layers, the finale lattice, the Bench's advanced noise models.

## 5. Style: neo-technical dreamscape
- **Palette:** deep ink-blue night (#070a16 → #0e1430), with luminous accents (phase hue wheel for amplitudes; cyan #6ef2ff and warm gold #ffcf6e as primaries; red only for errors). Classic site paper (#f2f0eb) appears as the "paper" colour of printed briefings and reports, linking the two modes.
- **Typography:** the site's **Quantum** font for module titles and the wordmark (Latin only), a precise monospace for math and code (e.g. "JetBrains Mono" via Google Fonts, or a system mono), and Quicksand for prose. Math rendered properly (kets, subscripts, ⊗, ⟨·⟩) via a small typesetting helper (no heavy TeX unless needed; KaTeX is allowed if it is lazy-loaded inside the DLC).
- **Motion:** slow and deliberate (ease-in-out 600–1200 ms), fog, depth of field, subtle bloom, particles that drift like dust in light. Never busy. Reduced motion means static compositions.
- **Surreal touches:** reflective floor of a dark sea under floating structures, horizon glow, stars that are actually basis states, all labelled honestly as decoration where they carry no data.

## 6. Agent ownership (on this branch)
| Area | Owner |
|---|---|
| docs/AFICIONADO.md, src/modes/registry.ts, src/i18n/, src/dlc/aficionado/contracts.ts | Director |
| src/dlc/aficionado/{manifest,loader,shell,editor}/, levels wiring, classic title hook | **DLC Engineer** |
| src/dlc/aficionado/viz/, theme/, fonts/shaders/assets, loading-bar visual, style guide doc | **Visual Director** |
| src/quantum/** additions (gates, readout noise, new codes, Monte Carlo + CI helpers), tests, **honesty audit** of all classic + DLC text | **Quantum Expert** |
| src/dlc/aficionado/content/en.json, src/dlc/aficionado/levels/ (module definitions, briefings, reference solutions, traps), curriculum doc | **Curriculum Author** |
| End-to-end QA, perf and bundle checks, a11y | Director (+ QA pass by the DLC Engineer) |
