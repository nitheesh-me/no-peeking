"""Trailer music edit: cuts the licensed-for-personal-use song (A6Y82YjXMhU, "Twinkle" epic,
112.5 BPM, 3/4) onto a frame-exact grid and writes the cue sheet that is the source of truth
for trailer timing.

Outputs: videos/music/trailer_edit.wav, videos/music/cue_sheet.json
Run:    tools/video/safe-run.sh --mem 3G -- videos/.venv-music/bin/python tools/video/audio/music_edit.py

Grid: 112.5 BPM -> beat = 0.53333 s = exactly 32 frames @ 60 fps. Bar = 3 beats = 96 frames.
Edit beat k sits at frame F0 + 32k. Every splice keeps edit-beat == source-beat (mod 3), so the
meter never breaks.
"""
import json, numpy as np, soundfile as sf, pyloudnorm as pyln
from scipy.signal import butter, sosfilt, stft

ROOT = "/home/nitheesh/AI_things/HACKTHONS/QURIOSITY-WORK"
M = f"{ROOT}/videos/music"
FPS = 60
x, sr = sf.read(f"{M}/src/A6Y82YjXMhU.wav", dtype="float32")
assert sr == 48000 and x.ndim == 2
mono = x.mean(1)

def flux(sig, t0, t1, hop=128):
    a, b = max(0, int(t0 * sr)), min(len(sig), int(t1 * sr))
    f, t, Z = stft(sig[a:b], fs=sr, nperseg=1024, noverlap=1024 - hop, boundary=None)
    S = np.log1p(np.abs(Z) * 100)
    fl = np.maximum(np.diff(S, axis=1), 0).sum(0)
    return t[1:] + a / sr, fl

def refine(t, win=0.06):
    tt, fl = flux(mono, t - win - 0.03, t + win + 0.03)
    m = (tt > t - win) & (tt < t + win)
    return float(tt[m][np.argmax(fl[m])])

P = 32 / FPS                                  # 0.533333 s
a0 = refine(0.80)                             # first note = source beat 0
src_beat = lambda n: a0 + n * P               # source grid (verified fit: 112.4994 BPM, max resid 83 ms)
F0 = int(round(a0 * FPS))                     # edit beat 0 frame (frame aligned)
G0 = F0 / FPS
g = lambda k: G0 + k * P
shift = G0 - a0                               # applied to segment A so beat 0 lands on frame F0

# (label, src_beat_start, edit_beat_start, n_beats)  -- each anchor refined to the real onset
SEGS = [
    ("riser_into_build", 105, 21, 3),
    ("build",            108, 24, 11),
    ("pre_drop_riser",   182, 35, 4),
    # true silence k39..k42 (bot BEEP at k41)
    ("drop_to_payoff",   189, 42, 63),
    ("closing_musicbox",   0, 105, 9),
    # true silence k114..k117 (snap at k117)
]
FINAL = ("final_chord", 252, 117)
TAIL = 9.0
PRE, XF = 0.010, 0.010

end_t = g(117) - PRE + TAIL
out = np.zeros((int(end_t * sr) + int(0.05 * sr), 2), dtype=np.float32)
log = []

def place(s0, s1, e0, fi, fo):
    a, b = int(round(s0 * sr)), int(round(s1 * sr))
    seg = x[max(a, 0):b].copy()
    if a < 0: seg = np.vstack([np.zeros((-a, 2), np.float32), seg])
    nfi, nfo = int(fi * sr), int(fo * sr)
    if nfi: seg[:nfi] *= np.sin(np.linspace(0, np.pi / 2, nfi))[:, None]
    if nfo: seg[-nfo:] *= np.cos(np.linspace(0, np.pi / 2, nfo))[:, None]
    e = int(round(e0 * sr))
    out[e:e + len(seg)] += seg[: len(out) - e]

# A: cold open + peek, source 0 .. source beat 21 (shifted so beat 0 is frame aligned)
place(-shift, src_beat(21) + 0.0, 0.0, 0.0, XF) if shift > 0 else place(-shift, src_beat(21), 0.0, 0.0, XF)
log.append(dict(seg="cold_open_and_peek", src=[round(-shift, 4), round(src_beat(21), 4)], edit=[0.0, round(g(21), 4)]))
for label, sb, k0, nb in SEGS:
    ar = refine(src_beat(sb))
    fo = 0.015 if label in ("pre_drop_riser", "closing_musicbox") else XF
    place(ar - PRE, ar + nb * P, g(k0) - PRE, PRE, fo)
    log.append(dict(seg=label, src_beats=[sb, sb + nb], src=[round(ar - PRE, 4), round(ar + nb * P, 4)],
                    edit_beats=[k0, k0 + nb], edit=[round(g(k0) - PRE, 4), round(g(k0 + nb), 4)]))
ar = refine(src_beat(FINAL[1]))
place(ar - PRE, ar - PRE + TAIL, g(FINAL[2]) - PRE, 0.004, 0.0)
log.append(dict(seg="final_chord", src_beats=[252, None], src=[round(ar - PRE, 4), round(ar - PRE + TAIL, 4)],
                edit_beats=[117, None], edit=[round(g(117) - PRE, 4), round(end_t, 4)]))

# fade the chord over its last 3.5 s
e = int(end_t * sr); fl = int(3.5 * sr)
out[e - fl:e] *= (np.cos(np.linspace(0, np.pi / 2, fl)) ** 2)[:, None]
out[e:] = 0
out = out[: e + int(0.05 * sr)]

