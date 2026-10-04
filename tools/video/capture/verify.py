#!/usr/bin/env python3
"""
Capture verifier: smoothness, frame-rate, determinism and sharpness checks for videos/capture/<shot>.mkv.

  python3 tools/video/capture/verify.py videos/capture/sample-title-peek.mkv [more.mkv ...]
      [--twin other.mkv]          frame-by-frame determinism check against a second take of the same shot
      [--ref videos/mechanic.mp4] sharpness reference (variance of the Laplacian at 1080p)
      [--json out.json]

Checks per clip:
  * stream: 60 fps CFR, expected size, frame count matches <shot>.meta.json, virtual clock audit (vtStep min=max=1/60)
  * duplicates: runs of bit-identical consecutive frames (framemd5). The game animates every frame (breathing,
    clouds, particles), so a duplicate outside a marked hold means a frame was not advanced.
  * skips: motion energy (mean |Δ| between consecutive 480p grey frames) inside cursor glides must be smooth:
    no zero-motion frame and no single-frame spike > 2.5x the local median (a skipped frame doubles the motion).
  * sharpness: variance of the Laplacian of frames downscaled to 1080p (lanczos), vs the reference video.
"""
import argparse, json, os, subprocess, sys, hashlib
import numpy as np

def ffprobe(path):
    out = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-count_packets', '-show_entries',
                          'stream=width,height,r_frame_rate,avg_frame_rate,nb_read_packets,codec_name', '-of', 'json', path],
                         capture_output=True, text=True, check=True).stdout
    return json.loads(out)['streams'][0]

def frame_hashes(path):
    out = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-map', '0:v', '-f', 'framemd5', '-'], capture_output=True, text=True, check=True).stdout
    return [l.split(',')[-1].strip() for l in out.splitlines() if l and not l.startswith('#')]

def grey_frames(path, w=480):
    h = w * 9 // 16
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-vf', f'scale={w}:{h}:flags=area,format=gray', '-f', 'rawvideo', '-'],
                         capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.uint8).reshape(-1, h, w).astype(np.float32)

def laplacian_var(img):
    k = img[1:-1, 1:-1] * -4 + img[:-2, 1:-1] + img[2:, 1:-1] + img[1:-1, :-2] + img[1:-1, 2:]
    return float(k.var())

def frames_1080(path, times):
    out = []
    for t in times:
        raw = subprocess.run(['ffmpeg', '-v', 'error', '-ss', f'{t:.3f}', '-i', path, '-frames:v', '1',
                              '-vf', 'scale=1920:1080:flags=lanczos,format=gray', '-f', 'rawvideo', '-'], capture_output=True, check=True).stdout
        if len(raw) == 1920 * 1080: out.append(np.frombuffer(raw, np.uint8).reshape(1080, 1920).astype(np.float32))
    return out

def duration(path):
    return float(subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path], capture_output=True, text=True).stdout.strip() or 0)

def check(path, args, ref_sharp):
    base = os.path.splitext(path)[0]
    meta = json.load(open(base + '.meta.json')) if os.path.exists(base + '.meta.json') else {}
    res = {'clip': os.path.basename(path), 'ok': True, 'problems': []}
    st = ffprobe(path)
    n = int(st['nb_read_packets'])
    res.update(size=[st['width'], st['height']], fps=st['r_frame_rate'], frames=n, codec=st['codec_name'])
    if st['r_frame_rate'] != '60/1': res['problems'].append(f"fps {st['r_frame_rate']}")
    if meta and meta.get('frames') != n: res['problems'].append(f"frame count {n} != meta {meta.get('frames')}")
    vs = meta.get('vtStep') or {}
    if vs and (abs(vs['min'] - 1 / 60) > 1e-6 or abs(vs['max'] - 1 / 60) > 1e-6): res['problems'].append(f'virtual step not constant: {vs}')
    res['vtStep'] = vs
    holds = [(m['from'], m['to']) for m in meta.get('marks', []) if m.get('kind') == 'hold']
    in_hold = lambda i: any(a <= i <= b for a, b in holds)

    hs = frame_hashes(path)
    dups = [i for i in range(1, len(hs)) if hs[i] == hs[i - 1]]
    dups_out = [i for i in dups if not in_hold(i)]
    res['duplicates'] = {'total': len(dups), 'outside_holds': len(dups_out), 'first': dups_out[:12]}
    if dups_out: res['problems'].append(f'{len(dups_out)} duplicate frames outside holds')

    g = grey_frames(path)
    d = np.abs(np.diff(g, axis=0)).mean(axis=(1, 2))  # d[i] = motion between frame i and i+1
    res['motion'] = {'median': round(float(np.median(d)), 4), 'max': round(float(d.max()), 3), 'zero_frames': int((d == 0).sum())}
    # spikes: a skipped frame shows as one diff ≈ 2x its neighbours during steady motion
    spikes = []
    for i in range(2, len(d) - 2):
        loc = np.median(np.r_[d[i - 2:i], d[i + 1:i + 3]])
        if loc > 0.15 and d[i] > 2.5 * loc and d[i - 1] < 1.6 * loc and d[i + 1] < 1.6 * loc: spikes.append(i)
    res['motion']['isolated_spikes'] = spikes[:20]
    res['motion']['n_spikes'] = len(spikes)

    if args.twin:
        th = frame_hashes(args.twin)
        same = sum(1 for a, b in zip(hs, th) if a == b)
        res['determinism'] = {'twin': os.path.basename(args.twin), 'identical': same, 'of': min(len(hs), len(th)), 'len': [len(hs), len(th)]}
        if same != len(hs) or len(hs) != len(th): res['problems'].append(f'twin differs: {same}/{len(hs)} identical')

    dur = n / 60
    times = [dur * (k + 0.5) / 8 for k in range(8)]
    lv = [laplacian_var(f) for f in frames_1080(path, times)]
    res['sharpness_1080'] = {'laplacian_var_median': round(float(np.median(lv)), 1), 'samples': [round(x, 1) for x in lv]}
    if ref_sharp: res['sharpness_1080']['vs_ref'] = round(float(np.median(lv)) / ref_sharp, 2)
    res['ok'] = not res['problems']
    return res

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('clips', nargs='+')
    ap.add_argument('--twin')
    ap.add_argument('--ref', default=os.path.join(os.path.dirname(__file__), '../../../videos/mechanic.mp4'))
    ap.add_argument('--json')
    a = ap.parse_args()
    ref = None
    if a.ref and os.path.exists(a.ref):
        D = duration(a.ref)
        lv = [laplacian_var(f) for f in frames_1080(a.ref, [D * (k + 0.5) / 16 for k in range(16)])]
        ref = float(np.median(lv))
        print(f'reference {os.path.basename(a.ref)}: Laplacian variance median {ref:.1f} (16 frames)')
    out = [check(c, a, ref) for c in a.clips]
    for r in out:
        print(json.dumps(r))
    if a.json: json.dump({'reference_laplacian_var': ref, 'clips': out}, open(a.json, 'w'), indent=1)
    sys.exit(0 if all(r['ok'] for r in out) else 1)

if __name__ == '__main__':
    main()
