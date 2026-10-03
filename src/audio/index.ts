/**
 * NO PEEKING! — procedural WebAudio engine (zero assets, zero deps).
 * Safe before a user gesture: every call is a no-op (state is remembered) until unlock().
 *
 *   musicLayers ─┬─ harmonyLP (pad/ep/lead/arp) ─┐
 *                └─ bass/drums/crackle/clock ────┴─ musicMix → musicVol → duck ─┐
 *   tension (heartbeat/pizz/drone) ──────────────────────────────┘             │
 *   musicMix → verbSend ─┐                                                       ├─ master → glue comp → limiter → trim → out
 *   sfxBus  → sfxVerb ───┴─ convolver → verbVolM/verbVolS ──────────────────────┤
 *   sfx voices → panner → sfxBus(sfxVol) ────────────────────────────────────────┘
 */
import type { AudioAPI, MusicScene, SfxName, Speaker } from '../core/contracts';
import { Kit, makeNoise, makeImpulse, makeCrackle, clamp, rand } from './core';
import { Sequencer, MusicBus, LAYERS, Layer, buildDrone } from './music';
import { SFX, SFX_GAIN } from './sfx';
import { botBeep, botQuiet, STRUM } from './bots';
import { Babbler } from './voice';

const LOOKAHEAD = 0.12; // s scheduled ahead
const TICK_MS = 25;

export interface EngineOpts {
  /** For offline rendering/tests: skip the setTimeout loop (caller drives scheduleUntil). */
  manual?: boolean;
}

export class AudioEngine implements AudioAPI {
  ctx: BaseAudioContext | null = null;
  private kit!: Kit;
  seq: Sequencer | null = null;
  private master!: GainNode;
  private musicVol!: GainNode;
  private sfxVol!: GainNode;
  private duck!: GainNode;
  private speechDuck!: GainNode;
  private voiceVol!: GainNode;
  private babbler: Babbler | null = null;
  private sfxBus!: GainNode;
  private sfxVerb!: GainNode;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private unlocking: Promise<void> | null = null;
  private lastSfx = new Map<SfxName, number>();
  private liveSfx = new Map<SfxName, number>();
  /** state remembered before unlock */
  private st = { scene: 'title' as MusicScene, harmony: 1, tension: 0, vol: { master: 0.9, music: 0.6, sfx: 0.85, voice: 0.5 } };

