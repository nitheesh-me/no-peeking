"""Trailer music edit v2 (after the Critic's "Milestone: music edit" review).

Song: Rok Nardin "Twinkle Twinkle Little Star (Epic Version)" (A6Y82YjXMhU), 112.5 BPM, 3/4.
Personal cut only (not distributed). The public alternate is the Sound Designer's PD arrangement.

Outputs: videos/music/trailer_edit.wav, videos/music/cue_sheet.json   (v1 kept as *_v1.*)
Run:     tools/video/safe-run.sh --mem 3G -- videos/.venv-music/bin/python tools/video/audio/music_edit.py
Gate:    tools/video/safe-run.sh --mem 3G -- videos/.venv-music/bin/python tools/video/audio/music_gate.py

Grid: beat = 32 frames @ 60 fps, bar = 96 frames, edit beat k at frame 50 + 32k.
Every splice keeps edit beat == source beat (mod 3).
"""
import json, sys, numpy as np, soundfile as sf, pyloudnorm as pyln
from scipy.signal import butter, sosfilt, stft

ROOT = "/home/nitheesh/AI_things/HACKTHONS/QURIOSITY-WORK"
M = f"{ROOT}/videos/music"
FPS = 60
x, sr = sf.read(f"{M}/src/A6Y82YjXMhU.wav", dtype="float32")
assert sr == 48000 and x.ndim == 2
mono = x.mean(1)

# ---- tunables (the gate drives these) ----
T = dict(build_db0=-6.0, build_db1=0.0, build_trim=0.0, build_fc0=900.0,
         drop_lift_db=4.0, drop_hold_db=1.0, proof_db=-8.5, proof_fc=1200.0,
         montage_db=-2.0, bar1=0.0, bar2=-2.6, bar3=0.3, bar4=0.6, bar5=0.0, bar6=-1.2, lights_db=-8.0, payoff_db=2.5, cymbal_db=-9.0, peek_db=-6.0)
for a in sys.argv[1:]:
    k, v = a.split("="); T[k] = float(v)

def flux(sig, t0, t1, hop=128):
    a, b = max(0, int(t0 * sr)), min(len(sig), int(t1 * sr))
    f, t, Z = stft(sig[a:b], fs=sr, nperseg=1024, noverlap=1024 - hop, boundary=None)
    S = np.log1p(np.abs(Z) * 100)
    return t[1:] + a / sr, np.maximum(np.diff(S, axis=1), 0).sum(0)

def refine(t, win=0.06):
    tt, fl = flux(mono, t - win - 0.03, t + win + 0.03)
    m = (tt > t - win) & (tt < t + win)
    return float(tt[m][np.argmax(fl[m])])

P = 32 / FPS
a0 = refine(0.80)
src_beat = lambda n: a0 + n * P
F0 = int(round(a0 * FPS)); G0 = F0 / FPS
g = lambda k: G0 + k * P
fk = lambda k: F0 + 32 * k
shift = G0 - a0
PRE, XF = 0.010, 0.010
END_F = 4240
end_t = END_F / FPS
out = np.zeros((int(end_t * sr) + int(0.05 * sr), 2), dtype=np.float32)
log = []

def cut(s0, s1):
    a, b = int(round(s0 * sr)), int(round(s1 * sr))
    seg = x[max(a, 0):b].copy()
    if a < 0: seg = np.vstack([np.zeros((-a, 2), np.float32), seg])
    return seg

def fades(seg, fi, fo, power=False):
    nfi, nfo = int(fi * sr), int(fo * sr)
    if nfi: seg[:nfi] *= np.sin(np.linspace(0, np.pi / 2, nfi))[:, None]
    if nfo: seg[-nfo:] *= np.cos(np.linspace(0, np.pi / 2, nfo))[:, None]
    return seg

def put(seg, e0):
    e = int(round(e0 * sr)); n = min(len(seg), len(out) - e)
    out[e:e + n] += seg[:n]

# ---------- A: cold open (src 0..beat 12) ----------
A = fades(cut(-shift, src_beat(12) - PRE), 0, 0)
put(A, 0.0)
log.append(dict(seg="cold_open", src=[round(-shift, 4), round(src_beat(12) - PRE, 4)], edit=[0.0, round(g(12) - PRE, 4)]))

