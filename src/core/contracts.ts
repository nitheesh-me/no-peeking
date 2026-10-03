/**
 * NO PEEKING! — shared contracts. Owned by the Director.
 * Every module codes against these types. Need a change? Write it in docs/CONTRACT_REQUESTS.md.
 */

// ───────────────────────── Identifiers ─────────────────────────
/** Data qubits are 'q1'..'q9' (Qubbles). Ancilla qubits are bots 'a'..'h'. */
export type QubbleId = `q${number}`;
export type BotId = 'a' | 'b' | 'c' | 'd' | 'e' | 'f' | 'g' | 'h';
export type QubitId = QubbleId | BotId;
export const isBot = (id: string): id is BotId => /^[a-h]$/.test(id);
export const isQubble = (id: string): id is QubbleId => /^q\d+$/.test(id);

// ───────────────────────── Bot Code (player language) ─────────────────────────
export type OpName =
  | 'BOOP' | 'SHUSH' | 'SPIN' | 'HIGHFIVE' | 'LISTEN' | 'RESET' | 'PEEK'
  | 'IF' | 'JUMP' | 'LABEL' | 'END' | 'NOTE';

export type Cond = { who: QubitId; is: 'BEEP' | 'QUIET' }; // BEEP = last measured 1, QUIET = 0 (unmeasured counts as QUIET)

export type Op =
  | { op: 'BOOP'; t: QubitId }                    // X
  | { op: 'SHUSH'; t: QubitId }                   // Z
  | { op: 'SPIN'; t: QubitId }                    // H
  | { op: 'HIGHFIVE'; from: QubitId; to: QubitId } // CNOT control=from target=to
  | { op: 'LISTEN'; t: BotId }                    // Z-measure a bot
  | { op: 'RESET'; t: BotId }                     // reset bot to |0>
  | { op: 'PEEK'; t: QubitId }                    // Z-measure anything (qubble ⇒ "woke" if level forbids)
  | { op: 'IF'; conds: Cond[]; label: string }    // jump if ALL conds hold
  | { op: 'JUMP'; label: string }
  | { op: 'LABEL'; name: string }
  | { op: 'END' }
  | { op: 'NOTE'; text: string; drawing?: string }; // drawing = SVG path data in a 0..100 × 0..40 box (doodle comment)

export type Program = Op[];
export type Phase = 'bedtime' | 'night' | 'morning';

// ───────────────────────── States & noise ─────────────────────────
/** Single-qubit logical input, as Bloch angles or named presets. */
export type InputState =
  | 'zero' | 'one' | 'plus' | 'minus' | 'plusI' | 'minusI'
  | { theta: number; phi: number }   // cos(θ/2)|0> + e^{iφ} sin(θ/2)|1>
  | 'random';                        // Haar-random each night (seeded)

export type GremlinKind = 'flip' | 'phase' | 'wobble' | 'both';
/** One concrete error event applied during the NIGHT phase. */
export type ErrorEvent =
  | { kind: 'flip'; t: QubbleId }                 // X
  | { kind: 'phase'; t: QubbleId }                // Z
  | { kind: 'both'; t: QubbleId }                 // Y (up to phase)
  | { kind: 'wobble'; t: QubbleId; axis: 'x' | 'z'; angle: number }; // exp(-i angle/2 σ)

export type NoiseSpec =
  | { mode: 'none' }
  | { mode: 'fixed'; errors: ErrorEvent[] }                         // same every night
  | { mode: 'enumerate'; kinds: GremlinKind[]; maxErrors: 0 | 1 | 2; targets?: QubbleId[]; wobbleAngles?: number[]; wobbleAxis?: 'x' | 'z' } // every combination as separate test nights
  | { mode: 'random'; p: number; kinds: GremlinKind[] };            // iid per qubble per night

// ───────────────────────── Levels ─────────────────────────
export interface Placement { id: QubitId; x: number; y: number } // iso grid coords (tiles), origin top
export interface WallSign { text: string; x: number; y: number }

export type GoalSpec =
  /** Final data-qubit state must equal targetCircuit applied to (input ⊗ |0..0>) on data qubits. */
  | { kind: 'state'; dataQubits: QubbleId[]; targetCircuit: Program; minFidelity?: number }
  /** As 'state' plus a bot must report a classical truth (e.g. parity). */
  | { kind: 'state+report'; dataQubits: QubbleId[]; targetCircuit: Program; report: { bot: BotId; expect: 'parity'; of: QubbleId[] }; minFidelity?: number }
  /** Classical levels: final peeked/computational values must match. */
  | { kind: 'classical'; expect: Record<QubbleId, 0 | 1> | 'restore' }
  /** Rate goal (Double Trouble / Night Shift): pass if success rate >= threshold over N random nights. */
  | { kind: 'rate'; dataQubits: QubbleId[]; targetCircuit: Program; nights: number; minRate: number; minFidelity?: number };

