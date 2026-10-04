"""Trailer sound design + the peek-collapse signature motif (tuned to the song).

    python3 tools/video/audio/design.py                 # key/BPM from videos/music/cue_sheet.json,
                                                        # else analysed from trailer_edit.wav,
                                                        # else the provisional grid (96 BPM, F major)
    python3 tools/video/audio/design.py --key "D major" --bpm 96   # override

Outputs videos/audio2/design/*.wav (48 kHz / 24-bit) + design.json (per asset: duration,
hit_s = the sample offset of the hit/transient, align = how a cue should anchor it, featured).
Re-run after the song lands: every pitched / tempo-locked asset is regenerated.
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
from scipy import signal

sys.path.insert(0, str(Path(__file__).resolve().parent))
import dsp  # noqa: E402
from dsp import SR  # noqa: E402

ROOT = Path(__file__).resolve().parents[3]
LIB = ROOT / 'videos/audio2/lib'
OUT = ROOT / 'videos/audio2/design'
CUE = ROOT / 'videos/music/cue_sheet.json'
SONG = ROOT / 'videos/music/trailer_edit.wav'
PCS = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B']
NAMES = {**{n: i for i, n in enumerate(PCS)}, 'Db': 1, 'D#': 3, 'Gb': 6, 'G#': 8, 'A#': 10}
MAJOR = [0, 2, 4, 5, 7, 9, 11]
MINOR = [0, 2, 3, 5, 7, 8, 10]
# the game's theme, bars 1–2 (C F G A | C' A F E D in F major) as scale degrees, + the tonic for "!"
MOTIF_DEG = [5, 1, 2, 3, 5, 3, 1, 7, 6, 1]
MOTIF_OCT = [0, 1, 1, 1, 1, 1, 1, 0, 0, 1]  # octave offsets so the line moves like the game's theme

# ───────────────────────── key / tempo ─────────────────────────
KS_MAJ = np.array([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
KS_MIN = np.array([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])


def detect_key(x: np.ndarray) -> tuple[int, str, float]:
    """Krumhansl–Schmuckler on a log-frequency chroma of the whole song. Returns (tonic pc, mode, r)."""
    m = x.mean(1)
    f, _, S = signal.stft(m, SR, nperseg=8192, noverlap=6144)
    P = np.abs(S) ** 2
    ok = (f > 55) & (f < 2000)
    pcs = (np.round(12 * np.log2(f[ok] / 440.0)) + 9) % 12
    chroma = np.array([np.sum(np.sqrt(P[ok][pcs == k])) for k in range(12)])
    best = (-2, 0, 'major')
    for t in range(12):
        for prof, mode in ((KS_MAJ, 'major'), (KS_MIN, 'minor')):
            r = np.corrcoef(chroma, np.roll(prof, t))[0, 1]
            if r > best[0]:
                best = (r, t, mode)
    return best[1], best[2], float(best[0])


def parse_key(s: str) -> tuple[int, str]:
    """'D major', 'F# minor', 'Bbm', 'A min' → (pc, mode)."""
    s = s.replace('♭', 'b').replace('♯', '#').strip()
    parts = s.split()
    root, rest = parts[0], ' '.join(parts[1:]).lower()
    mode = 'major'
    if rest.startswith('min') or (len(parts) == 1 and root.endswith('m') and root[:-1] in NAMES):
        mode = 'minor'
    if root not in NAMES:
        root = root[:-1] if root.endswith('m') else root
    root = root[0].upper() + root[1:]
    return NAMES[root], mode


def resolve(key_arg=None, bpm_arg=None) -> dict:
    info = {'bpm': 96.0, 'bpb': 4, 'key': 'F major', 'source': 'provisional (critic 2.5 grid, game key)'}
    if CUE.exists():
        d = json.loads(CUE.read_text())
        if d.get('meter'):
            info['bpb'] = int(str(d['meter']).split('/')[0])
        if d.get('bpm'):
            info['bpm'] = float(d['bpm'])
            info['source'] = 'cue_sheet.json'
        if d.get('key'):
            info['key'] = d['key']
            info['source'] = 'cue_sheet.json'
    if SONG.exists() and not (CUE.exists() and json.loads(CUE.read_text()).get('key')):
        pc, mode, r = detect_key(dsp.read_wav(SONG))
        info['key'] = f'{PCS[pc]} {mode}'
        info['source'] = f'analysed trailer_edit.wav (KS r={r:.2f})'
    if key_arg:
        info['key'], info['source'] = key_arg, 'command line'
    if bpm_arg:
        info['bpm'] = float(bpm_arg)
    pc, mode = parse_key(info['key'])
    info['tonic_pc'], info['mode'] = pc, mode
    return info


# ───────────────────────── building blocks ─────────────────────────
def lib(name):
    return dsp.read_wav(LIB / f'{name}.wav')


def bell(f, sec, peak=1.0, ratio=3.5, index=2.0, decay=1.2):
    """FM bell (carrier:modulator 1:ratio, index decaying to 0) — the music-box voice."""
    t = dsp.t_axis(sec)
    idx = index * np.exp(-t / 0.15)
    y = np.sin(2 * np.pi * f * t + idx * np.sin(2 * np.pi * f * ratio * t))
    y += 0.25 * np.sin(2 * np.pi * f * 3.01 * t) * np.exp(-t / 0.12)
    return y * (1 - np.exp(-t / 0.0015)) * np.exp(-t * 6.9 / decay) * peak


def shepard(sec, up=True, n=6, f_lo=60, rate_oct=None):
    """Shepard–Risset glide: octave-spaced sines under a bell-curve spectral envelope."""
    t = dsp.t_axis(sec)
    rate = rate_oct if rate_oct else 1.0 / sec
    y = np.zeros_like(t)
    for k in range(n):
        pos = (k + (rate * t if up else -rate * t)) % n
        f = f_lo * 2 ** pos
        a = np.exp(-0.5 * ((pos - n / 2) / (n / 5)) ** 2)
        y += a * np.sin(2 * np.pi * np.cumsum(f) / SR)
    return y / n


def swept_noise(sec, f0, f1, q=2.5, seed=1, color='white'):
    """Noise through a bandpass whose centre sweeps exponentially f0→f1 (block-wise SOS)."""
    n = dsp.noise(sec, seed, color)
    out = np.zeros_like(n)
    B = 512
    zi = None
    for i in range(0, len(n), B):
        u = i / len(n)
        fc = f0 * (f1 / f0) ** u
        bw = fc / q
        sos = signal.butter(2, [max(20, fc - bw / 2), min(SR / 2 * 0.95, fc + bw / 2)], 'band', fs=SR, output='sos')
        if zi is None:
            zi = np.zeros((sos.shape[0], 2))
        out[i:i + B], zi = signal.sosfilt(sos, n[i:i + B], zi=zi)
    return out


def sub_drop(sec=0.9, f0=80, f1=30, tau=0.25):
    t = dsp.t_axis(sec)
    f = f1 + (f0 - f1) * np.exp(-t / tau)
    y = np.sin(2 * np.pi * np.cumsum(f) / SR)
    return y * (1 - np.exp(-t / 0.003)) * np.exp(-t / (sec / 3.2))


def click(sec=0.06, seed=3, f=3000):
    n = dsp.noise(sec, seed)
    t = dsp.t_axis(sec)
    body = np.sin(2 * np.pi * 180 * t) * np.exp(-t / 0.02) * 0.6
    return dsp.highpass(n, f * 0.4, 2) * np.exp(-t / 0.004) + body


def mono2st(m, pan=0.0):
    return dsp.stereo(m, pan) / np.sqrt(2)


def widen(x, ms=0.012):
    d = int(ms * SR)
    y = x.copy()
    y[d:, 1] = 0.6 * x[d:, 1] + 0.4 * x[:-d, 0]
    return y


def finish(x, peak=-1.0, lufs=None):
    x = dsp.highpass(x, 22, 2)
    if lufs is not None:
        g = lufs - float(np.max(dsp.momentary(dsp.fit(x, max(len(x), SR // 2)), 0.01)))
        g = min(g, -1.0 - dsp.sample_peak_db(x) + 4.0)  # never limit more than ~4 dB (keeps transients)
        x = x * dsp.undb(g)
        return dsp.limiter(x, -1.2, 0.002, 0.06)
    return dsp.limiter(dsp.normalize_peak(x, peak + 0.2), -1.2, 0.002, 0.06) if peak is not None else x


# ───────────────────────── assets ─────────────────────────
def tuned_pop(f, dur=0.16, seed=0):
    """THE peek "pop", tuned: the game's pop gesture (a sharp blip falling onto a pitch + a noise
    snap) rebuilt so it lands on `f` and carries its energy in 1-4 kHz (harmonics + band click).
    Same recipe in all three signature variants, so the motif is the same exposed gesture."""
    t = dsp.t_axis(dur)
    fs = f + (f * 2.5 - f) * np.exp(-t / 0.012)          # falls 2.5x → f in ~35 ms ("collapses" onto the note)
    ph = 2 * np.pi * np.cumsum(fs) / SR
    tone = sum(np.sin(k * ph) / k ** 0.8 for k in range(1, 13) if k * f < 9000)
    env = (1 - np.exp(-t / 0.0008)) * np.exp(-t / 0.045)
    snap = dsp.bandpass(dsp.noise(dur, 400 + seed), 1200, 4200, 2) * np.exp(-t / 0.006)
    game = lib('game/peek_collapse__v1')[:int(dur * SR)].mean(1) * np.exp(-t / 0.03)  # the game's own transient
    y = tone * env * 0.7 + snap * 0.6 + dsp.highpass(dsp.fit(game[:, None], len(t)), 600, 2)[:, 0] * 0.5
    return y / (np.max(np.abs(y)) + 1e-9)


def band_db(x, f1=1000, f2=4000, t1=0.2):
    seg = x[:int(t1 * SR)]
    y = dsp.bandpass(seg if seg.ndim == 2 else seg[:, None], f1, f2, 2)
    return 10 * np.log10(np.mean(y ** 2) + 1e-14)


def pop_on_top(pop_st, layers, margin_db=3.0):
    """Scale the pop so its 1-4 kHz energy is >= every other layer's + margin (first 200 ms)."""
    others = max(band_db(l) for l in layers) if layers else -140
    have = band_db(pop_st)
    g = dsp.undb(max(0.0, others + margin_db - have))
    return pop_st * g, round(have + dsp.db(g) - others, 2)


