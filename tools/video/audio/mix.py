#!/usr/bin/env python3
"""NO PEEKING! mixer: EDL + capture event logs + music bed  →  stems + master + mixreport.

usage:
  python3 tools/video/audio/mix.py tools/video/edl/trailer.edl.json
        [--preset trailer|mechanic|showcase]   (default: the EDL's "video")
        [--music videos/music/trailer_edit.wav] [--music-offset-frames 0]
        [--cues extra_cues.json ...] [--no-design] [--out DIR] [--no-engine]
        [--target -14] [--tp -1.0] [--margin 6]

What it does
  1. Game SFX, frame-exact. Every capture event (sfx / botNote / syndromeChord / voice) whose
     source frame is shown in a clip is placed at the FIRST timeline frame showing that source frame
     (Editor's frame map, so speed changes and ramps are honoured): sample = frame * 800 at 48 kHz/60 fps.
     Samples come from the hi-fi library (videos/audio2/lib); trailer preset uses the trailer-weight
     versions for featured SFX. Variants rotate like the game's random variation.
  2. Speed thinning. In sped-up clips (speed > 1.05) dense SFX are thinned by priority: same-name
     minimum gap 90 ms x (1 + log2 speed), at most 3/2/1 events per 250 ms (speed <2 / <4 / >=4),
     UI clicks/hovers/card sounds dropped at >= 2x, non-featured survivors -1.5 dB per doubling,
     voices muted above 1.3x. Every thinned event is listed in the report (inverse-SFX gate).
  3. Designed layers from the cue list (cues/trailer_design.json for the trailer, anchored to the cue
     sheet's sections/hits) + the EDL clip cues (editor names are aliased; the EDL wins on a group)
     + automatic transition sweeteners (shatter → whoosh+shards, glitch → glitch tear).
  4. Ducking. Each featured cue gets its own sidechain-style dip of the music (10 ms attack with 10 ms
     look-ahead, hold for the cue's body, ~150 ms release), solved so the cue's max momentary loudness
     is >= margin+1 LU above the music in the same 400 ms window (cue boosted up to +6 dB if the dip
     is capped). Plus a gentle broadband dip (<= 3 dB) under all other SFX/voices and a 2-5 kHz -4 dB
     band dip of the music while any SFX/voice plays.
  5. Master: sum → gain to target LUFS → true-peak lookahead limiter (ceiling tp-0.2) → verify
     (own BS.1770 meter + ffmpeg ebur128). Stems are written post-gain/pre-limiter (sum ≈ mix).
Outputs: <out>/mix.wav (24-bit), <out>/stems/{music,sfx,voices,design}.wav, <out>/mixreport.json,
<out>/mix.png (spectrogram + momentary loudness with cue marks), <out>/cues.json (timeline cue list for QA).
"""
from __future__ import annotations

import argparse
import json
import math
import os
import sys
from collections import defaultdict
from pathlib import Path

import itertools

import numpy as np

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
sys.path.insert(0, str(HERE.parent / 'edl'))
import dsp  # noqa: E402
from dsp import SR  # noqa: E402
import edl as E  # noqa: E402

ROOT = HERE.parents[2]


def relp(p):
    """Path relative to the project when inside it, else absolute (outputs may go to a scratch dir)."""
    p = Path(p)
    return str(p.relative_to(ROOT)) if p.is_relative_to(ROOT) else str(p)
LIB = ROOT / 'videos/audio2/lib'
DESIGN = ROOT / 'videos/audio2/design'
SPF = SR // 60  # samples per frame at 60 fps (800)

PRESETS = {
    'trailer': dict(music_lufs=-20.0, max_duck=12.0, weight='trailer', voices=False, sfx_gain_db=4.0, voice_gain_db=-6,
                    design=HERE / 'cues/trailer_design.json', bg_duck=3.0, featured_all_game=True, plr_db=10.0, quiet_target_lufs=-16.0),
    'mechanic': dict(music_lufs=-27.0, max_duck=12.0, weight='game', voices=True, sfx_gain_db=0.0, voice_gain_db=-2.0,
                     design=None, bg_duck=2.0, featured_all_game=False, plr_db=14.0),
    'showcase': dict(music_lufs=-25.0, max_duck=12.0, weight='game', voices=True, sfx_gain_db=0.0, voice_gain_db=-3.0,
                     design=None, bg_duck=2.0, featured_all_game=False, plr_db=14.0),
}
PRIORITY = {'peek_collapse': 10, 'level_win': 10, 'gremlin_flip': 9, 'botNote': 9, 'syndromeChord': 9, 'glitch': 8,
            'boop': 8, 'listen_beep': 8, 'ghost_phase': 8, 'highfive': 7, 'test_pass': 7, 'test_fail': 7, 'wobble': 7,
            'listen_quiet': 6, 'spin': 6, 'shush': 6, 'snap_measure': 6, 'gremlin_sneak': 5, 'reset': 4,
            'schrodi_meow': 4, 'rewind': 3, 'qubble_snore': 3, 'qubble_giggle': 3, 'card_pick': 2, 'card_drop': 2,
            'ui_click': 1, 'ui_hover': 1}
# gameplay sounds that carry the story: featured (must clear the music by the margin) in every preset
FEATURED = {'peek_collapse', 'level_win', 'gremlin_flip', 'botNote', 'syndromeChord', 'glitch', 'boop', 'listen_beep',
            'listen_quiet', 'ghost_phase', 'highfive', 'test_pass', 'test_fail', 'wobble', 'spin', 'shush', 'snap_measure'}
ALIASES = {  # Editor's clip-cue names (plans.py) → design assets / groups
    'peek_collapse_impact': 'sig_a_coldopen_impact', 'title_letters_pitched': 'sig_b_title_phrase',
    'bot_beep_dry': 'beep_tuned_C5', 'drop_impact': 'impact_logo', 'snap': 'sig_c_snap', 'silence': 'gate:music',
    'logo_impact': 'impact_logo', 'shatter': 'shatter_whoosh_shards', 'glitch_tear': 'glitch_tear',
}
GROUP_OF = {v: k for k, v in ALIASES.items()}
BOT_LETTERS = 'abcdefgh'


