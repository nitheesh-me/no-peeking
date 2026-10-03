# Quantum notes (Quantum Expert & Tester)

Code: `src/quantum/` (`sim.ts` simulator, `vm.ts` interpreter + goals + test suites, `text.ts` parser/printer,
`reference.ts` reference programs, `index.ts` public API). Tests: `tests/quantum/` (`npx vitest run tests/quantum`).

## Physics accuracy statement (for the README)

> Every Qubble and every Ancillabot in NO PEEKING! is a real qubit in an exact state-vector simulation
> (complex amplitudes, double precision, up to 17 qubits). Every card is a real operation: BOOP = X,
> SHUSH = Z, SPIN = Hadamard, HIGHFIVE = CNOT, LISTEN/PEEK = projective measurement in the computational
> basis with Born-rule random outcomes and true collapse, RESET = reset to |0⟩. Gremlins apply real
> errors: X (Flipper), Z (Phasey), Y (both) and *partial* rotations exp(−iθX/2) or exp(−iθZ/2) (Wobbles). Nothing is
> faked: a level is won only if the final state of the Qubbles has fidelity ≥ 99.9% with the ideal
> encoded state, checked on many test nights (random input states × every error the code should fix).
> The bit-flip, phase-flip and Shor 9-qubit codes in the game are the textbook ones, and our test suite
> verifies that they correct every single error, that two errors defeat the 3-qubit code, that
> partial "wobble" errors are corrected perfectly (error discretization), and that the logical error rate
> of the 3-qubit code matches the textbook 3p² − 2p³. Simplifications: gates themselves are perfect,
> errors only strike during the "night" between encoding and correction, and measurement is perfect.
> (The Technical Aficionado DLC adds optional readout errors and several noise rounds; see "DLC additions".)

## Conventions

- **Qubit names**: data qubits `q1..q9` (Qubbles), ancillas `a..h` (bots). The simulator never exposes bit positions;
  everything is keyed by id.
- **Single-qubit states**: `|ψ⟩ = cos(θ/2)|0⟩ + e^{iφ} sin(θ/2)|1⟩`. Presets: zero (θ=0), one (θ=π), plus (π/2, 0),
  minus (π/2, π), plusI (π/2, π/2), minusI (π/2, −π/2). `'random'` = Haar random: θ = acos(1−2u), φ = 2πv.
- **Gates** (exact matrices): X, Z, H = (X+Z)/√2, CNOT(control=from, target=to), Y = [[0,−i],[i,0]] = iXZ.
  Wobble: `exp(−i·angle/2·σ)`, σ = X (axis 'x', default) or Z (axis 'z').
- **Bloch vector** (`Snapshot.bloch`): reduced state ρ = (I + xX + yY + zZ)/2, so x = 2Re ρ01, y = −2Im ρ01,
  z = ρ00 − ρ11. z = +1 is Sunny |0⟩, z = −1 Moony |1⟩. Length < 1 ⇔ the qubit is entangled with something.
- **Links** (`Snapshot.links`): von Neumann mutual information I(A:B) = S(A)+S(B)−S(AB) of the 2-qubit reduced state
  (eigenvalues of the 4×4 ρ_AB by Jacobi). Drawn if I > 0.1 bit; `strength = I/2` ∈ [0,1].
  Bell pair: strength 1. GHZ (any pair): 0.5 (classical correlation only).
- **Amplitudes** (`Snapshot.amps`): top 8 by probability. Ket label = Qubble bits in the level's `qubbles` order
  (leftmost = first Qubble, usually q1), then `|a=0,b=1` for bots in the level's `bots` order, e.g. `011|a=1,b=0`.
  Global phase is fixed so that the largest amplitude is real and positive.
- **Snapshot.logicalFidelity**: fidelity of the current data state with the *ideal* final target (no errors).
  So it is low during an unencoded bedtime, 1 after encoding, drops when a gremlin strikes, back to 1 after a fix.

## VM semantics

