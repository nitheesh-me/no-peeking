"""Loudness-curve gate for the trailer music bed (Critic's milestone review, item 7).

RMS in 0.5 s windows (hop 0.1 s), dBFS, on videos/music/trailer_edit.wav, sections from cue_sheet.json.
  1. build rises bar by bar: per-bar RMS non-decreasing (tolerance 1 dB)
  2. drop average >= build average + 6 dB and >= build peak (max 0.5 s window) + 4 dB
  3. payoff average >= montage average + 2 dB
  4. proof bed average <= montage average - 6 dB
Exit code 0 = pass, 1 = fail. Prints JSON with all numbers.
"""
import json, sys, numpy as np, soundfile as sf
M = "/home/nitheesh/AI_things/HACKTHONS/QURIOSITY-WORK/videos/music"
wav = sys.argv[1] if len(sys.argv) > 1 else f"{M}/trailer_edit.wav"
cue = json.load(open(sys.argv[2] if len(sys.argv) > 2 else f"{M}/cue_sheet.json"))
y, sr = sf.read(wav, dtype="float32"); m = y.mean(1); FPS = cue["fps"]
S = {s["name"]: (s["start_frame"] / FPS, s["end_frame"] / FPS) for s in cue["sections"]}

def win_db(t0, t1, w=0.5, hop=0.1):
    out = []
    t = t0
    while t + w <= t1 + 1e-9:
        s = m[int(t * sr):int((t + w) * sr)]; out.append(10 * np.log10((s ** 2).mean() + 1e-12)); t += hop
    return np.array(out)
def avg_db(t0, t1):  # energy average over the section
    s = m[int(t0 * sr):int(t1 * sr)]; return float(10 * np.log10((s ** 2).mean() + 1e-12))

b0, b1 = S["build"]; bar = 96 / FPS
bars = [round(avg_db(b0 + i * bar, b0 + (i + 1) * bar), 2) for i in range(int(round((b1 - b0) / bar)))]
build_avg = avg_db(b0, b1); build_peak = float(win_db(b0, b1).max())
drop_avg = avg_db(*S["drop"]); drop_peak = float(win_db(*S["drop"]).max())
mont_avg = avg_db(*S["montage"]); pay_avg = avg_db(*S["payoff"]); proof_avg = avg_db(*S["proof"])
rises = all(bars[i + 1] >= bars[i] - 1.0 for i in range(len(bars) - 1))
res = dict(
    build_bars_db=bars, build_rises=rises,
    build_avg_db=round(build_avg, 2), build_peak_db=round(build_peak, 2), drop_avg_db=round(drop_avg, 2), drop_peak_db=round(drop_peak, 2),
    drop_over_build_avg=round(drop_avg - build_avg, 2), drop_over_build_peak=round(drop_avg - build_peak, 2),
    montage_avg_db=round(mont_avg, 2), payoff_avg_db=round(pay_avg, 2), payoff_over_montage=round(pay_avg - mont_avg, 2),
    proof_avg_db=round(proof_avg, 2), proof_under_montage=round(mont_avg - proof_avg, 2),
    section_avg_db={k: round(avg_db(*v), 2) for k, v in S.items()},
)
checks = dict(build_rises=rises, drop_6_over_build_avg=res["drop_over_build_avg"] >= 6, drop_4_over_build_peak=res["drop_over_build_peak"] >= 4,
              payoff_2_over_montage=res["payoff_over_montage"] >= 2, proof_6_under_montage=res["proof_under_montage"] >= 6)
res["checks"] = checks; res["pass"] = all(checks.values())
print(json.dumps(res, indent=1))
sys.exit(0 if res["pass"] else 1)