export interface LevelDef {
  id: string;                 // '2-3'
  chapter: 0 | 1 | 2 | 3 | 4 | 5;
  title: string;              // Quantum-font safe: letters/digits/!? only
  subtitle?: string;
  qubbles: Placement[];
  bots: Placement[];
  signs?: WallSign[];
  classical?: boolean;        // Ch0 bit-balls: peeking allowed and expected
  allowPeekData?: boolean;    // default false unless classical
  toolbox: OpName[];
  /** Panels the player edits. Phases not listed run the level's fixed program (or nothing). */
  editable: ('bedtime' | 'morning')[];
  fixedBedtime?: Program;     // if bedtime not editable (e.g. pre-encoding)
  fixedMorning?: Program;
  starterBedtime?: Program;   // pre-filled editable code
  starterMorning?: Program;
  inputs: InputState[];       // test nights iterate inputs × noise cases
  /** Initial |ψ> is loaded into this qubble; all others & bots start |0>. */
  inputQubble: QubbleId;
  noise: NoiseSpec;
  goal: GoalSpec;
  maxSteps?: number;          // runaway-loop guard (default 500)
  challenges?: { lines?: number; steps?: number; bots?: number };
  /** Dialogue — Schrödi (cat) & gremlins. Short. Funny. */
  intro: DialogueLine[];
  hints: string[];            // escalating, shown on request
  winLine: DialogueLine[];    // after win
  reveal: string;             // the one-line "ohhh" (plain words) shown after win
  proTerm?: string;           // "Pros call this: the 3-qubit bit-flip code"
  meta?: MetaBeat[];          // scripted meta events
  /** Reference solution — must pass. Used by tests & 'show solution' after 3 fails. */
  solution: { bedtime?: Program; morning?: Program };
  /** Intentionally-wrong programs that MUST fail (verifies the lesson bites). */
  traps?: { name: string; bedtime?: Program; morning?: Program }[];
  lightsOut?: boolean;        // 4-2
}
export type Speaker = 'schrodi' | 'flipper' | 'phasey' | 'wobbles' | 'qubble' | 'eye' | 'system';
export interface DialogueLine { who: Speaker; text: string; mood?: 'deadpan' | 'smug' | 'shock' | 'happy' | 'sleepy' }
export type MetaBeat =
  | 'title-peek' | 'clone-glitch' | 'peek-hazard-tape' | 'map-flip' | 'lights-out' | 'credits' | 'night-lab-unlock';

// ───────────────────────── Simulation trace (VM → renderer/audio) ─────────────────────────
export interface Bloch { x: number; y: number; z: number; } // reduced single-qubit Bloch vector (length<1 ⇒ entangled/mixed)
export interface Snapshot {
  bloch: Record<QubitId, Bloch>;
  /** pairs with notable entanglement (mutual info > ~0.1) for drawing silk threads */
  links: { a: QubitId; b: QubitId; strength: number }[];
  /** Top amplitudes for nerd mode: ket label like '011|a=1' ordered by qubit list */
  amps: { ket: string; re: number; im: number; p: number }[];
  lights: Partial<Record<QubitId, 0 | 1 | null>>;
  logicalFidelity?: number; // vs ideal (if computable at this point)
}

export type TraceEvent =
  | { k: 'phase'; phase: Phase }
  | { k: 'line'; phase: Phase; pc: number; part?: 'fixed' | 'mine' } // pc indexes into that part's program
  | { k: 'gate'; op: 'BOOP' | 'SHUSH' | 'SPIN' | 'HIGHFIVE' | 'RESET'; t: QubitId; from?: QubitId }
  | { k: 'measure'; t: QubitId; result: 0 | 1; woke: boolean } // woke = data qubble measured in no-peek level
  | { k: 'jump'; to: number; taken: boolean }
  | { k: 'noise'; e: ErrorEvent }
  | { k: 'end'; reason: 'done' | 'END' | 'maxSteps' | 'error'; message?: string };

export interface TraceStep { ev: TraceEvent; snap: Snapshot }