POP_REPORT = {}


def sig_a_coldopen(ir_big):
    """(a) Cold-open impact: the tuned pop landing on C4 (loudest 1-4 kHz layer) + sub drop + the game's
    peek slide/tinkle (once) + a long dark tail."""
    n = int(4.8 * SR)
    pc = lib('game/peek_collapse__v1')
    sub = mono2st(sub_drop(1.1, 85, 31, 0.22)) * 0.9
    body = dsp.lowpass(dsp.fit(pc, n), 3500, 2) * 0.55               # slide whistle + tinkle, darker, once
    body[:int(0.05 * SR)] *= np.linspace(0, 1, int(0.05 * SR))[:, None]  # its own pop is replaced by the tuned one
    pop, m = pop_on_top(mono2st(tuned_pop(dsp.midi_hz(60), 0.2, 1)) * 0.6, [dsp.fit(sub, n), body])
    POP_REPORT['sig_a'] = {'pop_note': 'C4', 'pop_band_margin_db': m}
    out = np.zeros((n, 2))
    dsp.place(out, sub, 0)
    dsp.place(out, body, 0)
    dsp.place(out, pop, 0)
    tail_src = mono2st(dsp.noise(0.25, 21) * np.exp(-dsp.t_axis(0.25) / 0.05))
    dsp.place(out, dsp.reverb(dsp.lowpass(tail_src, 2500, 2), ir_big, wet=1.0, dry=0.0), 0, 0.18)
    out = dsp.reverb(out, ir_big, wet=0.35, dry=1.0)[:n]
    return finish(dsp.fade(out, 0, 1.0), lufs=-10.5)