# ---------- peek: src beats 12..21, damaged (wow +-30 c @ 0.7 Hz, tape-stop dip on the hit, -6 dB) ----------
pk0 = refine(src_beat(12))
seg = cut(pk0 - PRE, src_beat(21) + 0.2)            # extra tail to read from
n_out = int(round((g(21) - (g(12) - PRE)) * sr))
t = np.arange(n_out) / sr
ratio = np.ones(n_out)
th = t - PRE                                        # time since the hit
# tape-stop dip: speed 1 -> 0.7 in 100 ms, back to 1 in 150 ms (starts 25 ms after the attack so the transient stays crisp)
d0, d1, d2 = 0.025, 0.125, 0.275
m1 = (th >= d0) & (th < d1); ratio[m1] = 1 - 0.3 * (th[m1] - d0) / (d1 - d0)
m2 = (th >= d1) & (th < d2); ratio[m2] = 0.7 + 0.3 * (th[m2] - d1) / (d2 - d1)
# wow, faded in over 300 ms after the dip
depth = 2 ** (30 / 1200) - 1
ramp = np.clip((th - d2) / 0.3, 0, 1)
ratio *= 1 + depth * ramp * np.sin(2 * np.pi * 0.7 * np.maximum(th - d2, 0))
pos = np.concatenate([[0], np.cumsum(ratio[:-1])])
lag_ms = (np.arange(n_out) - pos)[-1] / sr * 1000
dam = np.stack([np.interp(pos, np.arange(len(seg)), seg[:, c]) for c in range(2)], 1).astype(np.float32)
lv = np.ones(n_out, np.float32); pdb = T["peek_db"]
m = th > 0.12; lv[m] = 10 ** (pdb * np.clip((th[m] - 0.12) / 0.35, 0, 1) / 20)
dam *= lv[:, None]
dam = fades(dam, PRE, XF)
put(dam, g(12) - PRE)
log.append(dict(seg="peek_damaged", src_beats=[12, 21], edit_beats=[12, 21], edit=[round(g(12) - PRE, 4), round(g(21), 4)],
                fx=f"tape-stop dip 1->0.7->1 over {d0}-{d2}s after hit, wow +-30c @0.7Hz, {pdb} dB after 120 ms; ends {lag_ms:.0f} ms behind source"))

# ---------- build: riser (src 105-108) + build (src 108-122, tail under riser head) + pre-drop riser (src 182-186) ----------
def place(label, sb, k0, nb, fi=PRE, fo=XF, power_tail=None):
    ar = refine(src_beat(sb))
    seg = cut(ar - PRE, ar + nb * P)
    seg = fades(seg, fi, fo)
    if power_tail:  # equal-power fade over the last power_tail beats
        n = int(power_tail * P * sr); seg[-n:] *= np.cos(np.linspace(0, np.pi / 2, n))[:, None]
    put(seg, g(k0) - PRE)
    log.append(dict(seg=label, src_beats=[sb, sb + nb], src=[round(ar - PRE, 4), round(ar + nb * P, 4)],
                    edit_beats=[k0, k0 + nb], edit=[round(g(k0) - PRE, 4), round(g(k0 + nb), 4)]))
    return ar

place("build_riser", 105, 21, 3)
place("build_body", 108, 24, 14, fo=0.0, power_tail=3)          # k24..k38, fades out equal-power over k35..k38
ar = refine(src_beat(182))                                      # pre-drop riser k35..k39, fades in equal-power over k35..k38
seg = cut(ar - PRE, ar + 4 * P); n = int(3 * P * sr) + int(PRE * sr)
seg[:n] *= np.sin(np.linspace(0, np.pi / 2, n))[:, None]; seg = fades(seg, 0, 0.015)
put(seg, g(35) - PRE)
log.append(dict(seg="pre_drop_riser", src_beats=[182, 186], src=[round(ar - PRE, 4), round(ar + 4 * P, 4)],
                edit_beats=[35, 39], edit=[round(g(35) - PRE, 4), round(g(39), 4)], note="1-bar equal-power overlap with build_body over k35-k38"))
# silence k39..k42
place("drop_to_payoff", 189, 42, 63, fi=0.004)                  # k42..k105 continuous source
# closing music box: src beats 6..11.4 ("lit-tle star", held G), decays into the silence at k111
ar = refine(src_beat(6))
seg = cut(ar - PRE, src_beat(11.35)); seg = fades(seg, PRE, 0.35)
put(seg, g(105) - PRE)
log.append(dict(seg="closing_musicbox", src_beats=[6, 11.35], edit_beats=[105, 110.35], edit=[round(g(105) - PRE, 4), round(g(105) - PRE + len(seg) / sr, 4)],
                note="A A G(held) = 'lit-tle star'; 350 ms fade before the C4 pickup"))