- **Phases**: bedtime → night → morning. In each of bedtime/morning the code that runs is `fixed<Phase>` (if any)
  **followed by** the player's program (if the phase is editable), as one phase. Labels are local to each part.
  `line` trace events carry `part: 'fixed' | 'mine'` and `pc` indexes into that part. `END` ends the current phase
  (the night still happens after a bedtime `END`).
- **Lights**: `LISTEN`/`PEEK` set `lights[t]` to the outcome. `RESET` does **not** change the light (the light is the
  bot's memory of its last LISTEN). `IF x BEEP` ⇔ light 1; `IF x QUIET` ⇔ light 0 **or never measured**.
  Conditions may name a peeked Qubble.
- **PEEK** on a Qubble when `!classical && !allowPeekData`: the measurement really happens (collapse) and the Qubble
  is marked woke ⇒ the night fails `'woke'`.
- **Errors** (`failReason: 'error'`, with `message`): LISTEN/RESET on a non-bot, a creature not in the level,
  unknown label, `HIGHFIVE x -> x`, non-unitary ops in a `targetCircuit`.
- **Steps**: every executed op except LABEL/NOTE. Total over both phases > `maxSteps` (default 500) ⇒ `'maxSteps'`.
- **Fail priority**: error > maxSteps > woke > wrong-dream > wrong-report.
- **RESET** is implemented as measure-then-flip-if-1. Averaged over runs this *is* the reset channel; in a single run
  it is one Born-rule trajectory (so resetting an entangled bot can disturb the data, as it physically would).
- **Randomness**: one seeded PRNG per night (`seed`); measurement outcomes and a `'random'` input are drawn from it.
  `runNight(level, prog, input, errors, seed)` reproduces a test night exactly (every `NightResult` carries `seed`).

## Goals

- **Target**: run `targetCircuit` on (input on `inputQubble`, every other qubit |0⟩); the target is the reduced state on
  `goal.dataQubits` (all other qubits traced out). If it is pure, fidelity = ⟨t|ρ_data|t⟩ with ρ_data the reduced
  state of the simulation (bots and other Qubbles traced out). If the reduced target is mixed (only allowed for one
  data qubit), we use the Uhlmann fidelity F = Tr(ρσ) + 2√(det ρ det σ).
- **'state'**: pass ⇔ fidelity ≥ `minFidelity` (default **0.999**).
- **'state+report'**: the state target is the ideal target **with the night's errors applied** ("report without
  disturbing the dream"). The report is the bot's final light. Expected value = the parity (XOR of computational-basis
  values) of `report.of` in the *actual* simulated state right after the night's errors, when that parity is definite
  (probability > 1−10⁻⁹). If it is not definite (e.g. a wobble put the Qubbles in a superposition of parities), the
  report counts as correct iff the final state's parity equals the light with certainty (i.e. the bot's measurement
  collapsed it and the light tells the truth). A bot that never LISTENed (light null) always fails the report.
  (No level currently uses this kind; 2-1 uses 'state' with a fix.)
- **'classical'** with an explicit `expect`: fidelity = Π P(qubble = expected bit); pass ⇔ ≥ 0.999. `'restore'` is not
  supported (classical levels use 'state' with `classical: true`).
- **'rate'**: a night passes ⇔ fidelity ≥ `minFidelity` (default **0.99**). `testLevel` runs `goal.nights` nights;
  input k = `inputs[k mod len]` (a `'random'` entry is a fresh Haar state per night); errors from `noise` (random mode:
  each target independently with probability p; kind uniform from `kinds`; wobble angle uniform in (0, π)).
  Level passes ⇔ passRate ≥ `minRate`.

## Test suites (`testLevel`)

Nights = inputs × noise cases (non-rate goals). Every `'random'` input entry expands to 4 Haar-random states
(deterministic from the suite seed, default 1). Noise cases:
- `none` → no errors; `fixed` → that list;
- `enumerate` → no error, every single event, and (maxErrors 2) every pair of events on two *different* targets.
  Targets default to all Qubbles. Kinds: flip → X, phase → Z, both → Y, wobble → one event per angle
  (`wobbleAngles`, default [0.6, 1.3, 2.2]) per axis (`wobbleAxis`/`wobbleAxes`, default 'x');