# ───────────────────────── loading ─────────────────────────
def rel(p):
    return Path(p) if os.path.isabs(str(p)) else ROOT / p


_cache: dict = {}


def load_audio(path) -> np.ndarray:
    path = str(path)
    if path not in _cache:
        _cache[path] = dsp.read_wav(path)
    return _cache[path]


def load_events(path) -> list[dict]:
    """Capture Engineer events: frame = clip-local frame (null = off camera / pre-roll)."""
    if not path or not rel(path).exists():
        return []
    d = json.loads(rel(path).read_text())
    evs = d.get('events', []) if isinstance(d, dict) else d
    fps = d.get('fps', 60) if isinstance(d, dict) else 60
    t0 = d.get('t0') if isinstance(d, dict) else None
    out = []
    for e in evs:
        e = dict(e)
        if e.get('frame') is None and t0 is not None and 'vt' in e:
            e['frame'] = int(round((e['vt'] - t0) * fps))
        out.append(e)
    return out


def voice_lines(evs: list[dict]) -> list[dict]:
    """Group voice events into lines; rebuild each line's text from the logged characters (incl. pre-roll)."""
    lines, cur = [], None
    for e in evs:
        if e.get('type') != 'voice':
            continue
        if cur is None or e['who'] != cur['who'] or e.get('n') != cur['n'] or e['i'] <= cur['last_i']:
            cur = {'who': e['who'], 'n': e.get('n', 0), 'chars': {}, 'events': [], 'last_i': -1}
            lines.append(cur)
        cur['chars'][e['i']] = e.get('ch', '')
        cur['events'].append(e)
        cur['last_i'] = e['i']
    idx = []
    try:
        idx = json.loads((LIB / 'voices/index.json').read_text())
    except Exception:
        pass
    for l in lines:
        n = max(l['n'], l['last_i'] + 1)
        known = ''.join(l['chars'].get(i, '\0') for i in range(n))
        full = None
        if '\0' in known:  # characters never logged (capture ended / typing skipped): complete from the game's lines
            for e in idx:
                t = e['text']
                if e['who'] == l['who'] and len(t) == n and all(c == '\0' or c == t[i] for i, c in enumerate(known)):
                    full = t
                    break
        l['text'] = full or known.replace('\0', ' ')
        l['text_source'] = 'library' if full else 'capture'
    return lines


def cue_sheet(edl_obj, override=None):
    defaults = ('videos/music/cue_sheet.json',) if edl_obj.get('video', 'trailer') == 'trailer' else ()
    for p in (override, edl_obj.get('cue_sheet')) + defaults:
        if p and rel(p).exists():
            cs = E.load_cue_sheet(str(rel(p)), edl_obj.get('fps', 60))
            hits = {}
            raw = cs['hits']
            if isinstance(raw, dict):
                for k, v in raw.items():
                    hits[k] = v if isinstance(v, int) else int(round((v.get('t_s', 0) if isinstance(v, dict) else v) * 60))
            else:
                for h in raw:
                    f = h.get('frame')
                    if f is None:
                        f = int(round(h.get('t_s', h.get('time_s', h.get('t', 0))) * 60))
                    hits[h.get('name')] = f
            for k, v in (cs['raw'].get('named_hits') or {}).items():  # Music Supervisor's sheet: name -> frame
                hits.setdefault(k, int(v) if isinstance(v, (int, float)) else int(v.get('frame', 0)))
            cs['hits_f'] = hits
            cs['path'] = str(p)
            return cs
    return None


# ───────────────────────── anchors ─────────────────────────
def resolve_anchor(chain, cs, bpm):
    """'hit:name[+-Nb|Nf]' / 'section:name[.end][+-Nb|Nf]' → timeline frame (first that resolves)."""
    import re
    if isinstance(chain, (int, float)):
        return int(chain)
    for a in ([chain] if isinstance(chain, str) else chain):
        if isinstance(a, (int, float)):
            return int(a)
        m = re.match(r'^(hit|section|frame):([A-Za-z0-9_]+)(\.end)?([+-][\d.]+[bf])?$', a)
        if not m:
            continue
        kind, name, end, off = m.groups()
        f = None
        if kind == 'frame':
            f = int(name)
        elif cs and kind == 'hit' and name in cs['hits_f']:
            f = cs['hits_f'][name]
        elif cs and kind == 'section' and name in cs['sections']:
            f = cs['sections'][name][1 if end else 0]
        if f is None:
            continue
        if off:
            v = float(off[:-1])
            f += int(round(v * 3600 / bpm)) if off[-1] == 'b' else int(v)
        return f
    return None