def collapse_note(f, sec, ir_small, accent=1.0, last=False, tag=None):
    """(b) One title letter: the tuned pop ON the letter's note (loudest 1-4 kHz layer) + bell body + sub tick."""
    n = int(sec * SR)
    bell1 = mono2st(bell(f, sec, 0.9, 3.5, 1.6, 1.6 if last else 0.9)) * accent
    bell2 = mono2st(bell(f * 2, 0.4, 0.15, 5.4, 1.0, 0.25), 0.3) * accent
    thump = mono2st(dsp.sub_thump(52, 0.15, 1.6), 0) * 0.35 * accent
    pop, m = pop_on_top(mono2st(tuned_pop(f, 0.14, 2)) * 0.5 * accent, [dsp.fit(bell1, n), dsp.fit(bell2, n)])
    if tag:
        POP_REPORT[tag] = {'pop_band_margin_db': m}
    out = np.zeros((n, 2))
    for lay, at in ((pop, 0), (bell1, int(0.004 * SR)), (bell2, int(0.004 * SR)), (thump, 0)):
        dsp.place(out, lay, at)
    return dsp.reverb(out, ir_small, wet=0.18 if not last else 0.3)[:n]


def sig_b(info, ir_small):
    """(b) The 10 title letters on 8ths: the game's theme head, transposed to the song's key."""
    scale = MAJOR if info['mode'] == 'major' else MINOR
    tonic = 60 + info['tonic_pc']
    while tonic < 72:
        tonic += 12
    while tonic > 83:
        tonic -= 12
    notes = []
    for d, o in zip(MOTIF_DEG, MOTIF_OCT):
        m = tonic + scale[d - 1] - (12 if d >= 5 and o == 0 else 0) + (0 if o else 0)
        notes.append(m)
    # keep the contour: 5 (below) 1 2 3 5 3 1 7(below) 6(below) 1
    eighth = 60 / info['bpm'] / 2
    letters, files = [], {}
    for i, m in enumerate(notes):
        last = i == len(notes) - 1
        x = collapse_note(dsp.midi_hz(m), 2.2 if last else 1.1, ir_small, 1.15 if last else 1.0, last,
                          tag=f"sig_b_{info['mode']}_{i + 1:02d}")
        x = finish(x, lufs=-15.0 if not last else -13.5)
        files[f'sig_b_letter_{i + 1:02d}'] = (x, {'midi': m, 'note': PCS[m % 12] + str(m // 12 - 1), 'hit_s': 0.0})
        letters.append(x)
    phrase = np.zeros((int((eighth * 9 + 2.4) * SR), 2))
    for i, x in enumerate(letters):
        dsp.place(phrase, x, int(round(i * eighth * SR)))
    files['sig_b_title_phrase'] = (finish(phrase, lufs=-13.0), {'notes': [PCS[m % 12] + str(m // 12 - 1) for m in notes],
                                                                 'eighth_s': eighth, 'hit_s': 0.0})
    return files


def sig_c_snap():
    """(c) The snap before the closing line: the tuned pop landing on C5 (= the BEEP's pitch: peek =
    danger, beep = answer, snap = resolution) as the loudest 1-4 kHz layer, with snap_measure, a paper
    whip, a 58 Hz thump and a short clap body underneath. Dry (tiny plate). About -13 LUFS-M."""
    n = int(0.5 * SR)
    at = int(0.03 * SR)
    snap = dsp.fit(dsp.presence(lib('game/snap_measure__v1'), 2), n) * 0.5
    whip = mono2st(swept_noise(0.07, 1500, 7000, 1.5, 33) * np.linspace(0, 1, int(0.07 * SR)) ** 3) * 0.35
    thump = mono2st(dsp.sub_thump(58, 0.16, 1.8)) * 0.8
    body = mono2st(dsp.bandpass(dsp.noise(0.25, 61), 900, 6500, 2) * np.exp(-dsp.t_axis(0.25) / 0.045)) * 0.3
    pop, m = pop_on_top(mono2st(tuned_pop(dsp.midi_hz(72), 0.22, 3)) * 0.6, [snap, dsp.fit(body, n), dsp.fit(whip, n)])
    POP_REPORT['sig_c'] = {'pop_note': 'C5', 'pop_band_margin_db': m}
    out = np.zeros((n, 2))
    dsp.place(out, whip, 0)
    dsp.place(out, snap, at)
    dsp.place(out, pop, at)
    dsp.place(out, thump, at)
    dsp.place(out, body, at + int(0.002 * SR))
    out = dsp.reverb(out, dsp.make_ir(0.3, 12.0, 0.004, 8000, seed=5), 0.1)[:n]
    out = dsp.fade(out, 0, 0.12)
    # -13 LUFS-M: allow up to 7 dB of peak limiting here (it is a snap; the transient survives the PLR limit)
    out = dsp.highpass(out, 22, 2)
    mm = lambda y: float(np.max(dsp.momentary(dsp.fit(y, max(len(y), SR // 2)), 0.01)))
    g = -13.0 - mm(out)
    for _ in range(6):  # converge on -13 LUFS-M through the limiter
        y = dsp.limiter(out * dsp.undb(g), -1.2, 0.001, 0.04)
        err = -13.0 - mm(y)
        if abs(err) < 0.2:
            break
        g += err
    return y


def riser_peek(sec=1.9, ir=None):
    """Reversed cymbal into the collapse (ends exactly at the hit: align=end)."""
    n = dsp.noise(sec + 1.0, 41)
    t = dsp.t_axis(sec + 1.0)
    cym = dsp.highpass(n, 3500, 2) * np.exp(-t / 0.45)
    cym = mono2st(cym)
    cym = dsp.reverb(cym, ir, 0.4)[:len(t)]
    rev = cym[::-1][-int(sec * SR):]
    rev = rev * (np.linspace(0, 1, len(rev)) ** 2.2)[:, None]
    return finish(widen(rev), lufs=-17.0)


def riser_drop(bars, bpm, seed=5, bpb=4):
    """Shepard tone + noise bandpass 300 Hz→8 kHz. Stops dead (align=end at the silence start)."""
    sec = bars * bpb * 60 / bpm
    sh = shepard(sec, True, 6, 55, rate_oct=1.2 / sec * 2)
    nz = swept_noise(sec, 300, 8000, 2.0, seed)
    env = np.linspace(0, 1, len(sh)) ** 2.5
    y = np.stack([sh * 0.8 + nz * 0.5, sh * 0.8 + np.roll(nz, 300) * 0.5], 1) * env[:, None]
    y[-int(0.004 * SR):] *= np.linspace(1, 0, int(0.004 * SR))[:, None]  # dead stop, no click
    return finish(y, lufs=-14.0)


def snare_roll(bpm, bars=1, bpb=4):
    """Snare roll + filter sweep into the payoff (b20): 16ths → 32nds, crescendo."""
    sec = bars * bpb * 60 / bpm
    n = int(sec * SR)
    out = np.zeros(n)
    t = 0.0
    k = 0
    while t < sec - 0.01:
        u = t / sec
        step = 60 / bpm / (4 if u < 0.5 else 8)
        hit = dsp.noise(0.09, 100 + k) * np.exp(-dsp.t_axis(0.09) / 0.03)
        body = np.sin(2 * np.pi * 190 * dsp.t_axis(0.09)) * np.exp(-dsp.t_axis(0.09) / 0.02)
        dsp.place(out[:, None], ((dsp.bandpass(hit, 1500, 7000, 2) + 0.5 * body) * (0.25 + 0.75 * u ** 1.5))[:, None], int(t * SR))
        t += step
        k += 1
    sw = swept_noise(sec, 400, 9000, 3.0, 9) * np.linspace(0, 1, n) ** 2 * 0.4
    y = np.stack([out + sw, out * 0.9 + np.roll(sw, 200)], 1)
    y[-int(0.004 * SR):] *= np.linspace(1, 0, int(0.004 * SR))[:, None]
    return finish(y, lufs=-14.0)


def beep_dry():
    """The single dry bot BEEP that breaks the 2-beat silence (close, no reverb, a touch of presence)."""
    x = lib('game/listen_beep__v1')
    x = dsp.presence(x, 2.5)
    return finish(dsp.fade(x, 0, 0.02), lufs=-14.0)


def beep_dry_bot_a():
    x = lib('bots/bot_a_beep')
    return finish(dsp.presence(x, 2.5), lufs=-14.0)


def whoosh(sec=0.4, f0=500, f1=5000, seed=2, hit_at_end=True):
    nz = swept_noise(sec, f0, f1, 1.8, seed)
    t = np.linspace(0, 1, len(nz))
    env = (t ** 2.2) if hit_at_end else np.sin(np.pi * t) ** 1.5
    y = np.stack([nz * env, np.roll(nz, 400) * env], 1)
    # stereo travel L→R
    pan = np.linspace(-0.6, 0.6, len(nz))
    y[:, 0] *= np.cos((pan + 1) * np.pi / 4) * 1.41
    y[:, 1] *= np.sin((pan + 1) * np.pi / 4) * 1.41
    return y


def shatter(ir_small):
    """Shatter transition (12 frames): a whoosh INTO the collapse hit + glass shards flying out."""
    pre = 0.35
    n = int((pre + 1.4) * SR)
    out = np.zeros((n, 2))
    dsp.place(out, whoosh(pre, 600, 6000, 4), 0, 0.8)
    rng = np.random.default_rng(8)
    for i in range(26):
        tt = pre + rng.exponential(0.12)
        f = rng.uniform(2500, 7500)
        b = bell(f, 0.25, rng.uniform(0.1, 0.35), rng.uniform(2.7, 5.4), 1.5, rng.uniform(0.08, 0.3))
        dsp.place(out, mono2st(b, rng.uniform(-0.8, 0.8)), int(tt * SR))
    dsp.place(out, mono2st(click(0.05, 77, 3500)), int(pre * SR), 0.6)
    out = dsp.reverb(out, ir_small, 0.25)[:n]
    return finish(out, lufs=-14.0), pre


def shards(ir_small):
    """Shatter tail: glass shards flying out (no whoosh: the reversed cymbal is the whoosh). Starts at 0."""
    n = int(1.3 * SR)
    out = np.zeros((n, 2))
    rng = np.random.default_rng(8)
    for i in range(26):
        tt = rng.exponential(0.12)
        f = rng.uniform(2500, 7500)
        b = bell(f, 0.25, rng.uniform(0.1, 0.35), rng.uniform(2.7, 5.4), 1.5, rng.uniform(0.08, 0.3))
        dsp.place(out, mono2st(b, rng.uniform(-0.8, 0.8)), int(tt * SR))
    out = dsp.reverb(out, ir_small, 0.25)[:n]
    return finish(dsp.highpass(out, 1500, 2), lufs=-16.0)


def glitch_tear():
    """Glitch tear at the drop (6 frames): chopped game glitch + bitcrush + sample-rate stutter + sub."""
    g = lib('game/glitch__v1')
    n = int(0.6 * SR)
    out = np.zeros((n, 2))
    seg = g[:int(0.1 * SR)]
    crushed = np.round(seg * 12) / 12
    held = np.repeat(crushed[::6], 6, axis=0)[:len(seg)]
    for k, (s, gain) in enumerate([(0, 1.0), (0.025, 0.8), (0.05, 0.9), (0.075, 0.7)]):
        piece = held[int(k * 0.02 * SR):int(k * 0.02 * SR) + int(0.025 * SR)]
        dsp.place(out, piece * gain, int(s * SR))
    dsp.place(out, g * 0.6, 0)
    dsp.place(out, mono2st(sub_drop(0.4, 70, 35, 0.08)), 0, 0.7)
    zap = np.sign(np.sin(2 * np.pi * np.cumsum(np.linspace(2400, 300, int(0.1 * SR))) / SR)) * 0.25
    dsp.place(out, mono2st(zap * np.linspace(1, 0, len(zap))), 0)
    return finish(dsp.fade(out, 0, 0.2), lufs=-12.0)


def impact_logo(ir_big):
    """The DROP / logo-reveal impact: sub drop + transient + noise burst + dark tail + Sunny/Moony shimmer."""
    n = int(4.0 * SR)
    out = np.zeros((n, 2))
    dsp.place(out, mono2st(sub_drop(1.2, 90, 30, 0.2)), 0, 1.0)
    dsp.place(out, mono2st(click(0.07, 13, 2000)), 0, 0.8)
    burst = dsp.lowpass(dsp.noise(0.3, 14), 6000, 2) * np.exp(-dsp.t_axis(0.3) / 0.06)
    dsp.place(out, mono2st(burst), 0, 0.5)
    tail = dsp.reverb(mono2st(dsp.lowpass(burst, 1800, 2)), ir_big, 1.0, 0)
    dsp.place(out, tail, 0, 0.25)
    rng = np.random.default_rng(3)
    for i, m in enumerate([89, 93, 96, 101, 98, 105]):
        dsp.place(out, mono2st(bell(dsp.midi_hz(m), 1.2, 0.08, 3.5, 1.2, 1.0), rng.uniform(-0.7, 0.7)), int((0.05 + i * 0.04) * SR))
    return finish(out, lufs=-9.5)


def tick_8ths(bpm, bars=4, bpb=4):
    """Ticking clock: 3.2 kHz bandpassed noise clicks on 8ths, tick/tock ±200 Hz, slight swell."""
    eighth = 60 / bpm / 2
    ne = bars * bpb * 2
    n = int((ne * eighth + 0.2) * SR)
    out = np.zeros((n, 2))
    for i in range(ne):
        f = 3200 + (200 if i % 2 == 0 else -200)
        c = dsp.bandpass(dsp.noise(0.03, 200 + i), f * 0.85, f * 1.15, 2) * np.exp(-dsp.t_axis(0.03) / 0.004)
        c += np.sin(2 * np.pi * f / 2 * dsp.t_axis(0.03)) * np.exp(-dsp.t_axis(0.03) / 0.006) * 0.3
        dsp.place(out, mono2st(c, 0.25 if i % 2 == 0 else -0.25), int(round(i * eighth * SR)), 0.6 + 0.4 * i / ne)
    return finish(out, lufs=-22.0)


def room_tone(sec=30):
    """Room tone at ≈ −60 dBFS RMS: dark pink air + a whisper of 50 Hz hum; loop-crossfaded."""
    a = dsp.lowpass(np.stack([dsp.noise(sec + 1, 51, 'pink'), dsp.noise(sec + 1, 52, 'pink')], 1), 1800, 2)
    a = dsp.highpass(a, 40, 2)
    a += mono2st(np.sin(2 * np.pi * 50 * dsp.t_axis(sec + 1)) * 0.05)
    L = int(sec * SR)
    xf = SR
    y = a[:L].copy()
    w = np.linspace(0, 1, xf)[:, None]
    y[:xf] = a[L:L + xf] * (1 - w) + a[:xf] * w  # seamless loop
    rms = np.sqrt(np.mean(y ** 2))
    return y * dsp.undb(-60) / rms


def heartbeat_pattern(bpm, bars=4, bpb=4):
    """Low heartbeat sub (critic 3.2): sine 58→38 Hz in 120 ms, lub-dub (beat 1 + the 16th after),
    LP 120 Hz + a 2nd-harmonic layer for small speakers; moves to beats 1 and 3 in bar 3."""
    beat = 60 / bpm
    n = int((bars * bpb * beat + 0.6) * SR)
    out = np.zeros(n)

    def lub(vel):
        t = dsp.t_axis(0.35)
        f = 38 + 20 * np.exp(-t / 0.045)
        s = np.sin(2 * np.pi * np.cumsum(f) / SR) * (1 - np.exp(-t / 0.004)) * np.exp(-t / 0.09)
        h = np.sin(2 * np.pi * np.cumsum(2 * f) / SR) * (1 - np.exp(-t / 0.003)) * np.exp(-t / 0.05) * 0.25
        return (dsp.lowpass(s[:, None], 120, 2)[:, 0] + h) * vel

    for b in range(bars):
        beats = [0, 2] if b >= 2 else [0]
        for k in beats:
            t0 = (b * bpb + k) * beat
            dsp.place(out[:, None], lub(1.0)[:, None], int(t0 * SR))
            dsp.place(out[:, None], lub(0.7)[:, None], int((t0 + beat / 4) * SR))
    return finish(mono2st(out), lufs=-20.0)


def heartbeat_one():
    return heartbeat_pattern(60, 1)[: int(1.0 * SR)]


def night_ambience(sec=30):
    """Night: soft wind (LP brown noise, slow swell) + crickets (AM chirps ~4.6 kHz, HP 4 kHz, -3 dB); loopable. No owl."""
    t = dsp.t_axis(sec + 1)
    wind = dsp.lowpass(np.stack([dsp.noise(sec + 1, 61, 'brown'), dsp.noise(sec + 1, 62, 'brown')], 1), 500, 2)
    wind *= (0.6 + 0.4 * np.sin(2 * np.pi * t / 9.0))[:, None]
    wind /= np.sqrt(np.mean(wind ** 2))
    cr = np.zeros((len(t), 2))
    rng = np.random.default_rng(4)
    for voice in range(3):
        f = 4400 + 250 * voice
        pan = [-0.6, 0.5, 0.1][voice]
        tt = rng.uniform(0, 0.7)
        while tt < sec + 0.5:
            ch = dsp.t_axis(0.12)
            chirp = np.sin(2 * np.pi * f * ch) * (0.5 + 0.5 * np.sign(np.sin(2 * np.pi * 45 * ch))) * np.sin(np.pi * ch / 0.12)
            dsp.place(cr, mono2st(chirp, pan), int(tt * SR), 0.12)
            tt += rng.uniform(0.45, 0.9)
    cr = dsp.highpass(cr, 4000, 4) * dsp.undb(-3)  # crickets: HP (ticks own 3 kHz) and -3 dB; owl cut
    y = wind * 0.02 + cr
    L = int(sec * SR)
    out = y[:L].copy()
    w = np.linspace(0, 1, SR)[:, None]
    out[:SR] = y[L:L + SR] * (1 - w) + y[:SR] * w
    return out * dsp.undb(-38 - dsp.integrated(out))


def braam(bpm, bars=1, bpb=4):
    """Braam: 6 detuned saws (±15 c) + sub, LP sweeping 200 Hz→2 kHz over the bar, slow attack, hard cut."""
    sec = bars * bpb * 60 / bpm
    t = dsp.t_axis(sec)
    f = dsp.midi_hz(29)  # F1 by default; retuned by tonic below
    return t, f, sec


def braam_tuned(bpm, tonic_pc, bars=1, bpb=4):
    t, _, sec = braam(bpm, bars, bpb)
    f = dsp.midi_hz(24 + tonic_pc + (12 if tonic_pc < 4 else 0))
    y = np.zeros((len(t), 2))
    for k, c in enumerate([-15, -9, -3, 3, 9, 15]):
        ff = f * 2 ** (c / 1200)
        saw = 2 * ((ff * t + k / 6) % 1) - 1
        y += mono2st(saw, -0.6 + 0.24 * k)
    y += mono2st(np.sin(2 * np.pi * f / 2 * t)) * 2
    out = np.zeros_like(y)
    B = 1024
    zi = None
    for i in range(0, len(t), B):
        fc = 200 * 10 ** (i / len(t))
        sos = signal.butter(2, fc, 'low', fs=SR, output='sos')
        if zi is None:
            zi = np.zeros((sos.shape[0], 2, 2))
        for chn in range(2):
            out[i:i + B, chn], zi[:, chn] = signal.sosfilt(sos, y[i:i + B, chn], zi=zi[:, chn])
    env = np.minimum(1, t / (sec * 0.5)) ** 1.5
    out *= env[:, None]
    out[-int(0.006 * SR):] *= np.linspace(1, 0, int(0.006 * SR))[:, None]
    return finish(out, lufs=-12.0)


def sub_tail(tonic_pc, sec=5.0):
    """Final chord sub tail (on the tonic, ~40–50 Hz), long fade."""
    f = dsp.midi_hz(24 + tonic_pc + (12 if tonic_pc < 4 else 0))
    t = dsp.t_axis(sec)
    y = np.sin(2 * np.pi * f * t) * (1 - np.exp(-t / 0.01)) * np.exp(-t / 1.6)
    y += 0.2 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t / 0.8)
    return finish(mono2st(y), lufs=-18.0)


def exact_renders():
    """Game-synthesis renders at exact pitch (cached in lib/exact/): tuned BEEPs + level_win in C."""
    from engine_render import render_jobs
    d = LIB / 'exact'
    want = {'beep_C5': {'fn': 'beep', 'f1': dsp.midi_hz(77), 'f2a': dsp.midi_hz(73), 'f2b': dsp.midi_hz(72)},   # F5 → C#5↘C5
            'beep_C6': {'fn': 'beep', 'f1': dsp.midi_hz(89), 'f2a': dsp.midi_hz(85), 'f2b': dsp.midi_hz(84)},   # F6 → C#6↘C6
            'level_win_C': {'fn': 'sfx', 'name': 'level_win', 'p': 2 ** (-5 / 12)},                               # Fmaj9 → Cmaj9
            'level_win_F': {'fn': 'sfx', 'name': 'level_win', 'p': 1.0}}
    if all((d / f'{k}.wav').exists() for k in want):
        return {k: dsp.read_wav(d / f'{k}.wav') for k in want}
    items = [dict(v, t=0.05 + 4.0 * i) for i, v in enumerate(want.values())]
    x, = render_jobs([{'name': 'exact', 'secs': 4.0 * len(items) + 1, 'dry': True, 'seed': 3, 'items': items,
                       'script': '/tools/video/audio/exact_render.js'}])
    out = {}
    for i, k in enumerate(want):
        seg = dsp.trim_silence(x[int((0.05 + 4.0 * i) * SR):int((0.05 + 4.0 * i + 3.9) * SR)], -80, 0, 0.03)
        seg = dsp.normalize_peak(seg, -3.0)
        dsp.write_wav(d / f'{k}.wav', seg)
        out[k] = seg
    return out


def beep_tuned(x):
    """The drop's pickup BEEP: tuned game beep, dry and close, a touch of presence."""
    return finish(dsp.fade(dsp.presence(x, 2.5), 0, 0.02), lufs=-14.0)


def level_win_big(lw, ir_big, tonic_hz):
    """Re-orchestrated level_win for the payoff slam: the game fanfare + brass-like saw stabs on the same
    chord + a timpani/sub hit on the tonic + crash cymbal + sparkle, wide and loud."""
    n = int(4.5 * SR)
    out = np.zeros((n, 2))
    dsp.place(out, dsp.presence(lw, 3) * 1.0, 0)
    t = dsp.t_axis(2.6)
    env = (1 - np.exp(-t / 0.01)) * np.exp(-t / 0.9)
    for k, semi in enumerate([0, 4, 7, 12, 16, 19]):  # tonic major triad over 2 octaves (stab at the chord hit)
        f = tonic_hz * 2 ** (semi / 12)
        saw = sum(2 * ((f * 2 ** (c / 1200) * t + k * 0.13) % 1) - 1 for c in (-7, 0, 7)) / 3
        y = dsp.lowpass(saw[:, None] * env[:, None], 2400, 2)[:, 0]
        dsp.place(out, mono2st(y, -0.6 + 0.24 * k), int(0.38 * SR), 0.12)
    dsp.place(out, mono2st(sub_drop(1.2, tonic_hz / 2, tonic_hz / 4, 0.3)), int(0.38 * SR), 0.8)
    dsp.place(out, mono2st(sub_drop(0.9, tonic_hz / 2, tonic_hz / 2.4, 0.4)), 0, 0.35)
    crash = dsp.highpass(dsp.noise(3.0, 91), 4000, 2) * np.exp(-dsp.t_axis(3.0) / 0.9)
    dsp.place(out, widen(mono2st(crash)), int(0.38 * SR), 0.22)
    out = dsp.reverb(out, ir_big, 0.25)[:n]
    return finish(dsp.fade(out, 0, 1.2), lufs=-10.0)


def level_win_fpow(ir_big):
    """Song-bed payoff fanfare (song = F minor): NO thirds. F+C power stabs (saw brass), timpani on F,
    crash, pentatonic-free sparkle on F/C, and the game's win arpeggio re-voiced with a flat 3rd
    (C5 F5 Ab5 C6, triangle blips like the game's)."""
    n = int(4.5 * SR)
    out = np.zeros((n, 2))
    # win arpeggio, game style (triangle blips 90 ms apart, 0.35 s decay), 3rd lowered to Ab
    for i, m in enumerate([72, 77, 80, 84]):
        t = dsp.t_axis(0.5)
        tri = 2 * np.abs(2 * ((dsp.midi_hz(m) * t) % 1) - 1) - 1
        dsp.place(out, mono2st(tri * (1 - np.exp(-t / 0.002)) * np.exp(-t * 6.9 / 0.35) * 0.35, -0.2 + 0.13 * i), int(i * 0.09 * SR))
    hit = int(0.38 * SR)
    t = dsp.t_axis(2.6)
    env = (1 - np.exp(-t / 0.01)) * np.exp(-t / 0.9)
    for k, m in enumerate([41, 48, 53, 60, 65, 72]):  # F2 C3 F3 C4 F4 C5: power voicing
        f = dsp.midi_hz(m)
        saw = sum(2 * ((f * 2 ** (c / 1200) * t + k * 0.13) % 1) - 1 for c in (-7, 0, 7)) / 3
        y = dsp.lowpass(saw[:, None] * env[:, None], 2600, 2)[:, 0]
        dsp.place(out, mono2st(y, -0.6 + 0.24 * k), hit, 0.13)
    dsp.place(out, mono2st(sub_drop(1.2, dsp.midi_hz(41), dsp.midi_hz(29), 0.3)), hit, 0.8)   # timpani/sub on F
    tt = dsp.t_axis(0.9)
    timp = np.sin(2 * np.pi * dsp.midi_hz(41) * tt) * np.exp(-tt / 0.35) + 0.4 * np.sin(2 * np.pi * dsp.midi_hz(41) * 1.5 * tt) * np.exp(-tt / 0.2)
    dsp.place(out, mono2st(timp * (1 - np.exp(-tt / 0.002))), hit, 0.45)
    crash = dsp.highpass(dsp.noise(3.0, 91), 4000, 2) * np.exp(-dsp.t_axis(3.0) / 0.9)
    dsp.place(out, widen(mono2st(crash)), hit, 0.22)
    rng = np.random.default_rng(5)
    for i, m in enumerate([89, 96, 101, 96, 108, 101]):  # F6 C7 F7 ... sparkle on F/C only
        dsp.place(out, mono2st(bell(dsp.midi_hz(m), 0.6, 0.07, 3.5, 1.2, 0.4), rng.uniform(-0.7, 0.7)), hit + int((0.1 + i * 0.045) * SR))
    out = dsp.reverb(out, ir_big, 0.25)[:n]
    return finish(dsp.fade(out, 0, 1.2), lufs=-10.0)


def revcymbal_bar(bar_s, ir):
    return riser_peek(bar_s, ir)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--key')
    ap.add_argument('--bpm', type=float)
    a = ap.parse_args()
    info = resolve(a.key, a.bpm)
    print('design key/bpm:', info)
    ir_big = dsp.make_ir(3.2, 1.6, 0.03, 3500, seed=11)
    ir_small = dsp.make_ir(0.9, 4.5, 0.01, 7000, seed=12)
    bpm = info['bpm']
    beat = 60 / bpm
    bpb = info.get('bpb', 4)
    A = {}  # name -> (audio, meta)

    def add(name, x, kind, align='start', hit_s=0.0, featured=False, **meta):
        A[name] = (x, {'kind': kind, 'align': align, 'hit_s': round(hit_s, 4), 'featured': featured, **meta})

    add('sig_a_coldopen_impact', sig_a_coldopen(ir_big), 'signature', 'hit', 0.0, True, suppress_game=['peek_collapse'],
        use='cold-open collapse (critic b4, 0:07.5 provisional)')
    for k, (x, m) in sig_b(info, ir_small).items():
        add(k, x, 'signature', 'hit', m.pop('hit_s'), True, **m, use=f"title letters on 8ths ({info['key']})")
    alt = dict(info, mode='minor' if info['mode'] == 'major' else 'major')
    for k, (x, m) in sig_b(alt, ir_small).items():
        add(k + '_alt', x, 'signature', 'hit', m.pop('hit_s'), True, **m,
            use=f"ALT title letters in {PCS[info['tonic_pc']]} {alt['mode']}")
    add('sig_c_snap', sig_c_snap(), 'signature', 'hit', 0.03, True, use='snap before the closing line (pop on C5)', mix_gain_db=2.7)
    add('riser_peek_revcymbal', riser_peek(1.9, ir_small), 'riser', 'end', 1.9, False, use='spare (long)')
    add('revcym_2beat', riser_peek(2 * beat, ir_small), 'riser', 'end', 2 * beat, False, use='2 beats into the f434 collapse')
    add('shatter_shards', shards(ir_small), 'transition', 'hit', 0.0, False, use='shatter tail, -10 dB, +3 frames after the f434 transient')
    add('level_win_fpow', level_win_fpow(ir_big), 'impact', 'hit', 0.38, True, suppress_game=['level_win'],
        use='SONG payoff f3026: F power-chord fanfare (no 3rd), timpani on F, win arpeggio with a flat 3rd')
    for bars in (1, 2, 4, 6):
        add(f'riser_drop_{bars}bar', riser_drop(bars, bpm, 5, bpb), 'riser', 'end', bars * bpb * beat, False,
            use='ends dead at the start of the 2-beat silence')
    add('snare_roll_1bar', snare_roll(bpm, 1, bpb), 'riser', 'end', bpb * beat, False, use='spare')
    sr = snare_roll(bpm, 1, bpb)
    add('snare_roll_2beat', dsp.fade(sr[-int(2 * beat * SR):], 0.02, 0), 'riser', 'end', 2 * beat, False, use='last 2 beats into the payoff')
    ex = exact_renders()
    add('beep_tuned_C5', beep_tuned(ex['beep_C5']), 'hit', 'hit', 0.005, True,
        use='THE drop pickup BEEP (f1362): game beep recipe tuned F5 → C5 (cue sheet beep_pitch: C5 = 5th of the F drop and the home key)',
        suppress_game=['botNote', 'listen_beep'], mix_gain_db=3.0)
    add('beep_tuned_C6', beep_tuned(ex['beep_C6']), 'hit', 'hit', 0.005, True, use='same, an octave up (brighter)', suppress_game=['botNote', 'listen_beep'])
    add('level_win_big', level_win_big(ex['level_win_C'], ir_big, dsp.midi_hz(48)), 'impact', 'hit', 0.38, True,
        use='re-orchestrated level_win in C on the payoff slam (f3026)', suppress_game=['level_win'])
    add('level_win_big_F', level_win_big(ex['level_win_F'], ir_big, dsp.midi_hz(53)), 'impact', 'hit', 0.0, True,
        use='alt: in the game key F')
    add('revcymbal_1bar', revcymbal_bar(bpb * beat, ir_small), 'riser', 'end', bpb * beat, False,
        use='reversed cymbal over the last Lights Out bar, landing on the payoff slam')
    add('beep_silence', beep_dry(), 'hit', 'hit', 0.005, True, use='the single dry BEEP in the 2-beat silence (listen_beep)')
    add('beep_silence_bot_a', beep_dry_bot_a(), 'hit', 'hit', 0.005, True, use='alt: bot a marimba DUM')
    x, pre = shatter(ir_small)
    add('shatter_whoosh_shards', x, 'transition', 'hit', pre, True, use='shatter transition (hit = collapse frame)')
    add('glitch_tear', glitch_tear(), 'transition', 'hit', 0.0, True, use='glitch tear at the drop (6 frames)')
    add('impact_logo', impact_logo(ir_big), 'impact', 'hit', 0.0, True, use='drop / logo reveal')
    add('whoosh_short', finish(whoosh(0.28, 700, 6000, 6), lufs=-17.0), 'transition', 'end', 0.28, False)
    add('whoosh_long', finish(whoosh(0.6, 300, 7000, 7), lufs=-17.0), 'transition', 'end', 0.6, False)
    add('whoosh_by', finish(whoosh(0.5, 400, 4000, 8, hit_at_end=False), lufs=-18.0), 'transition', 'hit', 0.25, False)
    add('tick_8ths_4bar', tick_8ths(bpm, 4, bpb), 'bed', 'start', 0.0, False, use='ticking clock on 8ths')
    add('tick_8ths_2bar', tick_8ths(bpm, 2, bpb), 'bed', 'start', 0.0, False)
    add('room_tone_30s', room_tone(30), 'bed', 'start', 0.0, False, loop=True, use='-60 dBFS RMS held breath')
    add('heartbeat_sub_4bar', heartbeat_pattern(bpm, 4, bpb), 'bed', 'start', 0.0, False, use='cold-open heartbeat on the beat grid')
    add('heartbeat_one', heartbeat_one(), 'bed', 'hit', 0.0, False)
    add('night_ambience_30s', night_ambience(30), 'bed', 'start', 0.0, False, loop=True)
    add('braam_1bar', braam_tuned(bpm, info['tonic_pc'], 1, bpb), 'riser', 'end', bpb * beat, False)
    add('sub_tail', sub_tail(info['tonic_pc']), 'impact', 'hit', 0.0, False, use='final chord sub tail')

    manifest = {'info': info, 'assets': {}, 'pop_dominance_1_4kHz': POP_REPORT}
    for name, (x, m) in A.items():
        p = OUT / f'{name}.wav'
        dsp.write_wav(p, x)
        st = {'dur': round(len(x) / SR, 3), 'peak_db': round(dsp.sample_peak_db(x), 2), 'tp_db': round(dsp.true_peak_db(x), 2),
              'max_lufs_m': round(float(np.max(dsp.momentary(dsp.fit(x, max(len(x), SR // 2)), 0.02))), 2)}
        manifest['assets'][name] = {'path': str(p.relative_to(ROOT)), **m, **st}
    dsp.save_json(OUT / 'design.json', manifest)
    print(len(A), 'design assets →', OUT)


if __name__ == '__main__':
    main()
