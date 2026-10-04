#!/usr/bin/env python3
"""QA gate `mix_analysis`: runs analyze_mix.py on a mix work dir and fails if the mix regresses.

usage: mix_gates.py [videos/final/work/trailer]   → <work>/mix_gates.json, exit 1 on any failure

Gates (Director's brief after the user's "the audio mixing is all over the place"):
  1 anticipation   every analyze_mix anticipation rule passes, and the drop is the peak
                   (loudest momentary in the 2 s after the drop >= loudest before the silence + 2 LU)
  2 music_first    the music stem is the dominant stem in every section, except proof and lights_out where
                   the SFX may at most equal it (+0.5 LU tolerance); the silences are exempt (no music by design)
  3 silences       silence and closing_silence <= -35 LUFS (interior momentary median: a centred 3 s
                   short-term window cannot resolve a 1.6 s section)
  4 spread         in-section momentary spread (p95-p10) <= 12 LU, except the designed fades/silences
                   (silence, closing_silence, end_card)
  5 spikes         <= 3 momentary spikes > 10 LU over the music bed
  6 jumps          <= 5 level jumps (> 6 LU / 200 ms) that sit on no cut or named hit
  7 presence       SFX - music in 2-5 kHz <= +6 dB per section (sections where the music is silent exempt)
  8 loudness       integrated -14 +-0.5 LUFS (ffmpeg ebur128 on the delivered wav)
  9 encoded_tp     true peak <= -1.5 dBTP on the ENCODED AAC (as YouTube/Drive will re-encode)
"""
import json
import os
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
EXEMPT_SPREAD = {'silence', 'closing_silence', 'end_card'}
SILENCES = {'silence', 'closing_silence'}
SFX_MAY_EQUAL = {'proof', 'lights_out'}


def main():
    work = Path(sys.argv[1] if len(sys.argv) > 1 else ROOT / 'videos/final/work/trailer').resolve()
    subprocess.run([sys.executable, str(HERE / 'analyze_mix.py'), str(work)], check=True, stdout=subprocess.DEVNULL)
    A = json.loads((work / 'mix_analysis.json').read_text())
    R = json.loads((work / 'mixreport.json').read_text())
    g = {}
    ant = [c for c in A['anticipation'] if not c['pass']]
    dr = A.get('drop_rule') or {}
    g['anticipation'] = {'pass': not ant and bool(dr.get('pass')), 'failing_rules': [c['rule'] for c in ant],
                         'drop_rule': {k: dr.get(k) for k in ('pre_silence_max', 'post_drop_max', 'pass')}}
    bad = []
    for r in A['sections']:
        if r['section'] in SILENCES:
            continue
        mus = r.get('music_level', r.get('music_short_median'))
        others = {k: r.get(f'{k}_level', r.get(f'{k}_short_median')) for k in ('sfx', 'design', 'voices')}
        top = max(others.values())
        tol = 0.5 if r['section'] in SFX_MAY_EQUAL else 0.0
        if top > mus + tol:
            bad.append({'section': r['section'], 'music': mus, **others})
    g['music_first'] = {'pass': not bad, 'violations': bad}
    sil = {r['section']: r.get('mix_momentary_median') for r in A['sections'] if r['section'] in SILENCES}
    g['silences'] = {'pass': all(v is not None and v <= -35 for v in sil.values()), 'interior_momentary_median': sil,
                     'centred_short_term_median (for reference)': {r['section']: r['mix_short_median'] for r in A['sections'] if r['section'] in SILENCES}}
    spr = {r['section']: r['spread_LU (p95-p10 momentary)'] for r in A['sections']}
    over = {k: v for k, v in spr.items() if v > 12 and k not in EXEMPT_SPREAD}
    g['spread'] = {'pass': not over, 'over_12_LU': over, 'all': spr}
    g['spikes'] = {'pass': len(A['spikes']) <= 3, 'count': len(A['spikes']), 'list': A['spikes']}
    g['jumps'] = {'pass': len(A['jumps']) <= 5, 'count': len(A['jumps']), 'list': A['jumps']}
    pres = {}
    for r in A['spectrum_stereo']:
        if r['section'] in SILENCES:
            continue
        v = r.get('presence_sfx_minus_music_dB')
        if v is not None:
            pres[r['section']] = v
    g['presence'] = {'pass': all(v <= 6 for v in pres.values()), 'sfx_minus_music_2_5kHz_dB': pres}
    fl = R['loudness'].get('ffmpeg_ebur128', {})
    g['loudness'] = {'pass': fl.get('I') is not None and abs(fl['I'] + 14) <= 0.5, 'integrated_lufs': fl.get('I')}
    aac = R.get('aac_check', {})
    g['encoded_tp'] = {'pass': aac.get('TP') is not None and aac['TP'] <= -1.5, 'aac_tp_dbtp': aac.get('TP'), 'aac_I': aac.get('I')}
    out = {'work': str(work.relative_to(ROOT)), 'pass': all(v['pass'] for v in g.values()), 'gates': g}
    (work / 'mix_gates.json').write_text(json.dumps(out, indent=1))
    for k, v in g.items():
        print(f"{'PASS' if v['pass'] else 'FAIL'}  {k}: " + json.dumps({kk: vv for kk, vv in v.items() if kk not in ('pass', 'list', 'all')})[:300])
    print('mix_analysis gate:', 'PASS' if out['pass'] else 'FAIL')
    sys.exit(0 if out['pass'] else 1)


if __name__ == '__main__':
    main()