# ───────────────────────── sample sources ─────────────────────────
class Library:
    def __init__(self, weight):
        self.weight = weight
        self.rot = defaultdict(int)
        self.design = json.loads((DESIGN / 'design.json').read_text())['assets'] if (DESIGN / 'design.json').exists() else {}
        self._tw = None

    def sfx(self, name, featured):
        if self.weight == 'trailer' and featured and (LIB / f'trailer/{name}.wav').exists():
            return load_audio(LIB / f'trailer/{name}.wav'), 'trailer/' + name
        k = self.rot[name] % 3 + 1
        self.rot[name] += 1
        p = LIB / f'game/{name}__v{k}.wav'
        if not p.exists():
            return None, None
        return load_audio(p), f'game/{name}__v{k}'

    def bot(self, i, r, featured):
        b = BOT_LETTERS[i % 8]
        n = f'bot_{b}_{"beep" if r else "quiet"}'
        if self.weight == 'trailer' and featured and (LIB / f'trailer/{n}.wav').exists():
            return load_audio(LIB / f'trailer/{n}.wav'), 'trailer/' + n
        if self.weight == 'trailer' and featured:
            return self.sweeten(load_audio(LIB / f'bots/{n}.wav'), r), 'bots/' + n + '+sweet'
        return load_audio(LIB / f'bots/{n}.wav'), 'bots/' + n

    def chord(self, bits, featured):
        n = 'chord_' + ''.join(str(int(b)) for b in bits)
        if self.weight == 'trailer' and featured and (LIB / f'trailer/{n}.wav').exists():
            return load_audio(LIB / f'trailer/{n}.wav'), 'trailer/' + n
        if (LIB / f'chords/{n}.wav').exists():
            return load_audio(LIB / f'chords/{n}.wav'), 'chords/' + n
        # compose exactly like AudioEngine.syndromeChord: strum 60 ms, beep vel 1.1, quiet vel 1.2
        out = np.zeros((int(3 * SR), 2))
        for i, b in enumerate(bits[:8]):
            x, _ = self.bot(i, b, False)
            dsp.place(out, x * (1.1 if b else 1.2), int(i * 0.06 * SR))
        return dsp.trim_silence(out, -80, 0, 0.03), n + '(composed)'

    def sweeten(self, x, loud=True):
        import build_library as BL
        ir = dsp.make_ir(0.7, 6.0, 0.008, 7000, seed=3)
        return BL.trailer_weight(x, 56, 0.6 if loud else 0.35, 3.0, 4 if loud else 3, 0.12, ir)

    def asset(self, name):
        """design asset / 'trailer/x' / 'game/x' / plain sfx name → (audio, meta)."""
        name = ALIASES.get(name, name)
        if name.startswith('design/'):
            name = name[7:]
        if name in self.design:
            m = self.design[name]
            return load_audio(ROOT / m['path']), m
        for sub in ('', '.wav'):
            p = LIB / f'{name}{sub}'
            if p.suffix == '.wav' and p.exists():
                return load_audio(p), {'hit_s': 0.0, 'kind': 'sfx'}
        p = LIB / f'game/{name}__v1.wav'
        if p.exists():
            return load_audio(p), {'hit_s': 0.0, 'kind': 'sfx'}
        return None, None


# ───────────────────────── engine voices ─────────────────────────
def render_voice_stem(calls, n, use_engine):
    """All voice calls (timeline seconds) through the game's Babbler in one offline render."""
    if not calls:
        return np.zeros((n, 2)), 'none'
    if use_engine:
        try:
            from engine_render import render_jobs
            job = {'name': 'voices', 'secs': n / SR + 0.5, 'dry': False, 'seed': 11,
                   'calls': [{'t': c['t'], 'k': 'voice', 'who': c['who'], 'i': c['i'], 'line': c['line']} for c in calls]}
            x, = render_jobs([job], verbose=False)
            gl = json.loads((LIB / 'library.json').read_text()).get('voice_gain_db', 0)
            return dsp.fit(x, n) * dsp.undb(gl), 'engine'
        except Exception as ex:  # fall back to the pre-rendered line library
            print('  engine voice render failed, using library:', ex)
    idx = json.loads((LIB / 'voices/index.json').read_text())
    by = {(e['who'], e['text']): e for e in idx}
    out = np.zeros((n, 2))
    seen = set()
    for c in calls:
        k = (c['who'], c['line'], c['line_id'])
        if k in seen:
            continue
        seen.add(k)
        e = by.get((c['who'], c['line']))
        if e:
            x = load_audio(ROOT / e['file'])
            off = int(round((c['t'] - c['i'] * 0.022) * SR))
            dsp.place(out, x, off)
    return out, 'library'


# ───────────────────────── ducking ─────────────────────────
CR = 1000  # control rate (Hz)


def body_end(x, onset_s, max_s=2.0, min_s=0.12):
    """Seconds after onset until the cue's 20 ms envelope stays 20 dB below its peak."""
    a = np.max(np.abs(x), axis=1)
    if not len(a) or a.max() <= 0:
        return min_s
    blk = SR // 50
    nb = len(a) // blk + 1
    e = dsp.fit(a[:, None], nb * blk)[:, 0].reshape(nb, blk).max(1)
    thr = e.max() * 0.1
    idx = np.nonzero(e > thr)[0]
    end = (idx[-1] + 1) * blk / SR if len(idx) else min_s
    return float(np.clip(end, min_s, max_s))


def dip_envelope(dips, n_ctrl, attack=0.010, release=0.150, look=0.010):
    """Max-combined dB dips: linear ramp in over `attack` (starting `look` early), hold, ramp out over `release`."""
    env = np.zeros(n_ctrl)
    t = np.arange(n_ctrl) / CR
    for (a, b, d) in dips:
        if d <= 0:
            continue
        s = a - look
        i0 = max(0, int(s * CR))
        i1 = min(n_ctrl, int((b + release) * CR) + 1)
        tt = t[i0:i1]
        g = np.where(tt < s + attack, (tt - s) / attack, np.where(tt <= b, 1.0, 1 - (tt - b) / release))
        env[i0:i1] = np.maximum(env[i0:i1], d * np.clip(g, 0, 1))
    return env


def ctrl_to_samples(env_db, n):
    x = np.arange(n) / SR
    return np.interp(x, np.arange(len(env_db)) / CR, env_db)


def momentary_at(x, t0, t1, hop=0.01):
    """Momentary loudness series (400 ms windows starting every hop) over [t0, t1)."""
    a = max(0, int(t0 * SR))
    b = min(len(x), int((t1 + 0.4) * SR))
    seg = x[a:b]
    if len(seg) < int(0.4 * SR):
        seg = dsp.fit(seg, int(0.4 * SR))
    return dsp.momentary(seg, hop), a / SR