# silence k111..k114 ; final chord at k114 (snap)
ar = refine(src_beat(252))
TAIL = end_t - (g(114) - PRE)
seg = cut(ar - PRE, ar - PRE + TAIL); seg = fades(seg, 0.004, 0)
fl = int(3.5 * sr); seg[-fl:] *= (np.cos(np.linspace(0, np.pi / 2, fl)) ** 2)[:, None]
put(seg, g(114) - PRE)
log.append(dict(seg="final_chord", src_beats=[252, None], src=[round(ar - PRE, 4), round(ar - PRE + TAIL, 4)],
                edit_beats=[114, None], edit=[round(g(114) - PRE, 4), round(end_t, 4)]))

# ---------- automation (edit time) ----------
N = len(out); tt = np.arange(N) / sr
def env(points, default):
    """points: list of (time_s, value); linear interpolation, held outside."""
    p = sorted(points); return np.interp(tt, [a for a, _ in p], [b for _, b in p]) if p else np.full(N, default)

OPEN = 20000.0
r = 0.06  # 60 ms ramps
fc_pts = [(0, OPEN), (g(21) - 0.02, OPEN), (g(21) - 0.005, np.log(T["build_fc0"]))]
# build sweep in log-frequency: 900 Hz -> open across k21..k39
fc_log = [(g(21) - 0.02, np.log(OPEN)), (g(21) - 0.005, np.log(T["build_fc0"])), (g(39), np.log(OPEN)),
          (g(48) - r, np.log(OPEN)), (g(48), np.log(T["proof_fc"])),          # proof: submerged
          (g(65), np.log(T["proof_fc"])), (g(66), np.log(OPEN)),             # filter opens, lands on f2162
          (g(87), np.log(OPEN)), (g(87) + 0.04, np.log(300)),               # lights out
          (g(93) - 0.005, np.log(300)), (g(93), np.log(OPEN))]
fc = np.exp(env([(0, np.log(OPEN))] + fc_log, np.log(OPEN)))
bt = T["build_trim"]
db_pts = [(0, 0), (g(21) - 0.005, 0), (g(21), T["build_db0"] + bt), (g(39), T["build_db1"] + bt),
          (g(42) - 0.001, T["build_db1"] + bt), (g(42), T["drop_lift_db"]), (g(42) + P, T["drop_lift_db"] - 1.0),
          (g(48) - r, T["drop_hold_db"]), (g(48), T["proof_db"]), (g(65), T["proof_db"]), (g(66), T["montage_db"]),
          (g(87), T["montage_db"]), (g(87) + 0.04, T["lights_db"]), (g(93) - 0.005, T["lights_db"]), (g(93), T["payoff_db"]),
          (g(105) - 0.02, T["payoff_db"]), (g(105) - 0.015, 0)]
gdb = env(db_pts, 0)
# per-bar build trims (steps on the downbeats, 30 ms ramps) so the build rises bar by bar
adj = np.zeros(N)
for i in range(6):
    a_, b_ = int((g(21 + 3 * i) - 0.015) * sr), int((g(24 + 3 * i) - 0.015) * sr)
    adj[a_:b_] = T[f"bar{i + 1}"]
k_ = int(0.03 * sr); adj = np.convolve(adj, np.ones(k_) / k_, mode="same")
gdb = gdb + adj