export interface NightResult {
  input: InputState;          // concrete (resolved) input
  seed?: number;              // seed used for this night (for exact replays)
  errors: ErrorEvent[];
  steps: TraceStep[];
  fidelity: number;           // final data fidelity with target (0..1)
  woke: QubbleId[];
  reportOk?: boolean;
  pass: boolean;
  stepCount: number;          // executed instructions (excluding night)
  failReason?: 'woke' | 'wrong-dream' | 'wrong-report' | 'maxSteps' | 'error';
}

export interface TestReport {
  levelId: string;
  nights: NightResult[];
  passed: boolean;
  passRate: number;
  lines: number;              // instruction count excl. labels/notes
  avgSteps: number;
  botsUsed: number;
}

// ───────────────────────── Module APIs ─────────────────────────
/** Implemented by src/quantum/ (Quantum Expert). Pure, deterministic given seed. */
export interface QuantumAPI {
  /** Run one night fully; returns trace for animation. */
  runNight(level: LevelDef, prog: { bedtime?: Program; morning?: Program }, input: InputState, errors: ErrorEvent[], seed: number): NightResult;
  /** Build the test suite and run all nights. */
  testLevel(level: LevelDef, prog: { bedtime?: Program; morning?: Program }, seed?: number): TestReport;
  /** Parse/print text form of programs (shareable). */
  parseProgram(text: string): { prog: Program; errors: { line: number; msg: string }[] };
  printProgram(prog: Program): string;
}

/** Implemented by src/audio/ (Audio Designer). Must be safe to call before user gesture (no-ops until unlocked). */
export type SfxName =
  | 'boop' | 'shush' | 'spin' | 'highfive' | 'listen_beep' | 'listen_quiet' | 'reset' | 'peek_collapse'
  | 'gremlin_sneak' | 'gremlin_flip' | 'ghost_phase' | 'wobble' | 'test_pass' | 'test_fail' | 'level_win'
  | 'ui_click' | 'ui_hover' | 'card_pick' | 'card_drop' | 'rewind' | 'snap_measure' | 'qubble_snore'
  | 'qubble_giggle' | 'schrodi_meow' | 'glitch';
export type MusicScene = 'title' | 'map' | 'build' | 'run' | 'win' | 'lightsout' | 'lab' | 'credits';
export interface AudioAPI {
  unlock(): Promise<void>;
  sfx(name: SfxName, opts?: { pan?: number; pitch?: number; volume?: number }): void;
  setScene(scene: MusicScene): void;
  /** 0..1 — consonance follows the logical fidelity (physics-driven harmony). */
  setHarmony(fidelity: number): void;
  setTension(t: number): void; // 0..1 gremlin presence (even when hidden visually)
  /** Bot note when LISTEN result arrives; botIndex picks its pentatonic voice. */
  botNote(botIndex: number, result: 0 | 1): void;
  /** Full syndrome chord (Lights Out). */
  syndromeChord(bits: (0 | 1)[]): void;
  setVolumes(v: { master?: number; music?: number; sfx?: number }): void;
  // ── v0.2 additions ──
  /** Speech babble ("Qubblese"): call once per revealed character of a dialogue line. Audio decides throttling,
   *  syllable shape from the letters, speaker voice, and end-of-line inflection (?, !, …). `index` = char index in line. */
  voice?(who: Speaker, ch: string, index: number, line: string): void;
  /** Volume for voices (default ~0.5 of sfx). */
  setVoiceVolume?(v: number): void;
}

