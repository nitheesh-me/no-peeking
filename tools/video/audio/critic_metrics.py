"""Numbers for the Critic's 'Milestone: sound design' items, measured on the Editor-EDL mixes.

    tools/video/safe-run.sh -- python3 tools/video/audio/critic_metrics.py OUT.json

Per bed (song / public): motif loudness (sig_a, sig_c), how many peek layers sound at f434, the
QUIET answer vs the BEEP in the proof, per-featured-cue LUFS-M in the proof, the BEEP measurement,
both drop risers, the f3580-3602 dropout, and the public score's drop through a 300 Hz high-pass.
"""
import json
import sys
from pathlib import Path

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import dsp  # noqa: E402

ROOT = HERE.parents[2]
T = ROOT / 'videos/audio2/test'


def run():
    out = {}
    for bed in ('song', 'public'):
        d = T / f'editor_trailer_{bed}'
        r = json.loads((d / 'mixreport.json').read_text())
        cues = r['cues']
        f = lambda n: [c for c in cues if c['name'] == n]
        m = {}
        for n in ('sig_a_coldopen_impact', 'sig_c_snap', 'beep_tuned_C5', 'level_win_big', 'level_win_big_F', 'level_win_fpow'):
            for c in f(n):
                m[n] = {'frame': c['frame'], 'cue_lufs_m': c.get('cue_lufs_m'), 'music_lufs_m': c.get('music_lufs_m'), 'margin': c.get('margin_lu')}
        m['peek_layers_at_434'] = sorted(c['name'] for c in cues if abs(c['frame'] - 434) <= 30 and ('peek' in c['name'] or 'sig_a' in c['name'] or 'shatter' in c['name']))
        proof = [c for c in cues if c['featured'] and 1586 <= c['frame'] < 2162]
        m['proof_cues_lufs_m'] = [(c['frame'], c['name'], c.get('cue_lufs_m')) for c in proof]
        m['proof_min_cue_lufs_m'] = min((c.get('cue_lufs_m', -99) for c in proof), default=None)
        m['drop_risers'] = len([c for c in cues if c['name'].startswith('riser_drop')])
        m['snare_roll_frames'] = [c['frame'] for c in cues if c['name'].startswith('snare_roll')]
        m['heartbeat'] = [c['frame'] for c in cues if 'heartbeat' in c['name']]
        m['tick'] = [c['frame'] for c in cues if 'tick' in c['name']]
        m['revcym'] = [c['frame'] for c in cues if 'revcym' in c['name']]
        mix = dsp.read_wav(d / 'mix.wav')
        seg = mix[3570 * 800:3610 * 800]
        blk = np.max(np.abs(seg.reshape(-1, 800, 2)), axis=(1, 2))
        m['dropout_frames_3570_3610_below_-80dBFS'] = int(np.sum(blk < dsp.undb(-80)))
        out[bed] = m
    # public score drop on a phone proxy (HPF 300 Hz)
    x = dsp.read_wav(ROOT / 'videos/audio2/score_alt/score_alt.wav')
    hp = dsp.highpass(x, 300, 4)
    import sheet
    p = sheet.plan(ROOT / 'videos/music/cue_sheet.json')
    t = p['t']
    for name, y in (('full', x), ('hpf300', hp)):
        e = sheet.energy_checks(y, p)
        out[f'public_score_{name}'] = {k: e[k] for k in ('drop_minus_build_peak', 'drop_minus_build_avg', 'payoff_minus_montage', 'drop_avg_db', 'pass')}
    lo = dsp.lowpass(x[int(t['drop'] * 48000):int(t['proof'] * 48000)], 120, 4)
    full = x[int(t['drop'] * 48000):int(t['proof'] * 48000)]
    out['public_drop_energy_below_120Hz_pct'] = round(100 * float(np.sum(lo ** 2) / np.sum(full ** 2)), 1)
    return out


if __name__ == '__main__':
    res = run()
    Path(sys.argv[1]).write_text(json.dumps(res, indent=1, default=str))
    print(json.dumps(res, indent=1, default=str)[:4000])
