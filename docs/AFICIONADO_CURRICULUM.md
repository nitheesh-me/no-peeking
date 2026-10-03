# Technical Aficionado: curriculum (Curriculum Author)

Ten modules, 23 exercises, every one verified by `tests/dlc/levels.test.ts` against the exact state-vector simulator:
each reference solution passes the full test suite for seeds 1, 2, 3, and each trap (a named misconception) fails for a
physics reason, never a malformed program. Copy lives in `src/dlc/aficionado/content/en.json`; definitions in
`src/dlc/aficionado/levels/`. Integration details for the shell are in `docs/AFICIONADO_NOTES.md`.

## Model and its honest limits
- Gates and (unless stated) readout are perfect; data errors strike between preparation and recovery
  (the *code-capacity* model). M7 adds readout faults. Faulty gates and between-round data noise are not modelled
  in the curriculum (the engine's `WAIT`/`rounds` exist for the Bench).
- Pass/fail is judged by the simulator against the ideal state (fidelity), which a laboratory could only estimate by
  tomography over many runs. The copy says so (`afi.lab.judgedByOracle`).
- **Exhaustive criteria**: "fidelity ≥ 0.999 on all N enumerated trials" = every input × every error case is simulated
  (a `random` input expands to 4 seeded Haar states); only measurement outcomes are sampled.
- **Monte Carlo criteria**: pass rate ≥ minRate over N trials, chosen so that, at the threshold, the 95% Wilson upper
  bound of the logical error rate is below the stated reference rate (tested).
- Criterion sentences take their numbers from `criterionVars(level)`, so the copy cannot drift from the definition.

## Modules
| Module | Exercise | Task | Trials | Traps (must fail) |
|---|---|---|---|---|
| **M0 Calibration** · unlocks `bloch` | M0-1 | prepare \|−⟩ from \|0⟩ | 1 | H then X; Z only |
| | M0-2 | X-basis readout (H) | 10 | no rotation; H twice |
| | M0-3 | Y-basis readout (H S†) | 10 | H only; S instead of S† |
| **M1 No-cloning & entanglement** · `filaments` | M1-1 | Bell pair \|Φ⁺⟩ | 1 | CNOT before H; H⊗H product |
| | M1-2 | fan-out α\|00⟩+β\|11⟩ (data measurement allowed) | 13 | measure-and-reprepare (mixture, F = ½ on \|+⟩); reversed CNOT |
| | M1-3 | Bell tomography: rotate for ⟨YY⟩ | 1 (+ shots in 3 bases) | H⊗H (measures XX); one-sided rotation (YZ) |
| **M2 Parity measurement** | M2-1 | Z₁Z₂ via ancilla, `state+report` goal | 39 | measure data directly; couple q2 only |
| | M2-2 | X₁X₂ by phase kickback, fix Z on q2 | 26 | Z-type check (collapses); fix with X |
| **M3 [[3,1,1]] bit-flip** · `stabilizer-tiling`, `threshold` | M3-1 | encoder | 13 | one CNOT; measure-and-copy |
| | M3-2 | syndrome decoding | 52 | measure data directly; decode the wrong qubit |
| | M3-3 | p_L at p = 0.1, N = 2000, minRate 0.913 | MC | no decoder (≈0.73); one stabilizer (≈0.81) |
| **M4 Phase flip & basis change** | M4-1 | encoder α\|+++⟩+β\|−−−⟩ | 13 | no Hadamards; H before fan-out |
| | M4-2 | phase-flip correction | 52 | bit-flip decoder (ignores phase); frame not restored |
| **M5 Discretisation** · `projection-freeze` | M5-1 | coherent exp(−iθX/2), θ ∈ {0.3, 0.9, 1.6, 2.5} | 169 | no decoder; one stabilizer |
| | M5-2 | coherent exp(−iθZ/2) on the phase code | 169 | Z-type decoder; no decoder |
| **M6 Shor [[9,1,3]]** · `concatenation` | M6-1 | concatenated encoder | 13 | no outer H; inner blocks only |
| | M6-2 | any single X/Y/Z, 2 reused ancillas | 224 | bit-flip layer only; phase layer only |
| **M7 Repeated extraction** (new) | M7-1 | one fault: data X **or** one wrong readout (enumerated); 2 rounds + tie-break round | 130 | single round; trust the second round |
| | M7-2 | MC: p = 0.03, q = 0.04, N = 1000, minRate 0.95 (Wilson upper < p+q−2pq) | MC | single round (≈0.925) |
| **M8 [[5,1,3]] perfect code** (new) | M8-1 | 5-cycle graph-state encoder (fan-out, H⊗5, CZ ring) | 13 | open chain; no fan-out |
| | M8-2 | XZZXI-type checks (CNOT + CZ), 15-entry lookup decoder | 208 | X-only table (ignores phase); three generators (collisions) |
| **M9 Surface code d = 3** (new, finale) · `lattice` | M9-1 | apply X̄ as a column string (any column passes) | 13 | single X; row string |
| | M9-2 | full round: 4 Z-checks → fix X → reset → 4 X-checks → fix Z | 224 | measure data directly; Z-checks only |

Prerequisites: M0 → M1 → M2 → M3 → {M4 → M5 → M6 → M8, M7}; M9 needs M7 and M8.

## Codes (as built here)
- **[[5,1,3]]**: stabilizers XZZXI, IXZZX, XIXZZ, ZXIXZ. Encoder |0⟩ ↦ |C₅⟩ (5-cycle graph state), |1⟩ ↦ Z⊗5|C₅⟩;
  the code stabilizers are the products KᵢKᵢ₊₂ of the graph stabilizers Kᵢ = Zᵢ₋₁XᵢZᵢ₊₁. In this basis Z̄ = X⊗5, X̄ = Z⊗5
  (up to sign). Tests check: all 15 single-qubit errors have distinct syndromes, the encoder output has ⟨S⟩ = +1.
- **Rotated surface code d = 3** on q1…q9 (row-major 3×3): X checks {1,2,4,5} {5,6,8,9} {2,3} {7,8}; Z checks
  {2,3,5,6} {4,5,7,8} {1,4} {6,9}; X̄ = X₁X₄X₇, Z̄ = Z₁Z₂Z₃. Encoder: fan out X̄ from q1, then (I + Sₓ) per X generator via
  pivots q2, q3, q8, q6. Tests check commutation, logical anticommutation, ⟨S⟩ = +1 for all 8 generators.
- Generic helpers (`codes.ts`): `measureStab` (Z-only via CNOT into the ancilla; mixed via |+⟩ ancilla with CNOT/CZ),
  `lookupDecoder` (first error per syndrome, Y fixed as X·Z), `syndromeOf`, `anticommutes`.

## Post-run analysis (what the oracle view should highlight)
Each exercise has `…analysis` copy, each module `analysis.oracle`. Beats tied to layers: M1-1 first I = 2 bits (filaments
braid); M3 tiles light on syndromes; M5 freeze where off-diagonal terms between code and error space vanish (branch
probabilities cos²(θ/2), sin²(θ/2)); M6 3×3 hierarchy; M7 syndrome history as a time grid with the faulty bit marked
after the run; M9 lattice tessellation, X̄ as a luminous string, and (Bench) a two-error trial completing a logical string.

## Bench tasks (`AFI_BENCH_TASKS`)
pseudo-threshold of the repetition code (analytic p* = ½), readout noise one vs three rounds (linear vs quadratic in q),
surface code d = 3 pseudo-threshold (with the honest note that a true threshold needs several distances, beyond this
simulator's ~17-qubit state vector).

## Translator notes
`_meta.glossary` in `en.json` lists terms that must not be translated literally; `_meta.notes` covers variables,
notation and the honesty captions. No arrays anywhere: hints are `hints.1`, `hints.2`.