/** Implemented by src/art/ (Art Designer). Pure canvas drawing; all coordinates in screen px. */
export interface QubbleVisual {
  bloch: Bloch;        // drives colour: z>0 Sunny, z<0 Moony; x/y phase → swirl dir & rim hue; |r|<1 → misty
  blanket: number;     // 0 = no blanket … 1 = fully covered (opaque); X-ray uses ~0.25
  state: 'sleep' | 'awake-grumpy' | 'collapsed' | 'happy' | 'scared' | 'giggle' | 'mumble'; // mumble = rolls over in sleep (poked)
  label?: string;      // 'q1'
  classical?: boolean; // bit-ball with sleep mask
  highlight?: boolean;
  /** HIGHFIVE gooey arm: screen-px vector to partner, t = reach 0..1 */
  arm?: { dx: number; dy: number; t: number };
  /** classical data box only: 0..1 progress of a BOOP tumble (the box flips over in the air; digit changes at the top) */
  tumble?: number;
}
export interface BotVisual {
  light: 0 | 1 | null;
  action: 'idle' | 'roll' | 'highfive' | 'listen' | 'reset' | 'celebrate' | 'confused' | 'wave';
  facing: -1 | 1;
  label?: string;
}
export interface ArtAPI {
  ready(): Promise<void>; // load any images
  drawFloor(ctx: CanvasRenderingContext2D, cols: number, rows: number, iso: IsoFn, t: number, night: number): void; // night 0..1
  drawBackground(ctx: CanvasRenderingContext2D, w: number, h: number, t: number, night: number): void;
  drawQubble(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, v: QubbleVisual, t: number): void;
  drawBot(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, v: BotVisual, t: number): void;
  drawGremlin(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, kind: 'flipper' | 'phasey' | 'wobbles', pose: 'sneak' | 'strike' | 'flee' | 'taunt', t: number): void;
  drawSchrodi(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, mood: DialogueLine['mood'], t: number): void;
  drawLink(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, strength: number, t: number): void; // entanglement silk thread
  drawSign(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, text: string, t: number, shake?: number): void;
  drawParticles?(ctx: CanvasRenderingContext2D, t: number): void;
  /** Spawn juice particles: e.g. 'highfive' sparks, 'collapse' pop, 'flip' red zap, 'phase' purple swirl, 'win' confetti */
  burst?(kind: 'highfive' | 'collapse' | 'flip' | 'phase' | 'wobble' | 'win' | 'reset', x: number, y: number): void;
  /** DOM-friendly portrait (data URL / SVG string) for dialogue boxes. */
  portrait(who: Speaker, mood?: DialogueLine['mood']): string;
  palette: Record<string, string>;
  // ── v0.2 additions ──
  /** Grounded daycare ROOM diorama (replaces the floating island): floor + two back walls (window with sky/moon, shelves, nightlight, door). Fills the play area. */
  drawRoom?(ctx: CanvasRenderingContext2D, cols: number, rows: number, iso: IsoFn, t: number, night: number): void;
  /** The caretaker (player avatar): sleepy kid in pyjamas + nightcap who performs the cards. Anchor = feet. */
  drawCaretaker?(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, v: CaretakerVisual, t: number): void;
  /** Level-map primitives (night-sky dream map). */
  drawMapBackdrop?(ctx: CanvasRenderingContext2D, w: number, h: number, t: number): void;
  drawMapIsland?(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, chapter: number, color: string, unlocked: boolean, t: number): void;
  drawMapNode?(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, v: MapNodeVisual, t: number): void;
  drawMapPath?(ctx: CanvasRenderingContext2D, pts: { x: number; y: number }[], progress: number, t: number): void;
  // ── v0.3 additions ──
  /** A sign/poster mounted FLAT on a back wall, sheared into the wall plane. Anchor = centre of the sign on the wall surface.
   *  wall 'left' = the back wall along the grid edge gx=0 (it runs along +gy); 'right' = the back wall along gy=0 (runs along +gx). */
  drawWallSign?(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, text: string, wall: 'left' | 'right', t: number, shake?: number): void;
  /** Schrödi OUT of the box, performing his checklist (the level's fixed cards). Anchor = feet. */
  drawSchrodiActor?(ctx: CanvasRenderingContext2D, x: number, y: number, s: number, v: SchrodiActorVisual, t: number): void;
}
export interface SchrodiActorVisual {
  action: 'sit' | 'walk' | 'boop' | 'shush' | 'spin' | 'point' | 'listen' | 'press' | 'stretch' | 'hop-in' | 'hop-out' | 'yawn';
  phase: number; // 0..1, contact ~0.5
  facing: -1 | 1;
  mood?: DialogueLine['mood'];
}
export interface CaretakerVisual {
  action: 'idle' | 'tiptoe' | 'boop' | 'shush' | 'spin' | 'peek' | 'listen' | 'press' | 'cheer' | 'facepalm' | 'yawn';
  /** 0..1 progress through the action (wind-up → contact → recover; contact at ~0.5) */
  phase: number;
  facing: -1 | 1;
  flashlight?: boolean; // PEEK
}
export interface MapNodeVisual {
  id: string; title: string;
  state: 'locked' | 'open' | 'done' | 'current';
  stars: number; // 0..3
  color: string;
  hover?: boolean;
}
export type IsoFn = (gx: number, gy: number, gz?: number) => { x: number; y: number };

export const PALETTE = {
  paper: '#f2f0eb', paper2: '#e8e5de', ink: '#0e0e0e', ink2: '#55524b', ink3: '#8a867d',
  red: '#fe443d', redInk: '#c8241e', sunny: '#ffb72b', moony: '#6c63ff', phasey: '#b04dff',
  mint: '#3ddc97', night: '#1a1a2e', night2: '#1a1a19',
} as const;
