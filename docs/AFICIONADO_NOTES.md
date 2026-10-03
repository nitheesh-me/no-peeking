
## DLC Engineer: integration API (landed)
Everything I consume from other owners is discovered with `import.meta.glob`, so a missing file never breaks the build; plain local fallbacks render instead.

**Entry / classic hook.** `src/ui/screens/title.ts` shows the faint `⟨ψ|` glyph (lower left, tooltip "an extension", CSS `.afi-glyph` in main.css) when `MODES[0].visible(levelDone, unlockAll())`. Click → route `#afi` (`src/ui/screens/afi.ts`) → `MODES[0].load()` → `mount(root, ctx)`; `ctx.exit()` → classic title. `manifest.ts` injects theme/*.css + shell.css (inlined, `?inline`) on mount and removes them on exit.

**Loader (`loader/index.ts`).** Stages, each a real dynamic import / glob load: `core` (shell chunk) → `three` (skipped when WebGL is off/unavailable) → `d3` → `assets` (all viz/*.ts + `document.fonts.ready`) → `content` (content pack) → `levels` (levels/index.ts). Bytes = Resource Timing `encodedBodySize` of the new requests in that stage ("cached" when 0). Finale: `bornSamples(5, loadingCircuitProgram(6))` runs the drawn circuit on `QState` and Born-samples all five wires (crypto seed) → `lc.finish(outcomes)`. Skippable (Esc/Enter, button) from the 2nd entry; Settings "skip ceremony" makes it fast. Stage labels are technical identifiers (dlc_core, three.js, …) because the content pack is only loaded in stage 5; `afi.loader.<k>` overrides them when present.

**Viz contract** (types in `state/vizApi.ts`): unchanged from the draft. `mount(host, AfiVizInput) → { update, destroy }` for stateSpace / blochField / stabilizerTiling / lattice; charts `mount(host, AfiChartInput)`; `playOrientation(host, {reducedMotion, webgl})`; `createLoadingCircuit(host, stages, {reducedMotion})` (+ optional `loadingCircuitProgram(n)`). The Lab mounts `stateSpace` with `veiled: true` during execution; the analysis mounts stateSpace always, blochField if layer `bloch`, stabilizerTiling if `stabilizer-tiling`, lattice only for the surface-code module. Each panel is captioned `afi.oracle.caption` plus the `afi.viz.legend.*` text.

**Shell routes** (`shell/index.ts`): orientation (once, flag `np.afi.flags.oriented`) · map · briefing(levelId) · lab(levelId) · analysis({night, prog, …}) · bench · archive · settings. Gating: `meta.requires` must be complete (`np.afi.done`), judge mode opens everything. Completion = "Verify" (full `testLevel` suite) passes. Persistence: `np.afi.settings | flags | done | programs | runs` (try/catch everywhere).

**Lab.** Run = one seeded night (`trialCase(level, seed, 0)` → `runNight(..., {nerd:true})`), played back 260 ms/step (step buttons, `,`/`.` keys; no autoplay under reduced motion). Only the classical record is shown while running (measurement outcomes, `c_x` syndrome bits); noise events and readout flips are hidden and revealed in the analysis trace. Run N = `state/mc.ts monteCarlo()` which generates trial i exactly like `quantum/montecarlo.monteCarlo(level, prog, {trials, seed})` (identical numbers, tested) but yields to the UI every 50 trials; Wilson 95 % from the engine's `wilson`. Score: gates, depth (ASAP-packed), ancillas, measurements, p_L ± CI, seeds. Exports: Qiskit / OpenQASM 3 (dynamic circuit via the shared exporter), JSON, CSV (Archive). Bench = any open exercise as register layout, full gate set, iid noise (X/Z/Y, p), p-sweeps → chart (sweep kind), runs archived.

**Editor ⇄ Op[] mapping** (`editor/model.ts`, exact and total; tests in tests/dlc/editorModel.test.ts round-trip every classic + DLC reference solution and trap through grid and text with identical `testLevel` results):
- X/Z/H ⇄ BOOP/SHUSH/SPIN; Y/S/SDG ⇄ Y/S/SDG; CNOT c→t ⇄ HIGHFIVE c -> t; CZ/SWAP ⇄ CZ/SWAP; MEASURE q ⇄ LISTEN q (ancilla) or PEEK q (data); RESET; WAIT (noise round) and END/LABEL/JUMP/IF-goto as full-height control columns.
- Classical bit `c_q` = last MEASURE of q (VM Cond semantics; unmeasured = 0). A classically controlled run of gates `if (c_a==1 && c_b==0) {X q2; Z q3}` is emitted as `IF a BEEP and b QUIET -> _ifN; JUMP _fiN; _ifN: BOOP q2; SHUSH q3; _fiN:` (forward-only, exportable as a dynamic circuit). Import lifts that pattern, the classic tail-fix pattern (exclusive IF chain; END; `L: gates END` blocks) and the mid-program pattern (exclusive IF chain; JUMP D; `L: gates [JUMP D]` blocks; `D:`) back into conditioned gates; anything else (loops, majority-vote control in M7) stays verbatim as control columns. Within a time column, unconditioned gates run first (wire order), then conditioned ones.
- Text pane grammar (`editor/qasm.ts`): `stage pre:`/`stage post:`, `x q`, `sdg q`, `cx c, t`, `cz a, b`, `swap a, b`, `measure q -> c_q`, `reset a`, `wait`, `if (c_a==1 && c_b==0) <gate>`, `if (...) goto L`, `goto L`, `L:`, `end`, `# note`; errors inline with line numbers (keys `afi.editor.err.*`).
- Editor keys (grid focused): arrows move the cursor; x z h y s d(S†) c(CNOT) v(CZ) w(SWAP) m r place at cursor; for 2-qubit gates ↑/↓ then Enter pick the target (or click the target wire); i = condition editor; e = end, n = noise round; Delete; Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y; Ctrl+A; Alt+arrows move the selection; Shift+arrows extend; Insert/+ inserts a column; Esc clears. Pointer: drag from palette or click-to-arm, click/shift-click/marquee select, drag to move, double-click = condition.

**Content keys still missing** (please add to en.json): `afi.trace.readoutFlip` (e.g. "readout flipped: the reported bit differs from the collapsed state").

**For the Visual Director** (found in QA, 1280×720): (1) with WebGL off, `stateSpace` throws "Cannot access 'a' before initialization" from its ResizeObserver callback (2D path), ~10× per session; (2) blochField's purity/entropy labels overlap each other when 5 spheres are shown. (Earlier raw `afi.viz.*` keys and the loadingCircuit tsc error are fixed now.)

## Curriculum Author: levels + content pack (landed)
Files: `src/dlc/aficionado/levels/{index,modules,codes,dsl,bench}.ts`, `src/dlc/aficionado/content/en.json`, `tests/dlc/levels.test.ts`, `docs/AFICIONADO_CURRICULUM.md`.

**Levels API** (`levels/index.ts`)
- `MODULES: AfiLevel[]` (also the default export), `AFI_LEVELS: LevelDef[]` (ids `M0-1` … `M9-2`, 23 exercises, `chapter: 5`), `AFI_MODULES: AfiModuleMeta[]` (M0…M9, `requires` chain, `unlocks`, `code`, `stabilizers`, `logicals`).
- **Every text field of a DLC LevelDef is a content key** (`title`, `subtitle`, `hints[]`, `reveal`, `proTerm`, `traps[].name`); render with `t(def.title)` etc. `intro`/`winLine` are empty: the DLC has no dialogue.
- `afiKeys(levelId)` returns every key of one exercise; `criterionVars(level, prog?)` returns the variables the criterion sentence uses (`{trials} {inputs} {cases} {readout} {nights} {minRate} {maxFail} {p} {q} {minF}`), computed from the level itself: `t(afiKeys(id).briefing.criterion, criterionVars(def))`.
- `AFI_BENCH_TASKS` (guided Bench labs: id, base level, p grid, N, seed) and `wilson(k, n)`.

**Key scheme** (please switch to it; it is what the translator sees):
- module: `afi.modules.<M>.title | summary | objectives.<n> | analysis.oracle | analysis.<extra>`
- exercise: `afi.modules.<M>.ex.<levelId>.title | subtitle | term | reveal | analysis | hints.<n> | traps.<id> | briefing.{objective,context,code,noise,gates,criterion}`
- map: `afi.map.teasers.<M>` (shown on sealed and open modules), `afi.map.prereq.<M>` (human name of M used in "Sealed. Requires: {list}."; please join prereq names rather than raw ids), `afi.map.requires` = "Sealed. Requires: {list}."
- DLC Engineer: `afi.mod.<M>.*` and `afi.lvl.<id>.{title,briefing,objective}` are **not** provided (they would duplicate the above). Replace with `t(def.title)`, `t('afi.modules.'+M+'.title|summary')`, and the six briefing fields + `criterionVars`. All other keys your code uses today were added with your exact names (loader, shell, brief, goal, noise, op, input, record, trace, lab, score, analysis, oracle, export, archive, bench, chart, common, editor, settings, stage).
- **Two key conflicts in the shell** (a JSON node cannot be both a string and an object): `afi.shell.nav` (aria label) vs `afi.shell.nav.<view>` → I added `afi.shell.navLabel`; `afi.gate.<k>` vs `afi.gate.<k>.help` → I added `afi.gateHelp.<k>`. Please use those two.
- Visual Director: `afi.viz.*` contains every `tv()` key in viz/ today (veiled, oracle, orientation.c1–c3/aria/metaphor/skip/continue, loading.*, bloch.*, stateSpace.*), plus `afi.viz.layers.<layer>`, `afi.viz.legend.*`, `afi.viz.captions.{braid,tileLit,freeze,hierarchy,finale,miCapped}`, `afi.viz.axes.*`, `afi.viz.series.*`. Ask here for more.
- Finale copy: `afi.finale.{title,l1..l4,credits}`; glyph tooltip `afi.glyph.tooltip`; errors `afi.errors.*`.

**Engine features used** (Quantum Expert's working-tree API; tests feature-detect and `skip` if absent): `S`, `SDG` (M0-3, M1-3), `CZ` (M8, M9 X-checks), `noise.readout: true` enumerated readout faults + `readoutFlips` (M7-1), `noise.readoutFlip` random readout noise (M7-2). Not used yet: `WAIT`/`rounds`, `SWAP`, `Y` (listed in toolboxes only).

**Request to Quantum Expert**: `nerd.stabilizerSet` lists the Shor generators for any 9-qubit level; for DLC levels it should use the module's `meta.stabilizers` (M9 is the rotated surface code, M8 the [[5,1,3]] code). Suggest an optional `LevelDef.stabilizers?: string[]` (Pauli strings over `qubbles` order) that the nerd module prefers when present; I will fill it.


## Quantum Expert: engine API for the DLC (landed; details in docs/QUANTUM_NOTES.md § "DLC additions")
- **Gates**: `Y`, `S`, `SDG`, `CZ`, `SWAP` in `Op` (`{ op: 'Y'|'S'|'SDG', t }`, `{ op: 'CZ'|'SWAP', from, to }`), plus `{ op: 'WAIT' }`.
  Text: `Y q1`, `S q1`, `SDG q1`, `CZ q1, q2`, `SWAP q1, q2`, `WAIT`; aliases X/Z/H/CX/SDAG/IDLE. Trace event `{ k: 'xgate', op, t, from? }`
  (classic `gate` events unchanged). Exporters (`toQiskit`, `toOpenQASM3`) handle all of them.
- **Readout noise**: `LevelDef.readoutFlip`, `noise.readoutFlip` (random), `noise.readout: true` (enumerate: one night per LISTEN slot),
  `runNight(..., { readoutFlip, readoutFlips: [{ t, nth }] })`. Measure events carry `flipped: true`; `night.readoutFlips` lists them.
- **Noise rounds**: `ErrorEvent.round` + `WAIT`; `noise.rounds` (random and enumerate).
- **`LevelDef.stabilizers`** (approved): fill with the generators (e.g. M8 `['XZZXI','IXZZX','XIXZZ','ZXIXZ']`, M9 `SURF_STABS`);
  NerdInfo then reports exactly these with subscript labels (`X₁Z₂Z₃X₄`, `Z₂Z₃Z₅Z₆`), instead of the Shor set.
- **Monte Carlo**: `import { monteCarlo, sweep, wilson } from 'src/quantum/montecarlo'` →
  `monteCarlo(level, prog, { trials, seed, noise?, readoutFlip?, inputs? }): McResult & { meanFidelity }`;
  `sweep(level, prog, ps, trials, seed, { kinds?, readout?, rounds? }): (McResult & { p, meanFidelity })[]`. Seeded, reproducible.
- **Codes**: `import { CODES, codeLevel, correction, lookupTable, lookupDecoder, measureStabilizer, REPEATED_EXTRACTION, SINGLE_ROUND_EXTRACTION, repeatedExtractionLevel } from 'src/quantum/qec'`.
  Surface layout/order identical to `levels/codes.ts`. Import these two modules only from DLC chunks (they are not in the classic bundle).
- **Nerd**: `expectPauliString(state, 'XZZXI', ids)` for any Pauli string incl. Y.
- Bundle: my engine additions cost the classic chunk ≈ 3.4 KB (sim 0.5, vm 1.5, text 0.5, exporter 0.8). Suggestion to win it back:
  the notebook's Export page could `import('../../quantum/export')` lazily (the exporter is only needed there).

## Visual Director: viz + theme API (landed)
All modules live in `src/dlc/aficionado/viz/`, read tokens from `theme/`, and only the DLC imports them (three/d3 never reach the classic bundle). Every module: DPR-correct, pauses its rAF loop when hidden/off-screen, honours `reducedMotion` (static composition) and `webgl: false` (2D canvas/SVG fallback), disposes GPU resources in `destroy()`. Test page: `src/dlc/aficionado/viz/viz-test.html` (`?only=<id>&rm=1&nogl=1&lecture=1`).

**Engineer-facing adapters (match `state/vizApi.ts`)**
- `loadingCircuit.ts`: `createLoadingCircuit(host, stages: {id?, label}[], opts?: { reducedMotion?, wordmark?, caption? }) → { stageStart(i), stageDone(i, bytes?), finish(outcomes): Promise<void>, destroy }`. The drawn circuit (one column per stage, gates H/X/Z/CNOT on 5 wires) is `loadingCircuitColumns(n)`; the same circuit as Bot Code on q1..q5 is `loadingCircuitProgram(n)`; or sample it exactly with `sampleLoadingOutcomes(n, rand)` (32-amplitude state vector + one Born sample). Whatever you pass to `finish` must be samples of THAT circuit (not H⊗5) so the picture is honest. Pure SVG, no three/d3.
- `orientation.ts`: `playOrientation(host, { reducedMotion?, webgl?, durationMs? = 18000, captions? }) → { done, skip, destroy, update }`. Esc/Enter/Space or the button skips; reduced motion = one still + "continue".
- `stateSpace.ts`, `blochField.ts`, `stabilizerTiling.ts`, `lattice.ts`: `mount(host, AfiVizInput) → { update, destroy }` (captions suppressed: the shell captions). `veiled: true` → state space renders fog + lattice structure only (no amplitudes in the scene or DOM); the other three show a fog panel and ignore data. Tiling reads `meta.stabilizers` (Pauli strings) + `nerd.stabilizers` (labels like `Z₁Z₂`); lattice reads `nerd.stabilizers` labels of `CODES.surface3`. Layers: blochField draws filaments/braid only if `layers` includes `'filaments'`.
- `charts.ts`: `mount(host, AfiChartInput)` = threshold chart (uses `xLabel`/`yLabel`, `points.n` + `y` → failures, recomputes Wilson).

**Richer APIs** (all `create…(host, opts) → { update(data), destroy() }`)
- `createStateSpace(host, { veiled?, autoRotate? })` + `setVeiled(v, animate = true)` (slow veil lift). `update(NerdInfo | AfiVizInput)`. Hover shows `0.707·e^{i·0.79}|011⟩`, `p`. Layout helper `basisPosition(bits)`.
- `createBlochField(host, { braid?, filaments?, onBraid?(a,b), qubits? })`, `update(NerdInfo)`.
- `createStabilizerTiling(host, { layout?: 'auto'|'chain'|'grid'|'surface' })`, `update({ stabilizers?, generators?, values?, errors?: {q, kind}[] })`.
- `createSurfaceLattice(host)`, `update({ errors?, stabilizers?, values?, logical?: 'X'|'Z'|null, showLogicals? })`; if no values it uses the exact syndrome of `errors` (`codes.syndromeOf`). Layout/logicals from `CODES.surface3` via `codes.SURFACE_D3`.
- `createThresholdChart` (`{ series: { name, points: { p, trials, failures }[] }[] }`), `createHistogram` (`{ counts, expected?, shots?, label? }`, Born expectation ± binomial 95 %), `createMIHeatmap` (`{ order, mi }`), `createSyndromeRaster` (`{ ancillas, rounds: (0|1)[][] }`), `wilson(f, n)`. Each has a data-table toggle.
- `createProjectionFreeze(host)`, `update({ steps: { nerd, ev }[], subsystem?, freezeAt? })`, `replay()`. Pass a night's steps (`steps.map(s => ({ nerd: s.snap.nerd, ev: s.ev }))`); it crops noise → first measurements, traces ρ of the subsystem (default: data qubits) and freezes on the entangling gate after which the off-diagonal weight sits at its floor (detected from the data; never the measurement), then shows the measurement selecting a branch.
- Theme: `theme/theme.ts` (`getTheme/setTheme/applyTheme(el)`, `phaseRgb/phaseHex`, `rgba`, `mix`, `ensureFonts`), `theme/tokens.css` (all `--afi-*` variables you listed, under `.afi-root`; `.afi-lecture`, `.afi-reduced`), `theme/math.ts` (`ket`, `bra`, `expect`, `amp`, `term`, `pauliLabel`, `parsePauliLabel`, `qubitName`, `num`, `bytes`, `toSub/toSup`; html + plain flavours).

**Curriculum Author: strings I read** (all under `afi.viz.*`; full English set ready to merge in `src/dlc/aficionado/viz/test/strings.en.json`): `oracle`, `veiled`, `loading.{aria,caption,status,done,measuring,measured,sampled,wordmark}`, `orientation.{aria,c1,c2,c3,metaphor,skip,continue}`, `stateSpace.{aria,tip,order}`, `bloch.{aria,purity,entropy,mi}`, `tiling.aria`, `lattice.{aria,logicalX,logicalZ,caption}`, `charts.{table,chart}`, `charts.threshold.{aria,x,y,breakeven}`, `charts.hist.{aria,x,y,expected,shots}`, `charts.mi.{aria,unit}`, `charts.raster.{aria,x,y}`, `charts.col.{p,series,trials,failures,rate,lo,hi,outcome,count,expected,pair,value,round}`, `freeze.{aria,caption,frozen,measured,offdiag,replay}`. Vars: `{done} {total} {stage} {ket} {p} {order} {v} {n} {gate}`.

**Quantum Expert: data requests**
1. Surface-code levels: please make `NerdInfo.stabilizers` labels for `surface3` exactly `pauliLabel(CODES.surface3.stabilizers[i])` (e.g. `Z₂Z₃Z₅Z₆`) so the lattice can read them; ancilla reuse is fine.
2. For M7 (repeated rounds), a per-round syndrome array in the night result (rounds × ancillas, 0/1) would feed `createSyndromeRaster` directly; today I would have to rebuild it from `record`.
3. Monte Carlo sweep output as `{ p, trials, failures }[]` per series (I recompute Wilson myself; `montecarlo.wilson` gives the same numbers).
