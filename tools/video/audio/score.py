"""Render the PUBLIC trailer score: an original lullaby-epic arrangement of the public-domain
"Twinkle Twinkle Little Star" ("Ah ! vous dirai-je, maman"), on the same cue sheet as the temp song.

    tools/video/safe-run.sh --heavy --mem 6G -- python3 tools/video/audio/score.py [--cue-sheet PATH]

Cue sheet: videos/music/cue_sheet.json once it is v2, else videos/audio2/expected_cue_sheet_v2.json
(sheet.pick()). The arrangement (score_twinkle.js) plays the game's own instruments in the offline
engine, one render per stem (box / harm / bass / drums). Python then adds the Critic's energy shape:
  peek       tape-stop dip on the f434 transient (the wow/detune is done in the engine)
  build      low-pass sweep 900 Hz → open across the section + level ramp −6 → 0 dB (no hole at the riser)
  silence    digital zero; closing silence (→ snap) digital zero
  drop       sub-kick reinforcement on every downbeat
  proof      submerged: low-pass 1.2 kHz, −6 dB
  montage    filter fully open, −2 dB (so the payoff is the loudest moment)
  lights_out low-pass 300 Hz, −4 dB; a reversed cymbal over its last bar lands on the payoff slam
  payoff     sub kicks on 1, claps on 2 & 3
and masters the bed to −16 LUFS / −1 dBTP (same headroom as the temp song bed).
The Critic's loudness-curve gate (sheet.energy_checks) is run and written to score_alt.json.
Outputs videos/audio2/score_alt/{score_alt.wav, stem_*.wav, score_alt.json, score_alt.png}.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
from scipy import signal

sys.path.insert(0, str(Path(__file__).resolve().parent))
import dsp  # noqa: E402
from dsp import SR  # noqa: E402
import sheet  # noqa: E402
from engine_render import render_jobs, ROOT  # noqa: E402

OUT = ROOT / 'videos/audio2/score_alt'


def auto_lpf(x, cutoff, block=256):
    """Time-varying 2nd-order low-pass; cutoff = per-sample Hz array (≥ 19 kHz = bypass)."""
    y = x.copy()
    zi = np.zeros((1, 2, 2))
    for i in range(0, len(x), block):
        fc = float(np.median(cutoff[i:i + block]))
        sos = signal.butter(2, min(fc, SR / 2 * 0.95), 'low', fs=SR, output='sos')
        for ch in range(2):
            y[i:i + block, ch], zi[:, ch] = signal.sosfilt(sos, x[i:i + block, ch], zi=zi[:, ch])
        if fc >= 19000:
            y[i:i + block] = x[i:i + block]
    return y


def seg_curve(n, pts, default):
    """Piecewise-linear curve over samples from [(t_s, value), ...] with `default` outside."""
    c = np.full(n, float(default))
    for (t0, v0), (t1, v1) in zip(pts, pts[1:]):
        a, b = int(t0 * SR), int(t1 * SR)
        if b > a:
            c[a:b] = np.linspace(v0, v1, b - a)
    return c


def tape_stop(x, t0, dur=0.35, depth=0.45):
    """Varispeed dip (tape-stop) starting at t0: rate 1 → 1-depth → snaps back."""
    a, n = int(t0 * SR), int(dur * SR)
    if a + n * 2 > len(x):
        return x
    u = np.linspace(0, 1, n)
    rate = 1 - depth * np.sin(np.pi * u) ** 0.7
    pos = np.cumsum(rate)
    src = x[a:a + 2 * n]
    idx = np.arange(len(src))
    seg = np.stack([np.interp(pos, idx, src[:, c]) for c in range(2)], 1)
    y = x.copy()
    y[a:a + n] = seg
    consumed = int(pos[-1])
    rest = x[a + consumed:]
    tail = len(x) - (a + n)
    y[a + n:] = dsp.fit(rest, tail)
    return y


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--cue-sheet')
    a = ap.parse_args()
    path = Path(a.cue_sheet) if a.cue_sheet else sheet.pick()
    P = sheet.plan(path)
    T = P['t']
    dur = P['duration_s']
    print('score (Twinkle) from', path.name, P['version'], 'bpm', P['bpm'], f"{P['bpb']}/4", 'dur', round(dur, 2))
    base = {'secs': dur + 3, 'script': '/tools/video/audio/score_twinkle.js', 'dry': False, 'master': 'raw', 'seed': 96,
            'plan': {k: P[k] for k in ('beat_s', 'bpb', 'bar_s', 'beat0_s')} | {'t': T}}
    names = ['box', 'harm', 'bass', 'drums']
    stems = dict(zip(names, render_jobs([{**base, 'name': f'twinkle {s}', 'stem': s} for s in names])))
    n = len(stems['box'])
    bar, beat = P['bar_s'], P['beat_s']

    # peek: tape-stop on the box at the hit
    stems['box'] = tape_stop(stems['box'], T['peek'])
    stems['box'] = dsp.presence(stems['box'], 1.5)
    # heavier: sub kicks on downbeats (drop → payoff, not in lights out), claps on 2 & 3 in the payoff
    add = np.zeros((n, 2))

    def downbeats(t0, t1):
        k = int(np.ceil((t0 - P['beat0_s']) / beat - 1e-6))
        while k % P['bpb']:
            k += 1
        t = P['beat0_s'] + k * beat
        while t < t1 - 1e-6:
            yield t
            t += bar

    thump = dsp.stereo(dsp.sub_thump(48, 0.35, 2.0), 0) / np.sqrt(2)
    # no sub kicks in the proof: they pass straight through its 1.2 kHz low-pass and pop out of the submerged bed
    for t in list(downbeats(T['drop'], T['proof'])) + list(downbeats(T['montage'], T['lights_out'])) + list(downbeats(T['payoff'], T['closing'])):
        in_drop = T['drop'] <= t < T['proof']
        dsp.place(add, thump, int(t * SR), 0.7 if t >= T['payoff'] else (0.5 * dsp.undb(-3) if in_drop else 0.5))
    # the drop as an epic, not a waltz (Critic #6): saw-brass stabs on beats 1 and 2-and (the level_win_big
    # brass), a crash on the drop, shaker/hat 8ths, so the drop holds up through a phone speaker
    CH = [(48, [60, 64, 67]), (53, [60, 65, 69]), (48, [60, 64, 67]), (53, [57, 60, 65]), (43, [59, 62, 67]), (48, [60, 64, 67])]
    tb = dsp.t_axis(0.5)
    for i, t in enumerate(downbeats(T['drop'], T['proof'])):
        root, voi = CH[i % 6]
        for off, vel in ((0.0, 1.0), (1.5, 0.75)):
            env = (1 - np.exp(-tb / 0.008)) * np.exp(-tb / 0.16)
            for k, m in enumerate([root - 12] + voi + [voi[0] + 12]):
                f = dsp.midi_hz(m)
                saw = sum(2 * ((f * 2 ** (c / 1200) * tb + k * 0.17) % 1) - 1 for c in (-8, 0, 8)) / 3
                y = dsp.lowpass((saw * env)[:, None], 3200, 2)[:, 0]
                dsp.place(add, dsp.stereo(y, -0.5 + 0.2 * k) / np.sqrt(2), int((t + off * beat) * SR), 0.07 * vel)
    crash = dsp.highpass(dsp.noise(2.8, 77), 3500, 2) * np.exp(-dsp.t_axis(2.8) / 0.8)
    dsp.place(add, dsp.stereo(crash, 0) / np.sqrt(2), int(T['drop'] * SR), 0.28)
    k = 0
    tt = T['drop']
    while tt < T['proof'] - 1e-6:
        sh = dsp.bandpass(dsp.noise(0.06, 900 + k), 6000, 12000, 2) * np.exp(-dsp.t_axis(0.06) / (0.012 if k % 2 else 0.02))
        dsp.place(add, dsp.stereo(sh, 0.3 if k % 2 else -0.3) / np.sqrt(2), int(tt * SR), 0.10 if k % 2 else 0.14)
        tt += beat / 2
        k += 1
    for i, t in enumerate(downbeats(T['payoff'], T['closing'])):
        for b in (1, 2):
            for j, dt in enumerate((0, 0.011, 0.023)):
                cl = dsp.bandpass(dsp.noise(0.12, 500 + i * 9 + b * 3 + j), 900, 5000, 2) * np.exp(-dsp.t_axis(0.12) / (0.012 if j < 2 else 0.05))
                dsp.place(add, dsp.stereo(cl, (-0.2, 0.2, 0)[j]) / np.sqrt(2), int((t + b * beat + dt) * SR), 0.18)
    # reversed cymbal over the last lights-out bar, landing on the payoff slam
    import design
    ir = dsp.make_ir(0.9, 4.5, 0.01, 7000, seed=12)
    rc = design.riser_peek(T['payoff'] - T['revcym'], ir)
    dsp.place(add, rc, int(T['revcym'] * SR), 0.9)
    stems['drums'] = stems['drums'] + add

    mix = sum(stems.values())
    # energy automation (applied to every stem identically, so stems still sum to the bed)
    fc = seg_curve(n, [(T['build'], 900), (T['silence'], 19500)], 20000)
    fc_exp = np.where((np.arange(n) >= int(T['build'] * SR)) & (np.arange(n) < int(T['silence'] * SR)),
                      900 * (19500 / 900) ** ((np.arange(n) / SR - T['build']) / (T['silence'] - T['build'])), fc)
    r = 0.05
    # Lights Out: dark (1.8 kHz) rather than 300 Hz, so the syndrome chord sits IN the music, not alone over a hum
    for (s0, s1, f) in ((T['proof'], T['montage'], 1200), (T['lights_out'], T['payoff'], 1800)):
        a0, a1 = int(s0 * SR), int(s1 * SR)
        fc_exp[a0:a1] = f
        ramp = int(r * SR)
        fc_exp[a1:a1 + ramp] = np.geomspace(f, 20000, ramp)
    gdb = seg_curve(n, [(T['build'], -6), (T['silence'], 0)], 0.0)
    for (s0, s1, d) in ((T["proof"], T["montage"], -8.5), (T["montage"], T["lights_out"], -2), (T["lights_out"], T["payoff"], -8), (T["end_card"], T["end"] + 2, -4.5)):
        a0, a1 = int(s0 * SR), int(s1 * SR)
        gdb[a0:a1] = d
    gdb = dsp.lowpass(gdb[:, None], 20, 1, zp=True)[:, 0]  # 30-50 ms smoothing of the level moves
    gate = np.ones(n)
    for s0, s1 in ((T['silence'], T['drop']), (T['closing_silence'], T['snap'])):
        if s0 is None or s1 is None:
            continue
        a0, a1 = int(s0 * SR), int(s1 * SR)
        rr = int(0.02 * SR)
        gate[a0 - rr:a0] = np.minimum(gate[a0 - rr:a0], np.linspace(1, 0, rr))
        gate[a0:a1] = 0
    g = dsp.undb(gdb) * gate
    for k in stems:
        stems[k] = auto_lpf(stems[k], fc_exp) * g[:, None]
    mix = sum(stems.values())
    mix = dsp.fit(mix, int(dur * SR))
    gain = dsp.undb(-16.0 - dsp.integrated(mix))
    master = dsp.limiter(mix * gain, -1.2)
    master = dsp.fade(master, 0, 1.0)
    OUT.mkdir(parents=True, exist_ok=True)
    dsp.write_wav(OUT / 'score_alt.wav', master)
    for k, v in stems.items():
        dsp.write_wav(OUT / f'stem_{k}.wav', dsp.fit(v, int(dur * SR)) * gain)
    ec = sheet.energy_checks(master, P)
    ec_hp = sheet.energy_checks(dsp.highpass(master, 300, 4), P)  # phone-speaker proxy (Critic #6)
    lo = dsp.lowpass(master[int(T['drop'] * SR):int(T['proof'] * SR)], 120, 4)
    full = master[int(T['drop'] * SR):int(T['proof'] * SR)]
    rep = {'title': 'NO PEEKING! trailer score: lullaby-epic arrangement of "Twinkle Twinkle Little Star" (public domain), game-engine instruments',
           'cue_sheet': str(Path(path).relative_to(ROOT)), 'cue_sheet_version': P['version'], 'bpm': P['bpm'], 'meter': f"{P['bpb']}/4",
           'key': 'C major', 'landmarks_s': T, 'loudness': dsp.loudness_report(master), 'ffmpeg': dsp.ffmpeg_ebur128(OUT / 'score_alt.wav'),
           'energy_gate': ec, 'energy_gate_hpf300': ec_hp,
           'phone_gate': {'drop_minus_build_peak_hpf300': ec_hp['drop_minus_build_peak'], 'pass': ec_hp['drop_minus_build_peak'] >= 6.0},
           'drop_energy_below_120Hz_pct': round(100 * float(np.sum(lo ** 2) / np.sum(full ** 2)), 1)}
    dsp.save_json(OUT / 'score_alt.json', rep)
    dsp.spectrogram_png(master, OUT / 'score_alt.png', 'public score: Twinkle lullaby-epic (game engine)',
                        marks=[(v, k) for k, v in T.items() if v is not None])
    print(rep['loudness'], rep['ffmpeg'])
    print('energy gate:', {k: v for k, v in ec.items() if k != 'build_bar_rms_db'})
    print('build bars:', ec['build_bar_rms_db'])
    print('HPF300 gate:', {k: ec_hp[k] for k in ('drop_minus_build_peak', 'drop_minus_build_avg', 'payoff_minus_montage')}, 'phone pass', rep['phone_gate']['pass'],
          'drop <120 Hz %', rep['drop_energy_below_120Hz_pct'])


if __name__ == '__main__':
    main()
