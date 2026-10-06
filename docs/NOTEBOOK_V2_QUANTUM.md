# Lab Notebook v2: quantum audit + content plan (Quantum Expert, 2026-10-06)

Scope: every notebook page (`src/ui/nerd/notebook.ts`, `qmath.ts`, `pages.ts`), the nerd data (`src/quantum/nerd.ts`)
and the simulator behind it, plus the Qiskit / OpenQASM 3 exporter (`src/quantum/export.ts`).
Status: **Phase 1 done.** Typecheck clean; `npm test` 124 passed, 2 skipped (both need Python with Qiskit; run them with
`QISKIT_PYTHON=…`; they pass with Qiskit 2.5.2 + Aer 0.17.2).

## 0. TL;DR for the programmer (things you must do in notebook.ts)
1. **Circuit page:** call `buildCircuit(night, u.xray, { level: o.level, prog: o.prog?.() })`. Without the program the
   page now shows **no** double lines (the old guess was wrong, see B1). Draw `cond` on `measure` and `reset` columns too.
   If `condKnown` is false, add a small caption: "classical controls unknown (program changed since this night)".
2. **Export page:** call `transcribe(night, o.level, exportLang, includeErrors, prog)` (5th arg is new).
3. **Stabilizer page:** split the table using `st.code` (see B4) and add the recoverable fidelity (see W1).
4. The rest is in §2 (P1 to P10), in priority order.

Nothing in the shared contract was broken. Two optional fields were added to `NerdInfo` (`stabilizers[k].code`, `recoverable`).

---

## 1. Bugs found and FIXED (my files, with tests)