# ───────────────────────── main mix ─────────────────────────
def build(args):
    edl = E.load(str(rel(args.edl))) if not isinstance(args.edl, dict) else E.load(args.edl)
    fps = edl.get('fps', 60)
    assert fps == 60, 'mixer assumes 60 fps (800 samples/frame)'
    video = edl.get('video', 'trailer')
    P = dict(PRESETS[args.preset or video])
    cs = cue_sheet(edl, args.cue_sheet)
    bpm = float((cs or {}).get('bpm') or 96)
    dur_f = int(edl['duration'])
    N = dur_f * SPF + int(3.0 * SR)  # 3 s of tail room, cropped at the end
    lib = Library(P['weight'])
    stems = {k: np.zeros((N, 2)) for k in ('music', 'sfx', 'voices', 'design')}
    cues, thinned, offscreen = [], [], []
    IDS = itertools.count()  # unique ids (suppression removes cues; ids must never collide)

    # ── 1. game events → timeline ──
    raw = []
    voice_calls = []
    line_id = 0
    for c in edl['clips']:
        au = c.get('audio', {}) or {}
        if au.get('mute'):
            continue
        evs = load_events(c.get('events'))
        fmap = c['_map']
        first = {}
        for i, s in enumerate(fmap):
            first.setdefault(s, i)
        srcs = sorted(first)

        def to_tl(f):
            if f in first:
                return c['start'] + first[f]
            # a source frame skipped by a speed-up: the next shown frame
            import bisect
            k = bisect.bisect_left(srcs, f)
            return c['start'] + first[srcs[k]] if k < len(srcs) else None

        def spd(tf):
            return E.speed_at(c['speed'], tf - c['start'])

        for e in evs:
            f = e.get('frame')
            if e.get('type') not in ('sfx', 'botNote', 'syndromeChord'):
                continue
            if f is None or not (c['in'] <= f < c['out']):
                if f is not None:
                    offscreen.append({'clip': c['id'], 'type': e['type'], 'name': e.get('name'), 'src_frame': f})
                continue
            tf = to_tl(f)
            if tf is None:
                continue
            name = e.get('name') if e['type'] == 'sfx' else e['type']
            raw.append({'clip': c['id'], 'shot': c.get('shot'), 'type': e['type'], 'name': name, 'src_frame': f, 'frame': tf,
                        'speed': spd(tf), 'opts': e.get('opts', {}), 'bot': e.get('bot'), 'result': e.get('result'),
                        'bits': e.get('bits'), 'clip_gain_db': au.get('gain_db', 0.0)})
        # voices
        if P['voices'] and au.get('voices', True):
            for ln in voice_lines(evs):
                line_id += 1
                for e in ln['events']:
                    f = e.get('frame')
                    if f is None or not (c['in'] <= f < c['out']):
                        continue
                    tf = to_tl(f)
                    if tf is None or spd(tf) > 1.3:
                        continue
                    # sub-frame timing: the typewriter's 22 ms cadence survives (frame time + vt fraction)
                    frac = 0.0
                    if 'vt' in e and c['speed'] == 1:
                        frac = (e['vt'] * 60 - round(e['vt'] * 60)) / 60
                    voice_calls.append({'t': tf / 60 + max(0.0, frac), 'who': ln['who'], 'i': e['i'], 'line': ln['text'],
                                        'line_id': line_id, 'frame': tf, 'clip': c['id']})

    # ── 2. thinning (engine anti-spam always; density rules in sped-up clips) ──
    raw.sort(key=lambda r: (r['frame'], -PRIORITY.get(r['name'], 5)))
    kept = []
    last_by_name = {}
    for r in sorted(raw, key=lambda r: (-PRIORITY.get(r['name'], 5), r['frame'])):
        s = r['speed']
        t = r['frame'] / 60
        reason = None
        if s >= 2 and PRIORITY.get(r['name'], 5) <= 2:
            reason = f'ui sound at {s:.1f}x'
        else:
            gap = 0.03 if s <= 1.05 else 0.09 * (1 + math.log2(s))
            near = [k for k in kept if k['name'] == r['name'] and abs(k['frame'] / 60 - t) < gap]
            if near:
                reason = f'same-name within {gap * 1000:.0f} ms at {s:.1f}x'
            elif s > 1.05:
                cap = 3 if s < 2 else 2 if s < 4 else 1
                dense = [k for k in kept if abs(k['frame'] / 60 - t) < 0.125 and k['speed'] > 1.05]
                if len(dense) >= cap:
                    reason = f'density cap {cap}/250 ms at {s:.1f}x'
        if reason:
            thinned.append({**{k: r[k] for k in ('clip', 'name', 'src_frame', 'frame', 'speed')}, 'reason': reason})
        else:
            kept.append(r)
    kept.sort(key=lambda r: r['frame'])

    # ── 3. place game SFX ──
    feat_all = P['featured_all_game']
    for r in kept:
        featured = r['name'] in FEATURED or (feat_all and PRIORITY.get(r['name'], 5) >= 3)
        if r['type'] == 'botNote':
            x, src = lib.bot(int(r['bot'] or 0), int(r['result'] or 0), featured)
        elif r['type'] == 'syndromeChord':
            x, src = lib.chord(r['bits'] or [], featured)
        else:
            x, src = lib.sfx(r['name'], featured)
        if x is None:
            thinned.append({**{k: r[k] for k in ('clip', 'name', 'src_frame', 'frame', 'speed')}, 'reason': 'no sample'})
            continue
        o = r['opts'] or {}
        if o.get('pitch') and abs(o['pitch'] - 1) > 0.005:
            x = dsp.pitch_resample(x, max(0.25, min(4, o['pitch'])))
        g = P['sfx_gain_db'] + r['clip_gain_db'] + dsp.db(max(0.0, min(2.0, o.get('volume', 1.0))) or 1e-6)
        if r['speed'] > 1.05 and not featured:
            g -= 1.5 * math.log2(r['speed'])
        if o.get('pan'):
            p = max(-1, min(1, o['pan']))
            x = x * np.array([math.cos((p + 1) * math.pi / 4), math.sin((p + 1) * math.pi / 4)]) * math.sqrt(2)
        cues.append({'id': f'g{next(IDS):03d}', 'kind': 'game', 'name': r['name'], 'src': src, 'stem': 'sfx', 'frame': r['frame'],
                     'start': r['frame'] * SPF, 'x': x, 'gain_db': g, 'featured': featured, 'clip': r['clip'],
                     'src_frame': r['src_frame'], 'speed': round(r['speed'], 3)})

    # ── 4. designed layers ──
    groups_in_edl = set()
    design_cues = []
    for c in edl['clips']:
        for q in c.get('cues', []):
            nm = q.get('name', '')
            groups_in_edl.add(nm if nm in ALIASES else GROUP_OF.get(nm, nm))
            design_cues.append({'asset': ALIASES.get(nm, nm), 'frame': q.get('frame'), 'featured': q.get('featured'),
                                'gain_db': q.get('gain_db', 0.0), 'stem': q.get('stem'), 'src': f'edl:{c["id"]}', 'group': nm,
                                'until': q.get('until')})
    # transitions → sweeteners (unless the EDL already carries a cue for them)
    for cut in E.cut_list(edl):
        if cut['type'] == 'shatter' and 'shatter' not in groups_in_edl:
            hit = next((q['frame'] for q in design_cues if q.get('group') == 'peek_collapse_impact' and q.get('frame') is not None
                        and abs(q['frame'] - cut['range'][0]) <= 30), cut['range'][0])
            design_cues.append({'asset': 'shatter_shards', 'frame': hit + 3, 'featured': False, 'gain_db': -10.0,
                                'src': 'auto:shatter', 'group': 'shatter'})
            groups_in_edl.add('shatter')
        if cut['type'] == 'glitch' and 'glitch_tear' not in groups_in_edl:
            design_cues.append({'asset': 'glitch_tear', 'frame': cut['range'][0], 'featured': True, 'src': 'auto:glitch',
                                'group': 'glitch_tear'})
    music_path_pre = args.music or (edl.get('audio', {}) or {}).get('music') or next(
        (p for p in ({'trailer': ['videos/music/trailer_edit.wav', 'videos/audio2/score_alt/score_alt.wav']}.get(video) or
                     [f'videos/audio2/beds/{video}_bed.wav']) if rel(p).exists()), '')
    lists = []
    if P['design'] and not args.no_design:
        lists.append(P['design'])
    lists += [rel(p) for p in (args.cues or [])]
    lists += [rel(p) for p in (edl.get('audio', {}) or {}).get('cue_lists', [])]
    game_names = defaultdict(list)
    for cc in cues:
        game_names[cc['name']].append(cc['frame'])
    for lp in lists:
        for q in json.loads(Path(lp).read_text())['cues']:
            if q.get('group') and q['group'] in groups_in_edl:
                continue
            if q.get('only_with') and q['only_with'] not in str(music_path_pre):
                continue
            f = resolve_anchor(q['at'], cs, bpm) if 'frame' not in q else q['frame']
            if f is None:
                continue
            if q.get('dedupe_game') and any(abs(g - f) <= 30 for g in game_names.get(q['dedupe_game'], [])):
                continue
            if q.get('suppress_game'):  # the designed version replaces the in-game sound at that moment
                for c in [c for c in cues if c['kind'] == 'game' and c['name'] == q['suppress_game'] and abs(c['frame'] - f) <= 30]:
                    cues.remove(c)
                    thinned.append({'clip': c['clip'], 'name': c['name'], 'src_frame': c['src_frame'], 'frame': c['frame'],
                                    'speed': c['speed'], 'reason': f"replaced by {q['asset']}"})
            design_cues.append({**q, 'frame': f, 'src': f'list:{Path(lp).name}',
                                'until_f': resolve_anchor(q['until'], cs, bpm) if q.get('until') else None})
    gates = []
    for q in design_cues:
        if q.get('frame') is None:
            continue
        if q['asset'].startswith('zone:'):  # zone:sfx_gain → gain on every game SFX cue inside [frame, until)
            end = q.get('until_f') or q['frame']
            for c in cues:
                if c['kind'] == 'game' and q['frame'] <= c['frame'] < end:
                    c['gain_db'] += float(q.get('gain_db', 0))
                    c['zone_db'] = c.get('zone_db', 0) + float(q.get('gain_db', 0))
                    if q.get('floor_lufs') is not None:
                        c['floor_lufs'] = float(q['floor_lufs'])
            continue
        if q['asset'].startswith('gate:'):
            end = q.get('until_f')
            if end is None and isinstance(q.get('until'), (int, float)):
                end = int(q['until'])
            gates.append((q['frame'], end if end else q['frame'] + int(round(2 * 3600 / bpm)), q.get('src')))
            continue
        x, meta = lib.asset(q['asset'])
        if x is None:
            print('  ! unknown design asset', q['asset'])
            continue
        sup = q.get('suppress_game') or meta.get('suppress_game') or []
        for nm in ([sup] if isinstance(sup, str) else sup):  # the designed sound replaces the in-game one(s) here
            for c in [c for c in cues if c['kind'] == 'game' and c['name'] == nm and abs(c['frame'] - q['frame']) <= 30]:
                cues.remove(c)
                thinned.append({'clip': c['clip'], 'name': c['name'], 'src_frame': c['src_frame'], 'frame': c['frame'],
                                'speed': c['speed'], 'reason': f"replaced by {q['asset']}"})
        hit = float(meta.get('hit_s', 0.0)) if q.get('align', 'hit') != 'start' else 0.0
        start = int(round(q['frame'] * SPF - hit * SR))
        until = q.get('until_f')
        if until is not None:
            need = until * SPF - start
            if need <= 0:
                continue
            if meta.get('loop') and need > len(x):
                x = np.tile(x, (int(np.ceil(need / len(x))), 1))
            x = dsp.fade(x[:need], 0.0, min(0.25, need / SR / 4))
        featured = bool(q['featured'] if q.get('featured') is not None else meta.get('featured', False))
        stem = q.get('stem') or ('sfx' if meta.get('kind') == 'sfx' else 'design')
        cues.append({'id': f'd{next(IDS):03d}', 'kind': 'design', 'name': q['asset'], 'src': q.get('src'), 'stem': stem,
                     'frame': q['frame'], 'start': start, 'x': x,
                     'gain_db': float(q.get('gain_db', 0.0) or 0.0) + float(meta.get('mix_gain_db', 0.0)) + (P['sfx_gain_db'] if stem == 'sfx' else 0),
                     'featured': featured, 'clip': None, 'src_frame': None, 'speed': 1.0,
                     'music_zero_start': bool(q.get('music_zero_start'))})

    # ── 5. music bed ──
    music_path = args.music or (edl.get('audio', {}) or {}).get('music')
    if not music_path:
        for p in ({'trailer': ['videos/music/trailer_edit.wav', 'videos/audio2/score_alt/score_alt.wav']}.get(video) or
                  [f'videos/audio2/beds/{video}_bed.wav']):
            if rel(p).exists():
                music_path = p
                break
    music_info = {'path': str(music_path), 'offset_frames': args.music_offset_frames}
    if music_path and rel(music_path).exists():
        m = load_audio(rel(music_path))
        m = m * dsp.undb(P['music_lufs'] - dsp.integrated(m))
        dsp.place(stems['music'], m, args.music_offset_frames * SPF)
        music_info['lufs_in'] = round(dsp.integrated(load_audio(rel(music_path))), 2)
    for q in cues:
        if q.get('music_zero_start'):
            mabs = np.max(np.abs(stems['music']), axis=1)
            f = q['frame']
            while f > 0 and np.max(mabs[(f - 1) * SPF:f * SPF]) < dsp.undb(-80):
                f -= 1
            if f < q['frame']:
                src, _ = lib.asset(q['name'])
                need = q['start'] + len(q['x']) - f * SPF
                xx = np.tile(src, (int(np.ceil(need / len(src))) + 1, 1))[:need]
                q['x'] = dsp.fade(xx, 0.02, min(0.25, need / SR / 4))
                q['moved_from_frame'] = q['frame']
                q['start'] = f * SPF
                q['frame'] = f
    for a, b, _ in gates:
        g = np.ones(N)
        i0, i1 = a * SPF, b * SPF
        r = int(0.02 * SR)
        g[i0:i1] = 0
        g[max(0, i0 - r):i0] = np.linspace(1, 0, min(r, i0))
        g[i1:i1 + r] = np.linspace(0, 1, len(g[i1:i1 + r]))
        stems['music'] *= g[:, None]

    # ── 6. voices ──
    voice_stem, voice_src = render_voice_stem(voice_calls, N, not args.no_engine) if voice_calls else (np.zeros((N, 2)), 'none')
    stems['voices'] += voice_stem * dsp.undb(P['voice_gain_db'])
    vlines = defaultdict(list)
    for vc in voice_calls:
        vlines[vc['line_id']].append(vc)
    voice_cues = []
    for lid, vs in vlines.items():
        t0, t1 = min(v['t'] for v in vs), max(v['t'] for v in vs) + 0.12
        voice_cues.append({'id': f'v{lid:03d}', 'kind': 'voice', 'name': vs[0]['who'], 'text': vs[0]['line'][:60], 'stem': 'voices',
                           'frame': vs[0]['frame'], 'start': int(t0 * SR), 'end_s': t1, 'featured': True, 'clip': vs[0]['clip']})

    # ── 7. place cues (each cue also kept alone for its own measurement) ──
    # peak-to-loudness control: featured cues are limited to PLR <= plr_db (peak vs max momentary loudness),
    # so they can sit >= 6 LU over the music without the master limiter crushing their transients
    plr_cache = {}
    for q in cues:
        if not q['featured'] or len(q['x']) < 64:
            continue
        key = (q['src'], len(q['x']), float(np.sum(np.abs(q['x'][:2000]))))
        if key not in plr_cache:
            x = q['x']
            m = float(np.max(dsp.momentary(dsp.fit(x, max(len(x), int(0.4 * SR))), 0.01)))
            ceil = m + P['plr_db']
            pk = dsp.true_peak_db(x)
            plr_cache[key] = (dsp.limiter(x, ceil, 0.002, 0.04) if pk > ceil else x, round(pk - ceil, 2) if pk > ceil else 0.0)
        q['x'], q['plr_cut_db'] = plr_cache[key]
    # ── 6b. level floors (zone floor_lufs) and the bots' QUIET answer (Critic, sound milestone #7) ──
    def mmax(q):
        return float(np.max(dsp.momentary(dsp.fit(q['x'], max(len(q['x']), int(0.4 * SR))), 0.01))) + q['gain_db']
    for q in cues:
        if q.get('floor_lufs') is not None and q['featured'] and '_quiet' not in str(q['src']):
            lift = q['floor_lufs'] + 0.5 - mmax(q)
            if lift > 0:
                q['gain_db'] += lift
                q['floor_lift_db'] = round(lift, 2)
    if P.get('quiet_target_lufs') is not None:
        beeps = [q for q in cues if q['kind'] == 'game' and (q['name'] == 'listen_beep' or (q['name'] == 'botNote' and '_beep' in str(q['src'])))]
        for q in cues:
            if q['kind'] == 'game' and q['name'] == 'botNote' and '_quiet' in str(q['src']):
                near = [b for b in beeps if abs(b['frame'] - q['frame']) <= 240]
                tgt = P['quiet_target_lufs']
                q['gain_db'] += tgt - mmax(q)
                q['quiet_target'] = round(tgt, 2)
                # "one beeps, one stays quiet": the answering BEEP stays >= 4 LU (+0.5 safety) above the quiet
                for b in near:
                    lift = (tgt + 4.5) - mmax(b)
                    if lift > 0:
                        b['gain_db'] += lift

    for q in cues:
        q['gain'] = dsp.undb(q['gain_db'])
        dsp.place(stems[q['stem']], q['x'], q['start'], q['gain'])
        q['body_s'] = body_end(q['x'], 0)

    # ── 8. ducking solve ──
    n_ctrl = N * CR // SR + 1
    music_raw = stems['music'].copy()
    band = dsp.bandpass(music_raw, 2000, 5000, 2, zp=True)
    rest = music_raw - band
    feat = [q for q in cues if q['featured']] + voice_cues
    for q in feat:
        q['duck_db'] = 0.0      # broadband fallback (only if the band dip alone cannot reach the margin)
        q['band_db'] = 6.0      # 2-5 kHz dynamic-EQ dip (Critic: -6 dB under every featured SFX), up to 12
        q['boost_db'] = 0.0
    # non-featured SFX and voices get a lighter 3 dB band dip; no broadband ducking at all by default
    light = [(q['start'] / SR, q['start'] / SR + q['body_s'], 3.0) for q in cues if not q['featured'] and q['stem'] == 'sfx']
    light += [(v['start'] / SR, v['end_s'], 3.0) for v in voice_cues if not v['featured']]
    target = args.margin + 1.0
    alone_cache = {}

    def cue_alone(q):
        if q['kind'] == 'voice':
            a, b = q['start'], int(q['end_s'] * SR) + int(0.4 * SR)
            y = np.zeros_like(stems['voices'])
            y[a:b] = stems['voices'][a:b]
            return y
        if q['id'] not in alone_cache:
            y = np.zeros((N, 2))
            dsp.place(y, q['x'], q['start'], 1.0)
            alone_cache[q['id']] = y
        return alone_cache[q['id']] * dsp.undb(q['gain_db'] + q['boost_db'])

    def span(q):
        t0 = q['start'] / SR
        return t0, (q['end_s'] if q['kind'] == 'voice' else t0 + q['body_s'])

    def measure(q, music):
        t0, t1 = span(q)
        ca = cue_alone(q)
        cm, base = momentary_at(ca, t0 - 0.2, t1)
        mm, _ = momentary_at(music, t0 - 0.2, t1)
        n = min(len(cm), len(mm))
        k = int(np.argmax(cm[:n]))
        # the same window, 2-5 kHz only (where BEEP / BOOP / HIGHFIVE live): plain band energy, dB
        w0 = int((base + k * 0.01) * SR)
        w1 = w0 + int(0.4 * SR)
        cb = dsp.bandpass(ca[w0:w1], 2000, 5000, 2)
        mb = dsp.bandpass(music[w0:w1], 2000, 5000, 2)
        bm = 10 * np.log10((np.mean(cb ** 2) + 1e-12) / (np.mean(mb ** 2) + 1e-12))
        return float(cm[k]), float(mm[k]), base + k * 0.01, float(bm)

    music_d = music_raw
    for it in range(8):
        bdips = light + [(*span(q), q['band_db']) for q in feat]
        band_env = ctrl_to_samples(dip_envelope(bdips, n_ctrl), N)
        env = ctrl_to_samples(dip_envelope([(*span(q), q['duck_db']) for q in feat], n_ctrl), N)
        music_d = (rest + band * dsp.undb(-band_env)[:, None]) * dsp.undb(-env)[:, None]
        worst = 99
        for q in feat:
            c, m, tk, bm = measure(q, music_d)
            q['cue_lufs_m'], q['music_lufs_m'], q['t_meas'], q['band_margin_db'] = c, m, tk, bm
            q['margin_lu'] = c - max(m, -70.0)  # silent music → measured against the -70 LUFS floor
            short = target - q['margin_lu']
            worst = min(worst, q['margin_lu'])
            if short > 0.05:
                if q['band_db'] < 12.0:
                    q['band_db'] = min(12.0, q['band_db'] + max(2.0, 2 * short))
                elif q['duck_db'] < P['max_duck']:
                    q['duck_db'] = min(P['max_duck'], q['duck_db'] + short + 0.3)
                else:
                    q['boost_db'] = min(6.0, q['boost_db'] + short + 0.3)
        if worst >= target - 0.05:
            break
    stems['music'] = music_d
    # re-place boosted cues
    for q in cues:
        if q.get('boost_db'):
            dsp.place(stems[q['stem']], q['x'], q['start'], dsp.undb(q['gain_db'] + q['boost_db']) - q['gain'])

    # ── 9. master ──
    n_out = dur_f * SPF
    mix = sum(stems.values())[:n_out]
    for k in stems:
        stems[k] = stems[k][:n_out]
    g_db = args.target - dsp.integrated(mix)
    out = None
    for _ in range(4):
        out = dsp.limiter(mix * dsp.undb(g_db), args.tp - 0.2)
        L = dsp.integrated(out)
        if abs(L - args.target) < 0.15:
            break
        g_db += args.target - L
    out = dsp.fade(out, 0.0, 0.05)
    master_gain = dsp.undb(g_db)
    music_bed = music_raw[:n_out] * dsp.undb(g_db)
    return dict(music_bed=music_bed, edl=edl, P=P, cs=cs, bpm=bpm, stems=stems, mix=out, master_gain_db=g_db, cues=cues, voice_cues=voice_cues,
                thinned=thinned, offscreen=offscreen, gates=gates, music_info=music_info, voice_src=voice_src, video=video,
                master_gain=master_gain, target=target)