- `random` → 8 random nights per input.

`lines` = player's editable-phase ops excluding LABEL/NOTE; `botsUsed` = distinct bots referenced there.
`testLevel` skips snapshots (every step shares `EMPTY_SNAPSHOT`); replay a night with `quantum.runNight(..., night.seed)`
for the full trace.

## Performance

- **Dynamic register**: untouched qubits are not stored; a measured/reset qubit is exactly a product state and is
  *detached* (the vector halves). X/Y/Z/CNOT-with-classical-control on detached qubits stay classical. Exact, no
  approximation. Shor-9 with two reused bots never exceeds 11 live qubits.
- **Snapshot cache**: after a 1-qubit unitary only that qubit's Bloch vector is recomputed (MI is invariant under local
  unitaries); after CNOT(c,t) only Bloch(c,t) and pairs containing c or t; measurement/reset recompute everything.
  A test checks cached == uncached at every step.
- Measured (Node, this laptop): Shor-9 full suite (13 inputs × 28 error cases = 364 nights, ~69 steps each) ≈ 130–190 ms
  without snapshots; one Shor-9 night with full snapshots ≈ 40 ms; pathological 17-live-qubit night: 7 ms without
  snapshots, ≈ 0.5 s with snapshots. Whole `tests/quantum` ≈ 2 s.

## Reference programs (`src/quantum/reference.ts`)

```
# 2-1 parity check (a BEEPs ⇔ q1 ≠ q2)
HIGHFIVE q1 -> a
HIGHFIVE q2 -> a
LISTEN a

# bit-flip encode (bedtime)            # phase-flip encode (bedtime)
HIGHFIVE q1 -> q2                      HIGHFIVE q1 -> q2
HIGHFIVE q1 -> q3                      HIGHFIVE q1 -> q3
                                       SPIN q1
                                       SPIN q2
                                       SPIN q3

# bit-flip correct (morning). Syndrome a = q1⊕q2, b = q2⊕q3
HIGHFIVE q1 -> a
HIGHFIVE q2 -> a
HIGHFIVE q2 -> b
HIGHFIVE q3 -> b
LISTEN a
LISTEN b
IF a BEEP and b QUIET -> fix1
IF a BEEP and b BEEP -> fix2
IF a QUIET and b BEEP -> fix3
JUMP done
fix1:
BOOP q1
JUMP done
fix2:
BOOP q2
JUMP done
fix3:
BOOP q3
done:

# phase-flip correct = SPIN q1..q3, the bit-flip correction above, SPIN q1..q3
# (it falls through to done:, so the final SPINs always run)

# 2-4 one bot with RESET
HIGHFIVE q1 -> a
HIGHFIVE q2 -> a
LISTEN a
RESET a
IF a BEEP -> diff12
HIGHFIVE q2 -> a
HIGHFIVE q3 -> a
LISTEN a
IF a BEEP -> fix3
END
diff12:
HIGHFIVE q2 -> a
HIGHFIVE q3 -> a
LISTEN a
IF a BEEP -> fix2
BOOP q1
END
fix2:
BOOP q2
END
fix3:
BOOP q3

# Shor-9 encode (bedtime)
HIGHFIVE q1 -> q4
HIGHFIVE q1 -> q7
SPIN q1
SPIN q4
SPIN q7
HIGHFIVE q1 -> q2
HIGHFIVE q1 -> q3
HIGHFIVE q4 -> q5
HIGHFIVE q4 -> q6
HIGHFIVE q7 -> q8
HIGHFIVE q7 -> q9

# Shor-9 correct (morning), two bots reused:
#  1. bit-flip correction on (q1,q2,q3) with a,b (labels b1fix1.. b1done), RESET a, RESET b
#  2. same on (q4,q5,q6), RESET a, RESET b      3. same on (q7,q8,q9), RESET a, RESET b
#  4. phase check X⊗6 on q1..q6 with a:  SPIN a, HIGHFIVE a -> q1 … HIGHFIVE a -> q6, SPIN a, LISTEN a
#     phase check X⊗6 on q4..q9 with b:  SPIN b, HIGHFIVE b -> q4 … q9, SPIN b, LISTEN b
#  5. IF a BEEP and b QUIET -> SHUSH q1;  a BEEP and b BEEP -> SHUSH q4;  a QUIET and b BEEP -> SHUSH q7
```
Full text: `printProgram(reference.SHOR9_CORRECT)`. Why HIGHFIVE *from* the bot: a bot in |+⟩ controlling X on six
Qubbles picks up the eigenvalue of X⊗6 as a phase (phase kickback); SPIN turns it into a BEEP/QUIET.
Any phase flip inside a block is fixed by SHUSH on any one Qubble of that block (Z_iZ_j is a stabilizer).