  // ───────── lifecycle ─────────
  unlock(): Promise<void> {
    if (this.unlocking) return this.unlocking.then(() => this.resume());
    if (typeof window === 'undefined') return Promise.resolve();
    const AC: typeof AudioContext | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return Promise.resolve();
    const ctx = new AC({ latencyHint: 'interactive' });
    this.unlocking = ctx.resume().catch(() => {}).then(() => {
      this.attach(ctx);
      this.timer = setTimeout(this.tick, 0);
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) void ctx.suspend();
        else void ctx.resume();
      });
    });
    return this.unlocking;
  }

  private resume(): Promise<void> {
    const c = this.ctx as AudioContext | null;
    return c && c.state === 'suspended' && typeof c.resume === 'function' ? c.resume().catch(() => {}) : Promise.resolve();
  }

  /** Build the graph on any context (live AudioContext or OfflineAudioContext). */
  attach(ctx: BaseAudioContext, opts: EngineOpts = {}): void {
    this.ctx = ctx;
    const g = (v = 1) => {
      const n = ctx.createGain();
      n.gain.value = v;
      return n;
    };
    // wobble LFO (cents) → music osc.detune
    const wobbleDepth = g(0);
    const l1 = ctx.createOscillator();
    l1.frequency.value = 0.55;
    const l2 = ctx.createOscillator();
    l2.frequency.value = 4.3;
    const l2g = g(0.3);
    l1.connect(wobbleDepth);
    l2.connect(l2g).connect(wobbleDepth);
    l1.start();
    l2.start();
    this.kit = { ctx, noise: makeNoise(ctx), wobble: wobbleDepth, active: { n: 0 } };

    // master chain
    this.master = g(this.st.vol.master);
    const glue = ctx.createDynamicsCompressor();
    glue.threshold.value = -20;
    glue.knee.value = 12;
    glue.ratio.value = 2.5;
    glue.attack.value = 0.01;
    glue.release.value = 0.25;
    const lim = ctx.createDynamicsCompressor();
    lim.threshold.value = -9;
    lim.knee.value = 0;
    lim.ratio.value = 20;
    lim.attack.value = 0.001;
    lim.release.value = 0.12;
    const trim = g(0.66); // tuned by offline render: peaks ≈ -6 dBFS
    this.master.connect(glue).connect(lim).connect(trim).connect(ctx.destination);

    // reverb
    const conv = ctx.createConvolver();
    conv.buffer = makeImpulse(ctx);
    const verbOut = g(1);
    conv.connect(verbOut).connect(this.master);

    // music
    this.musicVol = g(this.st.vol.music);
    this.duck = g(1);
    const musicMix = g(1);
    this.speechDuck = g(1);
    musicMix.connect(this.musicVol).connect(this.duck).connect(this.speechDuck).connect(this.master);
    const verbSend = g(0.3);
    this.duck.connect(verbSend).connect(conv);
    const harmonyLP = ctx.createBiquadFilter();
    harmonyLP.type = 'lowpass';
    harmonyLP.frequency.value = 7000;
    harmonyLP.connect(musicMix);
    const layer = {} as Record<Layer, GainNode>;
    for (const l of LAYERS) {
      layer[l] = g(0);
      layer[l].connect(l === 'pad' || l === 'ep' || l === 'lead' || l === 'arp' ? harmonyLP : musicMix);
    }
    // EP tremolo
    const trem = g(0.85);
    const tl = ctx.createOscillator();
    tl.frequency.value = 4.2;
    const tlg = g(0.15);
    tl.connect(tlg).connect(trem.gain);
    tl.start();
    const epIn = g(1);
    epIn.connect(trem).connect(layer.ep);
    // music box gets extra sparkle reverb
    const leadVerb = g(0.35);
    layer.lead.connect(leadVerb).connect(conv);
    // crackle loop
    const cr = ctx.createBufferSource();
    cr.buffer = makeCrackle(ctx);
    cr.loop = true;
    const crHp = ctx.createBiquadFilter();
    crHp.type = 'bandpass';
    crHp.frequency.value = 3200;
    crHp.Q.value = 0.4;
    const crG = g(0.09);
    cr.connect(crHp).connect(crG).connect(layer.crackle);
    cr.start();
    // tension
    const tension = g(0);
    tension.connect(musicMix);
    const droneGain = g(0);
    droneGain.connect(tension);
    buildDrone(ctx, droneGain);

    const bus: MusicBus = { layer: { ...layer, ep: epIn }, gains: layer, tension, droneGain, harmonyLP, wobbleDepth, verbSend };
    this.seq = new Sequencer(this.kit, bus);

    // sfx
    this.sfxVol = g(this.st.vol.sfx);
    this.sfxBus = g(1);
    this.sfxBus.connect(this.sfxVol).connect(this.master);
    this.sfxVerb = g(0.18);
    this.sfxVol.connect(this.sfxVerb).connect(conv);
    // voices ("Qubblese"): own level, also follows the sfx slider
    this.voiceVol = g(this.st.vol.voice);
    this.voiceVol.connect(this.sfxVol);
    const voiceVerb = g(0.5);
    voiceVerb.connect(conv);
    this.babbler = new Babbler(this.kit, this.voiceVol, voiceVerb);

    // restore remembered state
    this.seq.scene = this.st.scene;
    this.seq.setHarmony(this.st.harmony, ctx.currentTime);
    this.seq.setTension(this.st.tension, ctx.currentTime);
    this.seq.start(ctx.currentTime + 0.08);
    if (opts.manual) return;
  }

  private tick = (): void => {
    const c = this.ctx;
    if (!c || !this.seq) return;
    if ((c as AudioContext).state === 'running') this.seq.scheduleUntil(c.currentTime + LOOKAHEAD, c.currentTime);
    this.timer = setTimeout(this.tick, TICK_MS);
  };

  /** Offline / manual driving. */
  scheduleUntil(t: number): void {
    if (this.ctx && this.seq) this.seq.scheduleUntil(t, this.ctx.currentTime);
  }

  private get live(): boolean {
    return !!this.ctx && !!this.seq;
  }

  // ───────── AudioAPI ─────────
  sfx(name: SfxName, opts: { pan?: number; pitch?: number; volume?: number } = {}): void {
    if (!this.live) return;
    const fn = SFX[name];
    if (!fn) return;
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    // anti-spam: same sfx within 30 ms is dropped; max 4 overlapping copies
    const last = this.lastSfx.get(name) ?? -1;
    if (now - last < 0.03) return;
    if ((this.liveSfx.get(name) ?? 0) >= 4) return;
    if (this.kit.active.n > 90) return;
    this.lastSfx.set(name, now);
    const p = clamp(opts.pitch && opts.pitch > 0 ? opts.pitch : 1, 0.25, 4) * rand(0.97, 1.03);
    const vol = clamp(opts.volume ?? 1, 0, 2) * (SFX_GAIN[name] ?? 1) * rand(0.9, 1.0);
    const pan = ctx.createStereoPanner();
    pan.pan.value = clamp((opts.pan ?? 0) + rand(-0.05, 0.05), -1, 1);
    const vg = ctx.createGain();
    vg.gain.value = vol;
    pan.connect(vg).connect(this.sfxBus);
    const dur = fn(this.kit, pan, now + 0.005, p);
    this.liveSfx.set(name, (this.liveSfx.get(name) ?? 0) + 1);
    // free the per-call bus nodes after the sound (silent ConstantSource as a timer that works offline too)
    const timer = ctx.createConstantSource();
    timer.offset.value = 0;
    timer.connect(vg);
    timer.onended = () => {
      pan.disconnect();
      vg.disconnect();
      timer.disconnect();
      this.liveSfx.set(name, Math.max(0, (this.liveSfx.get(name) ?? 1) - 1));
    };
    timer.start(now);
    timer.stop(now + dur + 0.6);
  }

  setScene(scene: MusicScene): void {
    if (scene !== 'win') this.st.scene = scene;
    this.seq?.setScene(scene);
  }

  setHarmony(fidelity: number): void {
    const f = Number.isFinite(fidelity) ? clamp(fidelity, 0, 1) : 1;
    this.st.harmony = f;
    if (this.live) this.seq!.setHarmony(f, this.ctx!.currentTime);
  }

  setTension(t: number): void {
    const v = Number.isFinite(t) ? clamp(t, 0, 1) : 0;
    this.st.tension = v;
    if (this.live) this.seq!.setTension(v, this.ctx!.currentTime);
  }

  botNote(botIndex: number, result: 0 | 1): void {
    if (!this.live) return;
    const t = this.ctx!.currentTime + 0.005;
    this.duckMusic(t);
    if (result) botBeep(this.kit, this.sfxBus, botIndex, t);
    else botQuiet(this.kit, this.sfxBus, botIndex, t);
  }

  syndromeChord(bits: (0 | 1)[]): void {
    if (!this.live || !bits.length) return;
    const t = this.ctx!.currentTime + 0.01;
    this.duckMusic(t, 1.2);
    bits.slice(0, 8).forEach((b, i) => {
      if (b) botBeep(this.kit, this.sfxBus, i, t + i * STRUM, 1.1);
      else botQuiet(this.kit, this.sfxBus, i, t + i * STRUM, 1.2);
    });
  }

  /** Speech babble: call once per revealed character. Deterministic per text; self-throttled. */
  voice(who: Speaker, _ch: string, index: number, line: string): void {
    if (!this.live || !this.babbler || typeof line !== 'string') return;
    const end = this.babbler.speak(who, index, line);
    if (!end) return;
    // gentle duck (-2 dB) while speaking; recovers ~0.4 s after the last syllable
    const p = this.speechDuck.gain;
    const now = this.ctx!.currentTime;
    p.cancelScheduledValues(now);
    p.setTargetAtTime(0.78, now, 0.05);
    p.setTargetAtTime(1, end + 0.25, 0.25);
  }

  setVoiceVolume(v: number): void {
    this.st.vol.voice = clamp(Number.isFinite(v) ? v : 0.5, 0, 1);
    if (this.live) this.voiceVol.gain.setTargetAtTime(this.st.vol.voice, this.ctx!.currentTime, 0.05);
  }

  setVolumes(v: { master?: number; music?: number; sfx?: number }): void {
    const s = this.st.vol;
    if (v.master !== undefined) s.master = clamp(v.master, 0, 1);
    if (v.music !== undefined) s.music = clamp(v.music, 0, 1);
    if (v.sfx !== undefined) s.sfx = clamp(v.sfx, 0, 1);
    if (!this.live) return;
    const now = this.ctx!.currentTime;
    this.master.gain.setTargetAtTime(s.master, now, 0.05);
    this.musicVol.gain.setTargetAtTime(s.music, now, 0.05);
    this.sfxVol.gain.setTargetAtTime(s.sfx, now, 0.05);
  }

  /** Sidechain-style dip so bot notes / syndrome chords always cut through the music. */
  private duckMusic(t: number, hold = 0.6): void {
    const p = this.duck.gain;
    p.cancelScheduledValues(t);
    p.setTargetAtTime(0.45, t, 0.02);
    p.setTargetAtTime(1, t + hold, 0.35);
  }
}

export const audio: AudioEngine = new AudioEngine();
export default audio;