# time-varying 4th-order Butterworth LPF, 64-sample blocks, cached coefficients (1/24-octave steps), state carried
BS = 64; cache = {}; zi = np.zeros((2, 2, 2))  # (sections, 2 states, channels) handled per channel
zi = [np.zeros((2, 2)) for _ in range(2)]
y = np.empty_like(out)
for i in range(0, N, BS):
    f = fc[min(i + BS // 2, N - 1)]
    key = int(round(24 * np.log2(min(f, 20000) / 20)))
    if key not in cache: cache[key] = butter(4, min(20 * 2 ** (key / 24), 0.45 * sr), "low", fs=sr, output="sos")
    sos = cache[key]
    for c in range(2):
        y[i:i + BS, c], zi[c] = sosfilt(sos, out[i:i + BS, c], zi=zi[c])
out = y * (10 ** (gdb / 20)).astype(np.float32)[:, None]

# ---------- reversed cymbal f2930 -> f3026 (not filtered) ----------
rng = np.random.default_rng(7)
L = int(round((g(93) - g(90)) * sr))
nz = rng.standard_normal((L + sr, 2)).astype(np.float32)
nz = sosfilt(butter(4, 3500, "high", fs=sr, output="sos"), nz, axis=0)
for f0 in (5200, 7400, 9800):  # metallic resonances
    nz += 0.6 * sosfilt(butter(2, [f0 * 0.93, f0 * 1.07], "band", fs=sr, output="sos"), nz, axis=0)
ce = np.exp(-np.arange(L + sr) / sr / 0.55)
cym = (nz * ce[:, None])[:L][::-1].copy()
cym /= np.sqrt((cym[-int(0.2 * sr):] ** 2).mean())
cym *= 10 ** (T["cymbal_db"] / 20) * np.sqrt((out[int(g(93) * sr):int((g(93) + 1.0) * sr)] ** 2).mean())
cym[-int(0.004 * sr):] *= np.linspace(1, 0, int(0.004 * sr))[:, None]
e = int(round(g(93) * sr)) - L
out[e:e + L] += cym

# ---------- premaster loudness: -16 LUFS integrated, sample peak <= -1.5 dBFS ----------
out[int(end_t * sr):] = 0
meter = pyln.Meter(sr)
lufs = meter.integrated_loudness(out)
gain = 10 ** ((-16 - lufs) / 20)
pk = np.abs(out).max() * gain
if pk > 10 ** (-1.5 / 20): gain *= 10 ** (-1.5 / 20) / pk
out *= gain
lufs2 = meter.integrated_loudness(out)
sf.write(f"{M}/trailer_edit.wav", out, sr, subtype="PCM_24")

# ---------- drop tonic (for tuning the BEEP) ----------
seg = out[int(g(42) * sr):int(g(48) * sr)].mean(1)
S = np.abs(np.fft.rfft(seg * np.hanning(len(seg)))); f = np.fft.rfftfreq(len(seg), 1 / sr)
chroma = np.zeros(12)
mk = (f > 60) & (f < 2000)
for fi, si in zip(f[mk], S[mk]): chroma[int(round(12 * np.log2(fi / 261.63))) % 12] += si ** 2
NAMES = "C C# D D# E F F# G G# A A# B".split()
tonic = NAMES[int(np.argmax(chroma))]

# ---------- cue sheet ----------
dur = len(out) / sr
fr = lambda t_: int(round(t_ * FPS))
nb = int((END_F - F0) / 32) + 1
silent = set(range(39, 42)) | set(range(111, 114))
SECTIONS = [  # name, k_start, k_end
    ("cold_open", None, 12), ("peek", 12, 21), ("build", 21, 39), ("silence", 39, 42), ("drop", 42, 48),
    ("proof", 48, 66), ("montage", 66, 87), ("lights_out", 87, 93), ("payoff", 93, 105),
    ("closing_musicbox", 105, 111), ("closing_silence", 111, 114), ("snap_circuit_reveal", 114, 123), ("end_card", 123, None),
]
MIX = {"cold_open": "music box, decays to ~-47 dB into the hit", "peek": "music box damaged: wow +-30 c @ 0.7 Hz, tape-stop dip on f434, -6 dB",
       "build": "LPF 900 Hz -> open + -6 -> 0 dB over 6 bars; build tail overlaps the riser head k35-38",
       "silence": "digital zero; only the BEEP at f1362", "drop": f"+{T['drop_lift_db']} dB transient lift on f1394, settling to +{T['drop_hold_db']} dB",
       "proof": f"submerged bed: LPF {T['proof_fc']:.0f} Hz, {T['proof_db']} dB (SFX lead)", "montage": f"filter opens over k65-66, landing on f2162; bed {T['montage_db']} dB",
       "lights_out": f"LPF 300 Hz, {T['lights_db']} dB; reversed cymbal f2930 -> f3026", "payoff": f"the loudest bed moment ({T['payoff_db']:+} dB); leave headroom for the fanfare",
       "closing_musicbox": "'lit-tle star' (A A G held), decays into the silence", "closing_silence": "digital zero",
       "snap_circuit_reveal": "snap + final orchestral chord at f3698", "end_card": "chord rings out, fades to zero by f4240"}
sections = []
for name, ks, ke in SECTIONS:
    s = 0 if ks is None else fk(ks); en = END_F if ke is None else fk(ke)
    sections.append(dict(name=name, start_frame=s, end_frame=en, start_s=round(s / FPS, 4), end_s=round(en / FPS, 4),
                         beat_start=ks, beat_end=ke, bars=None if ks is None or ke is None else (ke - ks) / 3, mix=MIX[name]))
proof_steps = [dict(step="flip", frame=fk(48), bars=1), dict(step="bots_ask_label", frame=fk(51), bars=2),
               dict(step="boop", frame=fk(57), bars=1), dict(step="xray_reveal", frame=fk(60), bars=2)]
montage_cuts = [fk(k) for k in (66, 69, 72, 75, 77, 79, 81, 82, 83, 84, 85, 86)]
named = dict(peek_collapse=fk(12), build_start=fk(21), build_lift=fk(24), pre_drop_riser=fk(35), silence_start=fk(39),
             bot_beep=fk(41), drop=fk(42), proof_start=fk(48), montage_filter_open=fk(66), lights_out=fk(87),
             reverse_cymbal_start=fk(90), payoff_slam=fk(93), closing_musicbox=fk(105), closing_silence=fk(111),
             snap_circuit_reveal=fk(114), end_card=fk(123), music_end=END_F)
tt2, fl2 = flux(out.mean(1), 0, dur); fl2 = fl2 / np.percentile(fl2, 99.5)
hits = [dict(frame=fr(tt2[i]), t=round(float(tt2[i]), 4), strength=round(float(min(fl2[i], 3)), 2), beat=round((tt2[i] - G0) / P, 2))
        for i in range(1, len(fl2) - 1) if fl2[i] > 0.55 and fl2[i] == fl2[max(0, i - 40):i + 40].max()]
cue = dict(
    version=2, file="videos/music/trailer_edit.wav", previous="videos/music/cue_sheet_v1.json",
    source="YouTube A6Y82YjXMhU, Rok Nardin 'Twinkle Twinkle Little Star (Epic Version)' (personal cut only, not distributed)",
    sample_rate=sr, fps=FPS, duration_s=round(dur, 4), duration_frames=END_F,
    bpm=112.5, meter="3/4", beat_frames=32, bar_frames=96,
    grid=dict(beat0_frame=F0, formula="frame(k) = beat0_frame + 32*k", downbeat_rule="k % 3 == 0", phrase_rule="k % 6 == 0"),
    cut_rules=dict(
        no_half_bar_cuts="a half bar is 1.5 beats (48 frames) and is off the grid; never cut there",
        never_beat2_alone="never cut on beat 2 (k % 3 == 1) in isolation; weak-beat cuts only inside the 32-frame run",
        montage_ladder="96 -> 64 -> 32 frames: 3 downbeat cuts (96), 2 hemiola bars = 3 cuts every 64 frames, 2 bars of beat cuts (32)",
        montage_cut_frames=montage_cuts, montage_shots=12,
        other_cuts="all section boundaries are downbeats; elsewhere cut on downbeats unless a named hit says otherwise"),
    loudness=dict(integrated_lufs=round(float(lufs2), 2), sample_peak_dbfs=round(float(20 * np.log10(np.abs(out).max())), 2),
                  note="premaster bed; duck 2-5 kHz (dynamic EQ, -6 dB) under featured SFX; master the full mix to -14 LUFS / -1 dBTP"),
    beep_pitch=dict(drop_chroma_top=tonic, drop_harmony="F minor-ish (F, E, G#, C strongest); music box and final chord are C major",
                    recommended="C5 (523.25 Hz): the 5th of the drop and the home key", note="tune the bot BEEP (f1362) to this"),
    automation=T, sections=sections, proof_steps=proof_steps, named_hits=named,
    beats=[dict(k=k, frame=fk(k), downbeat=k % 3 == 0, silent=k in silent) for k in range(nb) if fk(k) < END_F],
    downbeat_frames=[fk(k) for k in range(nb) if k % 3 == 0 and fk(k) < END_F],
    detected_hits=hits, edit_log=log,
)
json.dump(cue, open(f"{M}/cue_sheet.json", "w"), indent=1, default=float)
print("dur", dur, "lufs", round(lufs2, 2), "peak", cue["loudness"]["sample_peak_dbfs"], "tonic", tonic, "peek lag ms", round(lag_ms, 1))
