#!/usr/bin/env python3
"""
Compare a re-take's sidecars with an older take: are timings frame-identical apart from speech bubbles?

  python3 tools/video/capture/difftake.py videos/capture/_old_pg_split_23/pg_split_23 videos/capture/pg_split_23 [--offset N]

--offset N: the new clip's frame 0 is the old clip's frame N (range captures).
Bubble entries (dialogue_*, voice) and '.dialogue' layout boxes are reported separately, not as failures.
Only event types recorded by BOTH takes are compared (types only one tool version logs are listed, not failed).
Also checks the mkv packet count against meta.json.
"""
import json, sys, subprocess, os, argparse

BUBBLE_EV = {'dialogue_show', 'dialogue_typed', 'dialogue_hide', 'voice'}

def packets(mkv):
    out = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-count_packets', '-show_entries', 'stream=nb_read_packets', '-of', 'csv=p=0', mkv], capture_output=True, text=True).stdout.strip()
    return int(out or 0)

def key(e):
    return json.dumps({k: v for k, v in e.items() if k not in ('vt',)}, sort_keys=True)

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('old'); ap.add_argument('new'); ap.add_argument('--offset', type=int, default=0)
    a = ap.parse_args()
    ok = True
    meta = json.load(open(a.new + '.meta.json'))
    n = packets(a.new + '.mkv')
    print(f"packets {n} vs meta frames {meta['frames']}: {'OK' if n == meta['frames'] else 'MISMATCH'}"); ok &= n == meta['frames']
    oe = json.load(open(a.old + '.events.json'))['events']; ne = json.load(open(a.new + '.events.json'))['events']
    def shift(e):
        e = dict(e)
        if e.get('frame') is not None: e['frame'] -= a.offset
        return e
    oe = [shift(e) for e in oe if e.get('frame') is not None and e['frame'] >= a.offset]
    ne = [e for e in ne if e.get('frame') is not None]
    # compare only the event types BOTH takes record (a newer tool may log extra types, e.g. sprite/think bubbles)
    to = {e['type'] for e in oe} - BUBBLE_EV; tn = {e['type'] for e in ne} - BUBBLE_EV
    shared = to & tn
    if to ^ tn: print(f'event types recorded by only one take (not compared): old-only {sorted(to - tn)}, new-only {sorted(tn - to)}')
    ob = [e for e in oe if e['type'] in shared]; nb = [e for e in ne if e['type'] in shared]
    os_, ns = [key(e) for e in ob], [key(e) for e in nb]
    if os_ == ns: print(f'events (shared non-bubble types: {len(shared)}): IDENTICAL ({len(ns)} events, frames + payloads)')
    else:
        ok = False; print('events (shared non-bubble types): DIFFER')
        import difflib
        for l in list(difflib.unified_diff(os_, ns, lineterm='', n=0))[:30]: print('  ', l[:200])
    bo = [e for e in oe if e['type'] in BUBBLE_EV and e['type'] != 'voice']; bn = [e for e in ne if e['type'] in BUBBLE_EV and e['type'] != 'voice']
    print(f'bubble events: old {len(bo)} → new {len(bn)}; voice calls old {sum(e["type"]=="voice" for e in oe)} → new {sum(e["type"]=="voice" for e in ne)}')
    if os.path.exists(a.old + '.layout.json') and os.path.exists(a.new + '.layout.json'):
        def segs(p, off):
            out = []
            for s in json.load(open(p))['segments']:
                if s['sel'] == '.dialogue': continue
                f, t = s['from'] - off, s['to'] - off
                if t < 0: continue
                out.append((s['sel'], max(0, f), t, json.dumps(s['rects'])))
            return sorted(out)
        so, sn = segs(a.old + '.layout.json', a.offset), segs(a.new + '.layout.json', 0)
        if a.offset:  # the old take's first overlapping segment was clipped; compare only fully-inside segments
            so = [s for s in so if s[1] > 0]; sn = [s for s in sn if s[1] > 0]
        if so == sn: print(f'layout (non-.dialogue): IDENTICAL ({len(sn)} segments)')
        else:
            ok = False; print('layout (non-.dialogue): DIFFER'); print('   only old:', [s for s in so if s not in sn][:5]); print('   only new:', [s for s in sn if s not in so][:5])
    print('RESULT:', 'PASS' if ok else 'FAIL')
    sys.exit(0 if ok else 1)

main()