def write(res, args):
    edl = res['edl']
    au = edl.get('audio', {}) or {}
    outdir = rel(args.out) if args.out else (rel(au['mix']).parent if au.get('mix') else ROOT / f'videos/audio2/mix/{res["video"]}')
    outdir.mkdir(parents=True, exist_ok=True)
    mix_path = outdir / 'mix.wav'
    dsp.write_wav(mix_path, res['mix'])
    g = res['master_gain']
    stem_dir = outdir / 'stems'
    for k, v in res['stems'].items():
        y = v * g
        dsp.write_wav(stem_dir / f'{k}.wav', y, bits=24 if np.max(np.abs(y)) < 0.999 else 32)
    fl = dsp.ffmpeg_ebur128(mix_path)
    rows = []
    allc = res['cues'] + res['voice_cues']
    for q in sorted(allc, key=lambda q: q['frame']):
        row = {'id': q['id'], 'kind': q['kind'], 'name': q['name'], 'stem': q['stem'], 'frame': q['frame'],
               't_s': round(q['frame'] / 60, 3), 'sample': q['start'], 'featured': q['featured'], 'source': q.get('src'),
               'clip': q.get('clip'), 'src_frame': q.get('src_frame'), 'speed': q.get('speed')}
        if q['kind'] == 'voice':
            row['text'] = q.get('text')
        else:
            row['gain_db'] = round(q['gain_db'] + q.get('boost_db', 0.0), 2)
        if q['featured']:
            row.update({'band_dip_db': round(q.get('band_db', 0.0), 2), 'fallback_broadband_db': round(q.get('duck_db', 0.0), 2),
                        'boost_db': round(q.get('boost_db', 0.0), 2), 'band_margin_db': round(q.get('band_margin_db', 0.0), 2),
                        'cue_lufs_m': round(q.get('cue_lufs_m', -99), 2), 'music_lufs_m': round(max(-70.0, q.get('music_lufs_m', -99)), 2),
                        'margin_lu': round(q.get('margin_lu', -99), 2),
                        'cue_lufs_m_post_master': round(q.get('cue_lufs_m', -99) + res['master_gain_db'], 2),
                        'pass': bool(q.get('margin_lu', -99) >= args.margin and q.get('cue_lufs_m', -99) > -40)})
        rows.append(row)
    feat = [r for r in rows if r['featured']]
    # Critic's loudness-curve gate (music bed as delivered to the mix, the ducked music stem, the full mix)
    curve = {}
    proof = {}
    try:
        import sheet
        pl = sheet.plan(rel(res['cs']['path'])) if res['cs'] else None
        if pl and all(pl['t'].get(k) is not None for k in ('build', 'silence', 'drop', 'proof', 'montage', 'payoff', 'closing')):
            curve = {'bed': sheet.energy_checks(res['music_bed'], pl), 'music_stem_ducked': sheet.energy_checks(res['stems']['music'] * g, pl),
                     'full_mix': sheet.energy_checks(res['mix'], pl)}
            # Critic (sound milestone #7): every featured cue in the proof >= -16 LUFS-M (report convention:
            # cue_lufs_m), and the QUIET answer audible but >= 4 LU under the BEEP
            a, b = pl['t']['proof'], pl['t']['montage']
            pc = [r for r in rows if r['featured'] and a * 60 <= r['frame'] < b * 60]
            quiet = [r for r in pc if '_quiet' in str(r.get('source'))]
            beep = [r for r in pc if '_beep' in str(r.get('source')) or r['name'] == 'listen_beep']
            proof = {'window_frames': [round(a * 60), round(b * 60)], 'rule': 'each featured cue >= -16 LUFS-M; quiet >= 4 LU under the beep',
                     'cues': [(r['frame'], r['name'], r['cue_lufs_m']) for r in pc],
                     'min_cue_lufs_m': min((r['cue_lufs_m'] for r in pc), default=None),
                     'quiet_lufs_m': [r['cue_lufs_m'] for r in quiet], 'beep_lufs_m': [r['cue_lufs_m'] for r in beep]}
            ok = all(r['cue_lufs_m'] >= -16.0 - 0.05 for r in pc)
            if quiet and beep:
                ok = ok and max(r['cue_lufs_m'] for r in quiet) <= max(r['cue_lufs_m'] for r in beep) - 4.0 + 0.05
            proof['pass'] = bool(ok)
    except Exception as ex:  # never let the report block the mix
        curve = {'error': str(ex)}
    rep = {
        'loudness_curve': curve, 'proof_energy': proof,
        'edl': str(args.edl) if not isinstance(args.edl, dict) else '(in-memory)', 'video': res['video'],
        'preset': args.preset or res['video'], 'cue_sheet': (res['cs'] or {}).get('path'), 'bpm': res['bpm'],
        'music': res['music_info'], 'voices_rendered_by': res['voice_src'],
        'duration_frames': edl['duration'], 'duration_s': round(edl['duration'] / 60, 3),
        'loudness': {**dsp.loudness_report(res['mix']), 'ffmpeg_ebur128': fl,
                     'target_lufs': args.target, 'tp_ceiling_dbtp': args.tp,
                     'pass_integrated': abs(fl['I'] - args.target) <= 0.5 if fl['I'] is not None else None,
                     'pass_true_peak': (fl['TP'] is not None and fl['TP'] <= args.tp)},
        'master_gain_db': round(res['master_gain_db'], 2),
        'rule': f'each featured cue: max momentary loudness (400 ms) >= {args.margin} LU above the music in the same window',
        'summary': {'cues': len(rows), 'featured': len(feat), 'featured_pass': sum(r['pass'] for r in feat),
                    'featured_fail': [r['id'] + ':' + r['name'] for r in feat if not r['pass']],
                    'min_margin_lu': round(min([r['margin_lu'] for r in feat] or [99]), 2),
                    'thinned': len(res['thinned']), 'offscreen_events': len(res['offscreen']), 'music_gates': res['gates']},
        'cues': rows, 'thinned': res['thinned'], 'offscreen': res['offscreen'][:200],
        'stems': {k: relp(stem_dir / f'{k}.wav') for k in res['stems']},
        'mix': relp(mix_path),
    }
    rp = rel(au['mixreport']) if (au.get('mixreport') and not args.out) else outdir / 'mixreport.json'
    dsp.save_json(rp, rep)
    dsp.save_json(outdir / 'cues.json', [{k: r[k] for k in ('id', 'name', 'frame', 'kind', 'clip', 'src_frame')} for r in rows])
    marks = [(r['t_s'], r['name'][:18]) for r in rows if r['featured']][:80]
    dsp.spectrogram_png(res['mix'], outdir / 'mix.png', f'{res["video"]} mix  I={fl["I"]} LUFS  TP={fl["TP"]} dBTP', marks=marks)
    return rep, rp


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument('edl')
    ap.add_argument('--preset', choices=list(PRESETS))
    ap.add_argument('--music')
    ap.add_argument('--music-offset-frames', type=int, default=0)
    ap.add_argument('--cue-sheet')
    ap.add_argument('--cues', nargs='*')
    ap.add_argument('--no-design', action='store_true')
    ap.add_argument('--no-engine', action='store_true')
    ap.add_argument('--out')
    ap.add_argument('--target', type=float, default=-14.0)
    ap.add_argument('--tp', type=float, default=-1.0)
    ap.add_argument('--margin', type=float, default=6.0)
    args = ap.parse_args(argv)
    res = build(args)
    rep, rp = write(res, args)
    s = rep['summary']
    L = rep['loudness']
    print(f"mix: {rep['mix']}  I={L['ffmpeg_ebur128']['I']} LUFS  TP={L['ffmpeg_ebur128']['TP']} dBTP (own: {L['integrated_lufs']}/{L['true_peak_dbtp']})")
    print(f"cues {s['cues']}  featured {s['featured_pass']}/{s['featured']} pass  min margin {s['min_margin_lu']} LU  thinned {s['thinned']}")
    if s['featured_fail']:
        print('  FAIL:', s['featured_fail'])
    print('report:', rp.relative_to(ROOT) if rp.is_relative_to(ROOT) else rp)
    return rep


if __name__ == '__main__':
    main()