# lights_out pocket (last montage bar, k90..k93): 300 Hz lowpass, -8 dB, 40 ms in, slams back at k93
a, b, pad = int(round(g(90) * sr)), int(round(g(93) * sr)), 4800
seg = out[a - pad:b + pad].copy()
lp = sosfilt(butter(4, 300, "low", fs=sr, output="sos"), seg, axis=0) * 10 ** (-8 / 20)
w = np.zeros(len(seg), np.float32); r, r2 = int(0.04 * sr), int(0.005 * sr)
w[pad:pad + (b - a)] = 1; w[pad:pad + r] = np.linspace(0, 1, r); w[pad + (b - a) - r2:pad + (b - a)] = np.linspace(1, 0, r2)
out[a - pad:b + pad] = seg * (1 - w)[:, None] + lp * w[:, None]

# premaster loudness: -16 LUFS integrated, sample peak <= -1.5 dBFS (headroom for SFX; final master is -14)
meter = pyln.Meter(sr)
lufs = meter.integrated_loudness(out)
gain = 10 ** ((-16 - lufs) / 20)
pk = np.abs(out).max() * gain
if pk > 10 ** (-1.5 / 20): gain *= 10 ** (-1.5 / 20) / pk
out *= gain
lufs2 = meter.integrated_loudness(out)
sf.write(f"{M}/trailer_edit_v1.wav", out, sr, subtype="PCM_24")

# ---------------- cue sheet ----------------
dur = len(out) / sr
fr = lambda t: int(round(t * FPS))
nbeats = int((dur - G0) / P) + 1
beats = [F0 + 32 * k for k in range(nbeats) if F0 + 32 * k < dur * FPS]
silent = set(range(39, 42)) | set(range(114, 117))
SECTIONS = [  # name, k_start, k_end
    ("cold_open", None, 12), ("peek", 12, 21), ("build", 21, 39), ("silence", 39, 42),
    ("drop", 42, 48), ("proof", 48, 60), ("montage", 60, 93), ("payoff", 93, 105),
    ("closing", 105, 123), ("end_card", 123, None),
]
sections = []
for name, ks, ke in SECTIONS:
    s = 0 if ks is None else F0 + 32 * ks
    en = fr(dur) if ke is None else F0 + 32 * ke
    sections.append(dict(name=name, start_frame=s, end_frame=en, start_s=round(s / FPS, 4), end_s=round(en / FPS, 4),
                         beat_start=ks, beat_end=ke, bars=None if ks is None or ke is None else (ke - ks) / 3))

# detected hits on the edited track (strong onsets), snapped to the frame
tt, fl = flux(out.mean(1), 0, dur)
fl = fl / np.percentile(fl, 99.5)
hits = []
for i in range(1, len(fl) - 1):
    if fl[i] > 0.55 and fl[i] == fl[max(0, i - 40):i + 40].max():
        hits.append(dict(frame=fr(tt[i]), t=round(float(tt[i]), 4), strength=round(float(min(fl[i], 3)), 2),
                         beat=round((tt[i] - G0) / P, 2)))

named = dict(
    peek_collapse=F0 + 32 * 12, build_start=F0 + 32 * 21, build_lift=F0 + 32 * 24, pre_drop_riser=F0 + 32 * 35,
    silence_start=F0 + 32 * 39, bot_beep=F0 + 32 * 41, drop=F0 + 32 * 42, proof_start=F0 + 32 * 48,
    montage_start=F0 + 32 * 60, lights_out=F0 + 32 * 90, payoff_slam=F0 + 32 * 93, closing_musicbox=F0 + 32 * 105,
    closing_silence=F0 + 32 * 114, snap_circuit_reveal=F0 + 32 * 117, end_card=F0 + 32 * 123,
    music_end=fr(end_t),
)
cue = dict(
    file="videos/music/trailer_edit_v1.wav", source="YouTube A6Y82YjXMhU (personal use only, not for distribution)",
    sample_rate=sr, fps=FPS, duration_s=round(dur, 4), duration_frames=fr(dur),
    bpm=112.5, meter="3/4", beat_frames=32, bar_frames=96,
    grid=dict(beat0_frame=F0, formula="frame(k) = beat0_frame + 32*k", downbeat_rule="k % 3 == 0",
              phrase_rule="k % 6 == 0 (strong phrase accents)"),
    loudness=dict(integrated_lufs=round(float(lufs2), 2), sample_peak_dbfs=round(float(20 * np.log10(np.abs(out).max())), 2),
                  note="premaster bed; leave room for SFX, master the full mix to -14 LUFS / -1 dBTP"),
    sections=sections, named_hits=named,
    beats=[dict(k=k, frame=F0 + 32 * k, downbeat=k % 3 == 0, silent=k in silent) for k in range(len(beats))],
    downbeat_frames=[F0 + 32 * k for k in range(len(beats)) if k % 3 == 0],
    detected_hits=hits, edit_log=log,
)
json.dump(cue, open(f"{M}/cue_sheet_v1.json", "w"), indent=1, default=float)
print(json.dumps(dict(dur=dur, F0=F0, lufs=lufs2, nhits=len(hits), named=named), indent=1))
for s in sections: print(s["name"], s["start_frame"], s["end_frame"], s["start_s"], s["end_s"])