`logicalErrorCurve(ps, nights, seed)` → `{p, physical, logical, theory}[]` for the 2-5 Night Shift Lab chart
(3-qubit code, iid X with probability p, input |0⟩, logical error ⇔ fidelity < 0.5; theory = 3p² − 2p³).

## Level verification

`tests/quantum/levels.test.ts` runs every level's solution with suite seeds 1, 2, 3 (must pass, no 'error' nights)
and every trap (must fail for a physics reason, never 'error'). Status 2026-10-03 ~13:00: **all levels green**
(16 levels, 38 traps). Physics review notes:
- 1-2 *Twirl*: X noise on |0⟩/|1⟩ inside SPIN…SPIN becomes Z, which is harmless on |0⟩/|1⟩ — correct physics.
- 2-1 uses goal 'state' with the flip on q2 and expects the player to *fix* it after the parity check — consistent.
- 2-5: coded success ≈ 1 − (3p² − 2p³) = 0.972 at p = 0.1 (plus random-input nights where a logical X happens to
  leave the state nearly unchanged, which pass the 0.99 threshold) vs minRate 0.93 — OK with margin.

## Nerd info (`Snapshot.nerd`, Schrödi's Lab Notebook)

Computed only by `runNight(level, prog, input, errors, seed, { nerd: true })` (QuantumAPI 6th param; the VM's own
`RunOptions.nerd` needs `snapshots` on). `testLevel` never computes it. Code: `src/quantum/nerd.ts`. Every TraceStep
carries one (steps without a state change share the previous object, like `snap` itself).

- **order**: data qubits (level `qubbles` order) then bots (level `bots` order). Every ket string uses this order,
  leftmost = `order[0]`, and includes measured/untouched (classical, detached) qubits with their definite value.
- **amps**: every basis state with |a|² > 1e-9, largest first, capped at 256 (`truncated: true` if more). Global
  phase fixed so the largest amplitude is real-positive (same as `Snapshot.amps`). Σ|a|² = 1 unless truncated.
- **reduced[q]**: Bloch vector (x, y, z) of the 1-qubit reduced state, purity Tr ρ² = (1+|r|²)/2 ∈ [½, 1],
  von Neumann entropy S = H₂((1+|r|)/2) in **bits** ∈ [0, 1].
- **mi[i][j]**: mutual information I(i:j) = S(i)+S(j)−S(ij) in **bits** (0..2), symmetric; diagonal = 2·S(i)
  (I(A:A)). Bell pair: 2; GHZ pair: 1. Pairs where either qubit is pure are 0 without computing ρ₂ (I ≤ 2·min S).
  **Cap**: if more than 10 qubits are live in the state vector, only data-qubit pairs are computed; bot rows/columns
  are 0 off the diagonal. The object then has the extra (non-contract) fields `miScope: 'data'` (else `'all'`) and
  `liveQubits` so the page can say "11 qubits: showing data qubits only". MI and Bloch reuse the snapshot cache.