| # | Where | Bug | Fix | Test |
|---|---|---|---|---|
| B1 | `qmath.buildCircuit` | **Wrong classical-control lines.** Any *taken* jump (incl. an unconditional `JUMP done`) marked **every later gate in the phase** as controlled by the last measured bots. So the phase-flip code's closing `SPIN q1..q3` got double lines from a,b even on a clean night, and in Shor-9 the whole block-2/3 syndrome extraction looked classically controlled by block 1. | Exact **control dependence** (`controlDeps`: post-dominator analysis of the phase's code, Ferrante–Ottenstein–Warren, loops OK). `cond` = the measured creatures named by the IFs an op depends on, transitively. Needs `{level, prog}`; checks every trace event against the program (an edited program means `condKnown: false` and no lines rather than wrong lines). `measure`/`reset` columns can carry `cond` too (2-4's second LISTEN really is conditional). | `qmath.test.ts` › circuit model (phase-flip, 2-4 one-bot, Shor-9, mismatch, loop) |
| B2 | `qmath.syndromeOf` | Kept only the **last** bit per bot, so a reused bot (2-4's one bot, Shor-9 with bots reset and reused) collapsed different syndromes into one table row. | Full per-bot history: `a=1 b=0`; a reused bot reads `a=1,0`. Unchanged output when each bot listens once. | › small helpers |
| B3 | `qmath.transcribe` (export fallback) | No input-state preparation (wrong state for any non-|0⟩ input); `if (c[0] == 1 && c[1] == 0)` (`&&` on bits isn't accepted by Qiskit's QASM3 importer); a measure's own value leaked into its own condition; conditions came from the wrong B1 model. | Prepends `ry(θ)`/`p(φ)`; nested single-bit `if (c[i] == true) { … }` / `with qc.if_test((qc.clbits[i], 1)):`; conditions from the exact model (5th arg `prog`). Verified on Aer. | › transcribe; `export-aer.test.ts` |
| B4 | `nerd.stabilizerSet` | **"Stabilizers" that aren't stabilizers.** It listed ZᵢZⱼ and XᵢXⱼ for *every* neighbouring pair, including on Shor-9: Z₃Z₄, Z₆Z₇ and all eight XᵢXᵢ₊₁ (18 rows, 10 of them read ≈0 on a perfect code state). On the 3-qubit codes the non-code checks (e.g. ⟨X₁X₂⟩ on the bit-flip code) were shown with the same badge style as real stabilizers. | Each check now has `code: boolean`: true ⇔ ⟨P⟩ = +1 on the ideal target for inputs |0⟩ and |1⟩ (so for every input, by linearity). Code stabilizers come first. Shor-9 lists only its 8 generators. Snapshots carry `code` (`NerdInfo.stabilizers[k].code`). | › code stabilizers |
| B5 | `export.ts` executed path | With "include gremlin errors" **off** (the default, and forced off under blankets), the executed path still contains the **fix** that ran *because of* the error. Run as-is it ends in a corrupted state, with no warning. | Header now says so and points to "include errors" or the dynamic circuit. (The dynamic circuit is correct without errors.) | `nerd.test.ts` › exporter |
| B6 | `qmath.fmtPhase` | Non-special negative phases printed with an ASCII hyphen (`-0.70`) next to typeset `−π/2`. | Real minus sign. | › small helpers |

**Verified correct (no change needed):**
- Ket order: `order` = Qubbles in level order, then bots; leftmost bit = `order[0]`. Legend `|q1 q2 q3 · a b⟩` matches the
  kets. Classical (measured / untouched) qubits appear with their definite value. Global phase: largest amplitude real-positive.
- Phase convention: |ψ⟩ = cos(θ/2)|0⟩ + e^{iφ} sin(θ/2)|1⟩; phase wheel is counter-clockwise for +φ; `fmtCoef` signs are right.
- Bloch: x = 2Re ρ₀₁, y = −2Im ρ₀₁, z = ρ₀₀ − ρ₁₁ (checked against the sim's accumulation). Purity (1+|r|²)/2, S = H₂((1+|r|)/2) bits.
- MI: S(A)+S(B)−S(AB) in bits, 4×4 Hermitian eigenvalues via the 8×8 real embedding + Jacobi; diagonal 2S; Bell = 2, GHZ pair = 1.
  The skip "either qubit pure ⇒ I = 0" is exact (I ≤ 2 min S). The snapshot MI cache is exact (local unitaries keep MI).
- `pauliExpectation`: ⟨ψ|X_xs Z_zs|ψ⟩ = Σᵢ Re(ψ*_{i⊕x} ψᵢ)(−1)^{|i∧z|}, correct (X,Z sets disjoint ⇒ Hermitian, real). Classical qubit: X → 0, Z → (−1)^bit.
- `reducedRho`: ρ[u][v] = Σ_rest ψ_u ψ_v*, first selected qubit = most significant bit, matches the |b⟩ labels.
- Threshold curve: P_L = 3p²(1−p) + p³ = 3p² − 2p³, crossing at p = ½ (correctly called a pseudo-threshold).
- **Exporter**: gate mapping (BOOP/SHUSH/SPIN/HIGHFIVE → x/z/h/cx; Y = [[0,−i],[i,0]] = Qiskit `y`; wobble
  exp(−iθX/2) = `rx(θ)`, exp(−iθZ/2) = `rz(θ)`; input `ry(θ)` then `p(φ)`, exact incl. global phase); measurement into
  `m_<who>[k]`; RESET → `reset`; lights = latest `m_` bit, never measured = QUIET; END / fixed+mine parts / forward-only
  jumps. Syntax valid for **Qiskit 2.5.2** (`QuantumCircuit.if_test`, `qiskit.qasm3.loads`) and OpenQASM 3 (`stdgates.inc`,
  `bit[n] m_a;`, `m_a[0] = measure q[3];`, `if (m_a[0] == true) { … }`).
  **New semantic check** (`tests/quantum/export-aer.test.ts`, opt-in): the exported circuits run on Qiskit Aer with
  mid-circuit measurement + feed-forward, and the final data state is compared with the game's ideal target:
  dynamic circuits (bit-flip, one-bot, phase-flip, Shor-9; X/Z/Y/wobble errors; 6 random seeds each) and executed paths
  (Pauli errors) all reach fidelity 1 − 1e−9, in both Python and QASM3 forms, and so does the notebook's fallback.
  The executed path reproduces a night only when the device gets the same outcomes (wobble nights); the header says so.

## 2. Fixes for the programmer in `notebook.ts` (I did not edit it)

| # | Page | Problem | Exact fix |
|---|---|---|---|
| P1 | Circuit | Classical controls (see B1). | `buildCircuit(night, u.xray, { level: o.level, prog: o.prog?.() })`; in the `measure`/`reset` branches draw `c.cond` with `condLines` like gates; caption when `!condKnown`. Keep `prog` stable per night (if the player edits code after a run, `condKnown` goes false: fine). |
| P2 | Export | Fallback transcription ignores the program. | `transcribe(night, o.level, exportLang, includeErrors, prog)`. Status line for the executed path without errors: "fix gates included, errors not: see the header". Consider defaulting to **dynamic** when `prog` exists and X-ray is off (it is the version that is correct without the errors). |
| P3 | Stabilizers | Code stabilizers vs other checks mixed in one table. | Two groups: "**Stabilizers of this code**" (`st.code`) with the ±1 badges; "**Other checks** (not stabilizers here: watch them sit at 0)" in grey, collapsed by default. On Shor-9 only the first group exists. |
| P4 | Stabilizers | "Logical fidelity" is the wrong name: it is the fidelity with the ideal *code state*, which drops to ~0 after a single X even though nothing is lost. | Rename to "**Fidelity with the perfect code state**", and add the recoverable bar (W1) right under it: "**Recoverable** (after a perfect correction)". The LOGICAL QUBIT SURVIVED stamp can use `recoverable` too: stamp when the final fidelity > 0.999 *and* some step had fidelity < 0.98 (as now). |
| P5 | Stabilizers | The syndrome table only grows when the night is stepped to its **last** step **while this page is open**; nights run on other pages, or run straight through with the drawer closed, are never recorded. | Move the accumulation out of `stabView` into `update()` (run it on every update with a finished night: `u.night` with `u.step >= steps.length − 1`, deduped by `seenNights`), independent of `open`/`page`. Key stays `syndromeOf(record, bots)` (now with full history). |
| P6 | Bloch | `ids.slice(0, 8)` drops **q9** on Shor-9 levels (order is q1…q9 then bots). | Show all data qubits (up to 9), then bots up to a total of 12; the "showing the first N" caption only past that. |
| P7 | Entanglement | Filters to data qubits whenever `ids.length > 10`, even when `miScope === 'all'` (every 2-bot Shor level has 11 ids). | Filter only on `n.miScope === 'data'` (say "N live qubits: showing data qubits only"); otherwise show all with smaller cells (designer: 11 × 11 fits at ~22px). |
| P8 | State | Amplitude bars have length \|a\| but the number next to them is the probability \|a\|², with no caption saying so. | Caption over the rows: "bar = \|amplitude\|, colour = phase, number = probability". |
| P9 | Density | The "caught in the act" note says "From here on it is either flipped or not" at the first `HIGHFIVE q1→a`. At that moment the bot holds **q1 itself** (the logical bit!), not yet the parity; the error is discretized only once the parity is complete and the bot LISTENs. Also: on a single data qubit the wobble's coherence is ρ₀₁ = i·cos(θ/2)sin(θ/2)(\|α\|²−\|β\|²), which is **zero for \|+⟩-type inputs**, so the snap never fires there; the "q1 a" pair always shows it. | New note text: "The coherence just moved into the bot. Once the bot holds the parity and LISTENs, the half-flip becomes either *no flip* or *a full flip*: a plain X the code can fix." Default the selector to the `q1 a` pair on levels with wobble noise. |
| P10 | Threshold | The red dot is the *theory* value at the room's p, labelled "this room". It also appears on any level with random noise, even if the noise kinds / code don't match the 3-qubit bit-flip model. | Draw the dot only when the level's code stabilizers are Z₁Z₂, Z₂Z₃ and `noise.kinds` = ['flip']. Add the **measured** point from the player's own nights: x = p, y = failed / total, with a Wilson 95% interval bar: centre ĉ = (k + z²/2)/(n + z²), half-width z√(k(n−k)/n + z²/4)/(n + z²), z = 1.96. Label "your nights: k/n". |

Minor (cosmetic, take or leave): MI heatmap diagonal tooltip could say "2·S(q) = I(q:q)"; lights-out labels are fine.

## 3. Content review of the page copy (plain line + margin note)
All plain-words lines in `pages.ts` are accurate. Margin notes: all fine physically. Two tweaks:
- *state*: "Amplitudes, not probabilities. Square them and the phases vanish." ✓ (keep).
- *threshold*: "Below one half, three beats one." ✓. Optional add: "Real codes have a real threshold: below it, *bigger* codes win."
- *stabilizers* (new, if W1 lands): "Fidelity says 0. Recoverable says 1. The Qubbles aren't broken, they're *wrong in a way I can undo*."
- *circuit* (new, if W2 lands): "Bot a never looked at q1 or q2. It only measured Z₁Z₂: 'are you two the same?'"

---

## 4. "Wow, a physicist would love this": ranked additions (top 2 marked ★)

Data for **W1** and **W2** is already implemented and tested (`NerdInfo.recoverable`, `codeDecoder`, `measuredObservables`).
The designer/programmer only draws them.

### ★ W1. "Hidden, not lost": fidelity vs recoverable fidelity, across the night
- **Shows:** a two-line sparkline over all steps of the night, with a cursor at the current step. Ink line = fidelity with the
  perfect code state; green line = **recoverable** fidelity (what a perfect decoder could still get back). Gremlin strikes:
  ink falls to ~0, green **stays at 1**: the information is hidden, not lost. Two flips: green falls too (a real logical
  error: stamp "FOOLED"). Wobbles: ink dips part-way, green flat (error discretization in one picture). Bonus honest
  detail: green dips for exactly one step after the first syndrome HIGHFIVE (the bot briefly holds q1, the logical bit)
  and recovers at the second: margin note "for one step the bot knew too much".
- **Math:** F = ⟨t|ρ_data|t⟩. F_rec = Σ_s ⟨t|E_s Π_s ρ Π_s E_s|t⟩ = Σ_s ⟨t_s|ρ_data|t_s⟩ with t_s = E_s|t⟩, E_s the
  minimum-weight correction for syndrome s (lookup over the code generators; X, then Z, then Y per Qubble; degenerate
  errors share a row). Valid because Π_s E_s|t⟩ = E_s|t⟩ and the t_s are orthogonal.
- **Data:** `night.steps[i].snap.nerd.fidelity` and `.recoverable` for every i (absent for levels without a ≥2-generator
  code, i.e. 0-1, chapter 1 and 2-1, or above 14 live qubits).
- **Cost:** already computed in the sim: #syndromes × 2^live per step (3-qubit codes: 4 × 32; Shor-9: 22 × 2¹¹). Whole
  4-1 solution night with nerd on: ~80 ms in Node. Drawing: one polyline over ≤ 150 points.
- **Page:** Stabilizers & syndrome (replaces the single fidelity bar). Hidden under blankets (needs X-ray), like the values.

### ★ W2. "What did the bot really measure?" + the live decoder lookup
- **Shows:** (a) on the **Circuit** page, under every LISTEN meter, the observable it actually measured, in pencil:
  `Z₁Z₂`, `Z₂Z₃`, and for Shor's phase checks `X₁X₂X₃X₄X₅X₆`. Bots never look at a Qubble; they measure a *product*.
  (b) on the **Stabilizers** page, the decoder table of the code (rows from `codeDecoder`: syndrome bits per generator →
  correction), with the row that matches this night's bot bits **highlighted** and the fix the player's code actually
  applied next to it (✓ if it matches the decoder, ✗ if not). Under X-ray, also the gremlin that really struck.
- **Math:** Heisenberg picture. The LISTEN measures Z_bot at time T; back-propagate P ← G†PG through the Clifford gates
  (X: Z→−Z; Z: X→−X; H: X↔Z, Y→−Y; CNOT(c,t): X_c→X_cX_t, Z_t→Z_cZ_t; Aaronson–Gottesman sign rule) back to a moment T0
  when the bot was fresh: dawn if it was untouched until then, else its last RESET (|0⟩) / previous LISTEN (|m⟩). The bot
  factor is then absorbed (Z → (−1)^m; X/Y → the outcome is a fair coin, flagged `random`). Result: (−1)^bit = sign·⟨P⟩ at
  T0. Syndrome bit for generator g = bit ⊕ (sign < 0) of the latest LISTEN whose label = g.
- **Data:** `measuredObservables(night)` → Map(step index → `{ label, sign, random }`); `codeDecoder(stabilizerSet(level))`
  → `{ gens, rows: { syndrome, fix }[] }` (import both from `qmath.ts` / `quantum/nerd.ts`). Classical trace only, so
  (a) and the highlighted row are fine **under blankets** (only the "real gremlin" column needs X-ray).
- **Cost:** O(gates × qubits) per LISTEN, once per night (memoise by night). Decoder: once per level.
- **Page:** Circuit (labels) + Stabilizers & syndrome (lookup table). Tested: bit-flip → Z₁Z₂, Z₂Z₃; phase-flip → X₁X₂, X₂X₃
  (the opening SPINs are folded in); 2-4 one bot → Z₁Z₂ then Z₂Z₃; Shor-9 → all 8 generators, each bit = the generator's
  value at dawn for X/Z/Y errors.

### W3. Error propagation trace (Pauli frame) through the circuit
- **Shows:** on the Circuit page in X-ray, each gremlin's error is drawn as a red tint that **flows along the wires**: an X
  on q1 is copied onto bot a by `HIGHFIVE q1→a` (that's *why* a BEEPs), a Z on a bot kicks back onto Qubbles, and the
  tint vanishes at the fix (the frame becomes identity) or survives to the end (logical error). A wobble is drawn dashed
  ("maybe X") until the LISTEN decides; it then turns solid or disappears according to the syndrome.
- **Math:** forward Pauli-frame propagation, F ← G F G† with the same symplectic rules as W2, starting at the noise step.
  Y = X·Z. For a wobble, after the syndrome LISTEN, the branch is known from the bits (X if the syndrome says so, else I).
- **Data:** `night.steps` (`noise` and `gate` events), plus W2's syndrome bits for wobbles. **Cost:** O(gates × qubits) per error.
- **Page:** Circuit (X-ray only). I can provide `pauliFrames(night)` (step → frame per qubit) in `qmath.ts` on request.

### W4. Bloch trails
- **Shows:** each Bloch sphere keeps a fading trail of its arrow over the night: a wobble is a visible arc; entanglement
  drags the tip **inside** the ball (|r| < 1, "sharing"); the correction snaps it back to the surface; a PEEK jumps it to a pole.
- **Math:** r(i) = (x, y, z) from `snap.nerd.reduced[q]` for steps 0…current; |r| = √(2·purity − 1).
- **Data:** `night.steps[i].snap.nerd.reduced`. **Cost:** trivial (≤ 150 points per qubit; dedupe shared snapshots).
- **Page:** Bloch. Needs a `trail` option in `createBloch3D` (designer/programmer).

### W5. "Which errors fool the code?": distance table
- **Shows:** for the level's code and noise kinds, every weight-1 and weight-2 error: its syndrome, the decoder's fix, and
  the verdict: ✓ corrected / ✗ **fooled** (logical error) / 👻 **invisible** (undetected logical). E.g. bit-flip code:
  X₁X₂ → syndrome 01 → fix X₃ → X₁X₂X₃ = X̄: fooled; Z₁ → syndrome 00: invisible (Z₁ *is* a logical Z̄). Headline:
  "distance 3 against flips, distance 1 against phase flips". Pairs nicely with chapter 3's "the bit-flip code can't see
  phase flips" and with 2-5's two-flip failures.
- **Math:** syndrome via commutation (E anticommutes with g ⇔ |x_E∧z_g| + |z_E∧x_g| odd). Residual R = fix·E.
  R ∈ stabilizer group (generate the ≤ 2⁸ = 256 products of the generators) ⇒ corrected; R commutes with all generators but
  is not in the group ⇒ logical error. Distance d = min weight of such an R among enumerated errors.
- **Data:** `stabilizerSet(level)` + `codeDecoder` only; no simulation. **Cost:** ≤ (27 + 324) errors × 256 group elements
  for Shor-9 with X/Z/Y: one-off, < 1 ms.
- **Page:** Stabilizers & syndrome (below the decoder table), or Threshold (it explains the 3p² term: only 2+ errors fool
  the code).

---

## 5. Sign-off checklist for the redesigned notebook (I will check these in Phase 2)
- Ket legend visible on the State page in every layout; Qubble | bot split in the kets kept.
- No number on a needsXray page leaks under blankets (incl. W1); W2's labels and highlighted row may show (classical).
- Circuit: no double lines without `prog`; closing SPINs of the phase code never controlled; 2-4's second LISTEN controlled by a.
- Shor-9: Bloch shows q1…q9; stabilizer table shows exactly the 8 generators; MI shows bots when `miScope === 'all'`.
- Export: header warning visible when errors are omitted on the executed path.

---

## 6. Phase 2: live verification (2026-10-06, after the programmer landed P1–P10 + W1/W2)

How: `node tools/nb/quantum/verify.mjs [case,…]` (Playwright, 1920×1080, nerd on, unlockAll, X-ray on, paused night
seeked to the last step). It dumps per case: every circuit column (`data-col/line/op`, number of double-line controls,
the observable label), the card→gate highlight for **every** card vs. the columns whose `data-line` is that card's
(phase, part, pc), the gate→card highlight for every gate, the stabilizer/decoder tables, the sparkline polylines and
every page's title / plain line / captions. Output: `tools/nb/quantum/out/<case>.json` + screenshots.
Cases: 1-3; 2-3 (X on q2; X on q1+q2); 2-4 one reused bot (X on q1 → diff12 branch; X on q3); 2-4 with a **JUMP loop**
program (`top: SPIN a / LISTEN a / RESET a / IF a BEEP -> top / …`); 3-2 phase flip (Z on q2; clean); 3-3 wobble;
4-1 Shor-9 with 8 bots (Y on q5; Z on q2). All nights ran without page errors.

### Results
| Check | Result |
|---|---|
| (a) double lines / `cond` | ✓ 2-3: only the fix (`BOOP q2`, controlled by a, b). 2-4: the whole diff12 branch (RESET, 2 HIGHFIVEs, 2nd LISTEN, BOOP) controlled by a, the first CNOTs/LISTEN not. 3-2: only `SHUSH q2`; the closing SPINs are **not** controlled. 4-1: only the two fixes. **Bug found + fixed (qmath):** in a JUMP loop the *first* pass of the loop body was drawn controlled by a (static control dependence). Now `cond` only counts IF instances actually evaluated before the op: first pass plain, later passes controlled. Test: › loops. |
| (b) card ↔ gate | ✓ 0 mismatches over 366 visible cards (398 total; 32 in folded Bedtime) (card→gate: highlighted columns == columns with that card's `data-line`, incl. IF-controlled fixes, every pass of the loop, fixed Bedtime). Gate→card ✓ on every gate whose card is visible. Note (UX, not physics): when Bedtime is **folded** (fully fixed Bedtime in 3-2 / 4-1) hovering a bedtime gate highlights nothing, by the editor's "don't pop it open on hover" rule. Suggest a small pulse on the folded Bedtime header instead (programmer's call). |
| (c) decoder "your code" + verdict | **Rule decided and implemented** (see below). 2-3 X₂ ✓; 2-4 X₁ ✓ / X₃ ✓ (reused bot: syndrome read from both LISTENs of a); 3-2 Z₂ ✓ (the BOOP between SPINs counts as Z₂); 3-3 wobble collapsed to X₂, fix ✓; 4-1 Y₅ → your code Z₄X₅ **≡** (Z₄X₅·Y₅ ∝ Z₄Z₅ is a stabilizer); 4-1 Z on q2 → table says Z₁, your code Z₁ ✓; 2-3 with two flips: syndrome 01 → X₃ ✓ (your code did what the decoder does) **and** the FOOLED stamp (the decoder itself is fooled): both right. |
| (d) sparkline + LISTEN labels | Labels ✓: Z₁Z₂/Z₂Z₃ (2-x, 3-3), Z₁Z₂ then Z₂Z₃ for 2-4's reused bot, X₁X₂/X₂X₃ for the phase code, all 8 Shor generators (g, h: X₁…X₆, X₄…X₉ through 4-1's decode-then-measure circuit), 🎲 for the loop's SPIN a / LISTEN a. **Bug found + fixed (nerd/vm):** the green line collapsed to ~0.2 during the phase code's morning SPIN layer and Shor-9's decode/re-encode (the decoder images were fixed in the dawn frame). The images now follow the data qubits' Clifford frame (`recoverFrame`: SPIN on a Qubble, HIGHFIVE Qubble→Qubble). The green line is also undefined in bedtime (code not built yet). Remaining dips are the one real effect: right after the first HIGHFIVE of a check the bot holds a Qubble's value (|α|⁴+|β|⁴ = 0.60 at the test input, 0.5 on Shor), back to 1 at the second. Caption patched to say so. Tests: › recoverable follows the data frame. |
| (e) wording | All plain lines accurate (table in §3 stands). Patched: fidelity label says "target state" when the room has no code (1-3); export status no longer claims "fix gates included, errors not" on an error-free night; the X-type observable tooltip says "the same in the ± basis". Unchanged and fine: state/bloch/entangle/threshold/density/export captions. |

### The verdict rule (c)
Compare the correction **C** the player's code applied with the table's fix **F**, both as Paulis on the Qubbles in
the **dawn frame**:
- **C**: every *classically controlled* BOOP/SHUSH on a Qubble that ran this night (unconditional gates are circuit, not
  decision), back-propagated through all gates executed between dawn and it (P ← G†PG), bot parts dropped, signs
  ignored, multiplied together (`qmath.appliedCorrection`). That's why a BOOP between the phase code's SPINs is Z, and
  Shor-9's `BOOP q4` in the decoded frame is Z₄.
- **R = C·F** (`nerd.fixVerdict`): R = I → **✓ `ok`**; R in the stabilizer group (≤ 2⁸ products of the code generators)
  → **≡ `eq`** "same final state"; R commutes with every generator but is not in the group → **✗ `bad`** "logical error";
  R anticommutes with some generator → **✗ `bad`** "doesn't bring them back into the code"; unknown controls or night not
  finished → `unk` ("?" / "…").
- **Independent of `night.pass`.** The old rule ("≡ only when the night passed") was wrong both ways. A night can fail
  with ✓ (two errors fool the decoder too: that's the FOOLED stamp's job), and an equivalent fix is ≡ even mid-replay.
  Tests: › fixVerdict, › appliedCorrection.

### notebook.ts patches (exact; already in the file: I applied them before the "diffs only" instruction, and the
programmer has since built on them: `data-v` was added on top). Listed so they can be reviewed:
```diff
-import { codeDecoder, stabilizerSet } from '../../quantum/nerd';
+import { codeDecoder, stabilizerSet, fixVerdict, type StabDef } from '../../quantum/nerd';
   (and `appliedCorrection` added to the './qmath' import)
-  let decoder: ReturnType<typeof codeDecoder> | undefined;
+  let decoder: ReturnType<typeof codeDecoder> | undefined, stabDefs: StabDef[] | undefined;
-  if (decoder === undefined) { try { decoder = codeDecoder(stabilizerSet(o.level)); } catch { decoder = null; } }
+  if (decoder === undefined) { try { stabDefs = stabilizerSet(o.level); decoder = codeDecoder(stabDefs); } catch { decoder = null; } }   (×2)
-    // what the player's code applied: … carried through later SPINs
-    let applied: string | null = null;  try { …forward frame over cols… } catch { applied = null; }
+    let applied: ReturnType<typeof appliedCorrection> = null;
+    try { applied = appliedCorrection(night, o.level, o.prog?.(), u.step); } catch { applied = null; }
+    const done = u.step >= night.steps.length - 1;
+    const VERDICT = { same: ['✓', …], equivalent: ['≡', …], logical: ['✗', …], wrong: ['✗', …] } as const;
-        const verdict = applied == null ? '?' : applied === r.fix ? '✓' : night.pass && u.step >= night.steps.length - 1 ? '≡' : '✗';
-        mine = `<td class="nb-mine">${applied ?? '?'} <b class="nb-verdict">${verdict}</b></td>`;
+        const v = applied && done ? fixVerdict(stabDefs!, applied, r) : null;
+        const [mark, why] = !applied ? ['?', 'classical controls unknown'] : !done ? ['…', 'night not finished'] : v ? VERDICT[v] : ['?', ''];
+        const dv = !applied || !done || !v ? 'unk' : v === 'same' ? 'ok' : v === 'equivalent' ? 'eq' : 'bad';   // (programmer)
+        mine = `<td class="nb-mine">${applied?.label ?? '?'} <b class="nb-verdict" data-v="${dv}" title="${why}">${mark}</b></td>`;
-      wrap.append(h('div', { class: 'nb-sub' }, 'Fidelity with the perfect code state'), bar(fid));
+      wrap.append(h('div', { class: 'nb-sub' }, n?.stabilizers.some((x) => x.code) ? 'Fidelity with the perfect code state' : 'Fidelity with the target state'), bar(fid));
   sparkline figcaption, append:
+ ' (The green blinks down only while a bot is half-way through a check: for that moment it holds a Qubble's own value. The ink also sags while SPINs turn the code inside out: bookkeeping, not damage.)'
   observable <title>:
-"are you the same?"
+"are you the same${/X|Y/.test(ob.label) ? ' in the ± basis' : ''}?"
   export status:
-: includeErrors ? 'the exact path this night executed' : 'the executed path: fix gates included, errors not (see the header)';
+: includeErrors || !night.errors.length ? 'the exact path this night executed' : 'the executed path: fix gates included, errors not (see the header)';
```

### Fixed in my files during phase 2 (tests in `tests/quantum/qmath.test.ts` › phase 2)
- `qmath.buildCircuit`: dynamic control (evaluated IF instances only): fixes the loop first pass.
- `qmath.appliedCorrection` (new) + `nerd.fixVerdict` (new): the verdict rule above.
- `nerd.recoverFrame` + `vm.ts`: recoverable fidelity in the data Clifford frame; undefined during bedtime.

### §5 sign-off checklist
- [x] Ket legend on the State page; Qubble | bot split in the kets.
- [x] Nothing on a needsXray page leaks under blankets; W2 labels + highlighted decoder row are classical (OK to show).
  The "gremlin" column and the sparkline/fidelity bars only render with X-ray.
- [x] Circuit: no double lines without `prog`; the phase code's closing SPINs never controlled; 2-4's second LISTEN
  controlled by a; loop first pass uncontrolled.
- [x] Shor-9: stabilizer table = exactly the 8 generators; decoder 22 rows; observables = the 8 generators.
  Bloch q1…q9 and MI with bots: P6/P7 code present; not re-shot in this pass (no physics risk).
- [x] Export: header warning when errors are omitted on the executed path; the status line is now honest on clean nights.
- [x] Card ↔ gate mapping exact (366 visible cards, 0 mismatches). Folded fixed Bedtime gives no gate→card feedback (UX note above).

**Quantum sign-off: GO** for the notebook content as of this pass. `npm run typecheck` clean; `npm test` 128 passed,
2 skipped (the Qiskit/Aer opt-in suites; last run green with Qiskit 2.5.2 + Aer 0.17.2).
