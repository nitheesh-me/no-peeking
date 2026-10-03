
## From Level Designer (src/levels) — semantics the levels rely on (please confirm/implement in src/quantum)

1. **fixedBedtime + editable bedtime (3-1)**: when a level has `fixedBedtime` AND `editable` includes `'bedtime'`, run `fixedBedtime` FIRST, then the player's bedtime program, as one bedtime phase. (3-1 keeps the 2-3 encoder fixed; the player appends "sideways glasses" SPINs to it.) Same rule for fixedMorning + editable morning: fixed first, then player's. If you would rather not, tell me and I'll switch 3-1 to `starterBedtime`.
2. **Subset `dataQubits` (1-3)**: `goal.dataQubits` may be a strict subset of the qubbles. Fidelity = fidelity of the *reduced* state on those qubbles vs the reduced target (target = targetCircuit on input⊗|0…0>). 1-3 checks only `['q2']` (the "copy" trap must pass zero/one and fail on swirls because q2 ends up mixed).
3. **Classical levels (0-1, 0-2)** use `goal.kind: 'state'` (not 'classical'), with `classical: true, allowPeekData: true`. IF conditions may reference a peeked qubble (`{who:'q1', is:'BEEP'}`).
4. **Rate goal (2-5)**: `{kind:'rate', nights:300, minRate:0.93}` with `noise:{mode:'random', p:0.1, kinds:['flip']}` and `inputs:['random']`. Night passes if fidelity ≥ minFidelity (default your threshold, e.g. 0.99). Expected: coded ≈ 0.972, empty program ≈ 0.729, unprotected single qubble would be 0.9.
5. **Wobble (3-3)**: `noise:{mode:'enumerate', kinds:['wobble'], maxErrors:1, wobbleAngles:[...]}` should produce one night per target × angle; I use `axis:'x'` angles for a bit-flip-code level. If `enumerate` wobble needs an axis field, please default to 'x' (or add `wobbleAxis?: 'x'|'z'` to NoiseSpec).
6. **Lines count** = instructions excluding LABEL and NOTE (as in TestReport.lines). Par values in levels assume that.

## Director decisions (12:12 IST)
- Level Designer items 1–6: **ACCEPTED**. Quantum implements: fixed-then-player phase concatenation; subset dataQubits reduced fidelity; classical levels via 'state' goal with peeked-qubble IF conds; rate-goal night passes at fidelity ≥ minFidelity (default 0.99); lines exclude LABEL/NOTE.
- Contract change: `NoiseSpec` enumerate gains optional `wobbleAxis?: 'x'|'z'` (default 'x').

## From Lead Programmer (src/engine, src/ui) — 12:xx IST
1. **`line` events and fixed+player phases.** The VM restarts `pc` at 0 for the player's part after running `fixedBedtime`/`fixedMorning`, so a `{k:'line', phase, pc}` event is ambiguous about which part it belongs to. The engine currently infers the part heuristically (`Playback.mapLines`: switch to the player's part when pc resets to 0 right after the last fixed line, with no taken jump). Request: add an optional `part?: 'fixed' | 'mine'` to the `line` TraceEvent (non-breaking).
2. **Replays of test nights** use `runNight(level, prog, night.input, night.errors, night.seed)`. `seed` is on the VM's `NightResultX` but not on the contract's `NightResult`. Request: add `seed?: number` to `NightResult` so the X-ray replay of a clicked night is guaranteed to show the same measurement outcomes.

## Director decisions (12:50 IST)
- Programmer requests ACCEPTED: `line` TraceEvent gains `part?: fixed|mine`; `NightResult` gains `seed?`. Quantum to emit both.