- **stabilizers**: exact ⟨P⟩ for Pauli strings. Shor-9 levels (9 Qubbles) first list the 8 standard generators
  Z₁Z₂ Z₂Z₃ Z₄Z₅ Z₅Z₆ Z₇Z₈ Z₈Z₉ X₁X₂X₃X₄X₅X₆ X₄X₅X₆X₇X₈X₉, then (every level) ZᵢZⱼ for neighbouring Qubbles in placement
  order, then XᵢXⱼ for the same pairs (duplicates dropped). Labels use subscript digits of the Qubble number.
  ±1 for code states/after a Pauli error; in between for wobbles. Measured qubits contribute (−1)^bit to Z, 0 to X.
- **fidelity**: = `Snapshot.logicalFidelity` (data qubits vs the ideal error-free target), absent for classical goals.
- **record**: LISTEN/PEEK outcomes so far, in time order (`{ who, bit }`). RESET's internal collapse is not recorded.

### Exporter (`src/quantum/export.ts`)

`toQiskit(level, night, opts?)` → Qiskit 1.x Python; `toOpenQASM3(level, night, opts?)` → OpenQASM 3
(`stdgates.inc`). `opts = { includeErrors?: boolean (default true), prog?: {bedtime?, morning?}, dynamic?: boolean }`.
One `q` register (order as above, mapped in a comment), one classical register `m_<who>` per measured creature;
`m_a[k]` = the k-th LISTEN of a. Input: `ry(θ)` then `p(φ)` (exact, no global phase). BOOP/SHUSH/SPIN/HIGHFIVE → x/z/h/cx,
LISTEN/PEEK → measure, RESET → reset; gremlins → x / z / y / rx(angle) / rz(angle) with comments (or a comment only
when `includeErrors: false`). Header: game, level, seed, input, errors, result.

- **Executed path** (default): the gates that actually ran this night, straight-line. IF/JUMP decisions are comments
  (`# IF a BEEP and b QUIET -> fix1 (taken) [lights: a=1 b=0]`; needs `prog`, else a generic comment). It reproduces
  the night only when a device gets the same measurement outcomes.
- **Dynamic** (`dynamic: true` + `prog`): the program as a circuit with feed-forward. Each gate gets the exact
  condition under which it runs (truth table over measured bits), emitted as disjoint minterms of nested single-bit
  ifs: `with qc.if_test((m_a[0], 1)):` / `if (m_a[0] == true) { … }` (the forms Qiskit's QASM3 importer accepts).
  Lights are the latest `m_` bit of that creature; never measured = QUIET. Requires: every jump goes **forward**,
  every LISTEN/PEEK runs on **every** path, ≤ 16 condition bits, night not ended by error/maxSteps. Otherwise it falls
  back to the executed path and says why in the header (e.g. 2-4's one-bot RESET loop: conditional LISTEN).
- Angles are printed with 15 significant digits. Verified: all outputs (executed + dynamic, bit-flip / Shor-9 / loop)
  build in Qiskit 1.4 and load with `qiskit.qasm3.loads` (opt-in test: `QISKIT_PYTHON=/path/python npx vitest run`).

## DLC additions (Technical Aficionado; all optional, classic defaults unchanged)

All additive: classic levels never use them, and with them absent every classic night is bit-for-bit identical
(no extra RNG draws; tested).

- **Gates** (`Op`, text, sim, both exporters): `Y q` = [[0,−i],[i,0]], `S q` = diag(1,i), `SDG q` = S† = diag(1,−i),
  `CZ q1, q2` (symmetric), `SWAP q1, q2` (an exact relabelling in the simulator: no amplitude moves). Text aliases
  `X/Z/H/CX` = BOOP/SHUSH/SPIN/HIGHFIVE, `SDAG` = SDG, `IDLE`/`TICK` = WAIT. Trace: a separate event kind
  `{ k: 'xgate', op, t, from? }` (so classic playback tables stay exhaustive). Names: `DlcOpName`, `AnyOpName`;
  `LevelDef.toolbox` is `AnyOpName[]`.
- **Readout errors** (LISTEN only; PEEK is never flipped): probability from `RunOptions.readoutFlip` ??
  `LevelDef.readoutFlip` ?? `noise.readoutFlip` (random mode) ?? 0. The qubit collapses to the TRUE Born outcome and
  is detached with it; only the recorded bit (light, IF, NerdInfo.record, the trace's `result`) is flipped, and the
  measure event carries `flipped: true`. Deterministic faults: `RunOptions.readoutFlips: [{ t, nth }]` (nth = 1-based
  LISTEN count of that bot). `NightResultX.readoutFlips` lists what happened. `noise: { mode: 'enumerate', readout: true }`
  makes `testLevel` add one night per (bot, nth) slot, counted statically over the programs (`listenSlots`).
- **Noise rounds**: `ErrorEvent.round?` (0/absent = the night). Round k ≥ 1 strikes at the k-th executed `WAIT`; rounds
  with no matching WAIT strike after the morning program (skipping WAIT never dodges noise). `noise.rounds` (random:
  independent rounds; enumerate: single errors in every round, pairs stay in round 0).
- **LevelDef.stabilizers** (I/X/Z strings in placement order): NerdInfo.stabilizers reports exactly these, ahead of the
  classic ZZ/XX/Shor auto-detection (also `RunOptions.stabilizers`). Y in these strings is not supported (use
  `expectPauliString` for Y-containing Paulis).
- **`src/quantum/qec.ts`** (not in the classic bundle): `CODES` (rep3, five, steane, surface3: n, k, d, stabilizers,
  logicals, layout, encoder), `measureStabilizer`, `lookupTable`, `lookupDecoder`, `correction(code)`, `codeLevel(code)`,
  `REPEATED_EXTRACTION`, `SINGLE_ROUND_EXTRACTION`, `repeatedExtractionLevel()`. Encoders were synthesised in Qiskit 1.4
  (Clifford tableau for [[5,1,3]], CSS pivot construction for Steane/surface) and are re-verified in our simulator:
  every generator +1, ⟨X̄⟩ = ⟨X⟩ψ, ⟨Z̄⟩ = ⟨Z⟩ψ. The surface-code layout and generator order match the Curriculum Author's
  `src/dlc/aficionado/levels/codes.ts` (Z plaquettes {2,3,5,6} {4,5,7,8}, Z pairs {1,4} {6,9}; X plaquettes {1,2,4,5}
  {5,6,8,9}, X pairs {2,3} {7,8}; X̄ = X₁X₄X₇, Z̄ = Z₁Z₂Z₃). CSS corrections reuse the same ancillas (Z-checks → fix X → RESET →
  X-checks → fix Z): Steane 3 bots (≤ 10 live qubits), surface 4 bots (≤ 13 live).
- **Repeated extraction** (`REPEATED_EXTRACTION`): three rounds onto fresh bots (a,b | c,d | e,f) with WAIT between, then the
  per-bit majority (as IF implicants). Survives any single readout fault, or one data X before round 1 or between rounds
  1 and 2. An X between rounds 2 and 3 is seen once and is NOT corrected in that cycle (a real memory would catch it next
  cycle); a test documents this.
- **`src/quantum/montecarlo.ts`** (not in the classic bundle): `wilson(k, n)` (95% Wilson score interval; exact 0 / 1 at
  k = 0 / n), `monteCarlo(level, prog, { trials, seed, noise?, readoutFlip?, inputs? })` → `McResult & { meanFidelity }`
  (trial i uses seed mixSeed(seed, i); a trial fails iff its night does not pass), `sweep(level, prog, ps, trials, seed,
  { kinds?, readout?, rounds? })` (same seed for every p ⇒ common random numbers). Note: a logical X is harmless on |±⟩,
  so compare with 3p² − 2p³ using inputs |0⟩/|1⟩ only.
- **NerdInfo / exporter**: `expectPauliString(s, 'XYZ…', ids)` (exact, Y = iXZ). Exporters emit `y s sdg cz swap`; noise
  rounds appear at their WAIT; readout errors are comments (a circuit cannot express a classical bit flip).
