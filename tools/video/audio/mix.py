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
import re
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
    'trailer': dict(music_first=True, card_accents=True, score=HERE / 'cues/trailer_score.json', music_lufs=-20.0, max_duck=12.0, weight='trailer', voices=False, sfx_gain_db=4.0, voice_gain_db=-6,
                    design=HERE / 'cues/trailer_design.json', bg_duck=3.0, featured_all_game=True, plr_db=10.0, quiet_target_lufs=-16.0, arc_cap_lufs=-11.5),
    'mechanic': dict(music_first=True, explainer=True, card_accents=True, target_lufs=-16.0, bar_grid=(0.08, 4 * 60 / 84),
                     score=HERE / 'cues/mechanic_score.json', bed='videos/audio2/beds/mechanic_bed.wav', window={'hit': (3.0, 6.0, 4.5), 'proof': (3.0, 6.0, 4.5), 'pre': (3.0, 6.0, 4.5), 'pocket': (3.0, 6.0, 4.5),
                             'cohit': (3.0, 6.0, 4.5), 'cohit_song': (3.0, 6.0, 4.5), 'phrase': (0.0, 3.0, 1.5),
                             'accent': (-2.0, 6.0, 3.0), 'under': -8.0, 'silent_abs': -27.0, 'quiet_below_beep': 4.5},
                     music_lufs=-27.0, max_duck=12.0, weight='game', voices=True, sfx_gain_db=0.0, voice_gain_db=-2.0,
                     design=None, bg_duck=2.0, featured_all_game=False, plr_db=14.0),
    'showcase': dict(music_first=True, explainer=True, card_accents=True, target_lufs=-16.0, bar_grid=(0.08, 4 * 60 / 84),
                     score=HERE / 'cues/showcase_score.json', bed='videos/audio2/beds/showcase_bed.wav', window={'hit': (3.0, 6.0, 4.5), 'proof': (3.0, 6.0, 4.5), 'pre': (3.0, 6.0, 4.5), 'pocket': (3.0, 6.0, 4.5),
                             'cohit': (3.0, 6.0, 4.5), 'cohit_song': (3.0, 6.0, 4.5), 'phrase': (0.0, 3.0, 1.5),
                             'accent': (-2.0, 6.0, 3.0), 'under': -8.0, 'silent_abs': -27.0, 'quiet_below_beep': 4.5},
                     music_lufs=-25.0, max_duck=12.0, weight='game', voices=True, sfx_gain_db=0.0, voice_gain_db=-3.0,
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
BOT_MIDI = dict(zip('abcdefgh', (53, 84, 67, 77, 60, 81, 62, 86)))  # src/audio/bots.ts BOT_VOICES base notes
LOW_NOTE_MIDI = 59  # below ~B3 (247 Hz) a phone speaker can't reproduce the note: add a presence layer
MUST_READ = {'snap_measure'}  # explainer: the measurement snap (step mode) must read: trailer-weight snap + dip
MUST_READ_DESIGN = {'sig_c_snap'}  # explainer: the closing snap
LOW_HEAVY = {'highfive'}  # featured hits whose body sits low (slap + 220→120 Hz blip): presence + density for phones
HIGHFIVE_ROOM = dsp.make_ir(0.25, 14.0, 0.004, 6500, seed=9, width=0.5)
ACCENTS = {'card_pick', 'card_drop', 'ui_click'}  # card UI = rhythmic accents in programming shots (REVISED 2)
PROG_RE = r'(^pg_|_pg_|program|editor|card_?guide|bot_?code|test_?strip|qol|snippet|step_?mode|timeline|export|qiskit|text_?view|drag|split|tr_proof|decoder)'


def is_programming(clip) -> bool:
    """A clip that shows the program: explicit flag, audio.programming, section 'proof', or the shot name."""
    import re
    au = clip.get('audio') or {}
    if 'programming' in clip or 'programming' in au:
        return bool(clip.get('programming', au.get('programming')))
    if clip.get('section') == 'proof':
        return True
    return bool(re.search(PROG_RE, str(clip.get('shot', '')).lower()))


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


def explainer_sheet(edl, grid):
    """A cue-sheet-shaped dict for videos without one: sections = runs of clip `section`, downbeats = the game
    bed's bar grid (first downbeat grid[0] s, bar grid[1] s), named hits = section starts."""
    secs, order = {}, []
    for c in edl['clips']:
        nm = c.get('section') or 'body'
        if nm not in secs:
            secs[nm] = [c['start'], c['end']]
            order.append(nm)
        else:
            secs[nm][1] = max(secs[nm][1], c['end'])
    for a, b in zip(order, order[1:]):  # sections abut (overlapping transitions belong to the incoming section)
        secs[a][1] = secs[b][0]
    b0, bar = grid
    downs = [int(round((b0 + k * bar) * 60)) for k in range(int(edl['duration'] / 60 / bar) + 2)]
    raw = {'fps': 60, 'bpm': 84, 'meter': '4/4', 'duration_frames': edl['duration'],
           'sections': [{'name': n, 'start_frame': secs[n][0], 'end_frame': secs[n][1]} for n in order],
           'named_hits': {f'{n}_start': secs[n][0] for n in order}, 'downbeat_frames': downs,
           'beats': [{'frame': round(b0 * 60, 3)}]}  # beat0 on the game bed's grid (analyze_mix reads beats[0])
    return {'bpm': 84, 'beats': [], 'downbeats': downs, 'sections': {n: tuple(secs[n]) for n in order}, 'hits': [],
            'hits_f': dict(raw['named_hits']), 'raw': raw, 'path': None, 'synthetic': True}


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
        if self.weight == 'trailer' and (LIB / f'trailer/{name}.wav').exists():
            return load_audio(LIB / f'trailer/{name}.wav'), {'hit_s': 0.0, 'kind': 'sfx', 'featured': True}
        p = LIB / f'game/{name}__v1.wav'
        if p.exists():
            return load_audio(p), {'hit_s': 0.0, 'kind': 'sfx', 'featured': name in FEATURED}
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
    if cs is None and P.get('bar_grid'):  # explainers: sections from the EDL clips, bars from the game bed's grid
        cs = explainer_sheet(edl, P['bar_grid'])
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
            accent = bool(P.get('card_accents') and name in ACCENTS and is_programming(c))
            raw.append({'accent': accent, 'clip': c['id'], 'shot': c.get('shot'), 'type': e['type'], 'name': name, 'src_frame': f, 'frame': tf,
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
        if s >= 2 and PRIORITY.get(r['name'], 5) <= 2 and not r.get('accent'):
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
    grid8 = []
    if cs:
        b0 = int(cs['raw'].get('grid', {}).get('beat0_frame', cs['beats'][0] if cs['beats'] else 0))
        bf = cs['raw'].get('beat_frames') or (cs['beats'][1] - cs['beats'][0] if len(cs['beats']) > 1 else 32)
        grid8 = [b0 + k * bf / 2 for k in range(int((dur_f - b0) / (bf / 2)) + 2)]
        grid8 = [int(round(g8)) for g8 in grid8]
    feat_all = P['featured_all_game']
    for r in kept:
        featured = r['name'] in FEATURED or (feat_all and PRIORITY.get(r['name'], 5) >= 3) or r.get('accent', False)
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
        frame, qfrom = r['frame'], None
        if r.get('accent') and grid8:
            near8 = min(grid8, key=lambda g8: abs(g8 - frame))
            if 0 < abs(near8 - frame) <= 2:  # quantise to the nearest 8th when within 2 frames
                qfrom, frame = frame, near8
        cues.append({'id': f'g{next(IDS):03d}', 'kind': 'game', 'name': r['name'], 'src': src, 'stem': 'sfx', 'frame': frame,
                     'start': frame * SPF, 'accent': r.get('accent', False), 'quantised_from': qfrom, 'x': x, 'gain_db': g, 'featured': featured, 'clip': r['clip'],
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
    if P.get('explainer') and 'win_card' not in groups_in_edl:
        # win-card strobes (clip note '... strobe ... solved'): the cut shows a solved level for one bed beat with no
        # game event in its window; each flash gets the trailer-weight test_pass hit on its first frame (on the beat)
        for c in edl['clips']:
            if re.search(r'strobe.*solved', str(c.get('note', '')), re.I):
                design_cues.append({'asset': 'trailer/test_pass', 'frame': c['start'], 'featured': True,
                                    'src': f'auto:win_card {c["id"]}', 'group': 'win_card'})
    music_path_pre = args.music or (edl.get('audio', {}) or {}).get('music') or next(
        (p for p in ({'trailer': ['videos/music/trailer_edit.wav', 'videos/audio2/score_alt/score_alt.wav']}.get(video) or
                     [P.get('bed') or f'videos/audio2/beds/{video}_bed.wav']) if rel(p).exists()), '')
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
    zones = []
    for q in design_cues:
        if q.get('frame') is None:
            continue
        if q['asset'].startswith('zone:'):  # applied after every design cue exists (see below)
            zones.append(q)
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
        win = int(meta.get('suppress_window_f', 30))  # forward window (frames) the designed sound covers
        for nm in ([sup] if isinstance(sup, str) else sup):  # the designed sound replaces the in-game one(s) here
            for c in [c for c in cues if c['kind'] == 'game' and c['name'] == nm and -30 <= c['frame'] - q['frame'] <= max(30, win)]:
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
                     'featured': featured, 'clip': None, 'src_frame': None, 'speed': 1.0, 'bed': meta.get('kind') == 'bed',
                     'riser': meta.get('kind') == 'riser',
                     'mix_max_s': meta.get('mix_max_s'), **({'under_db': float(q['under_db'])} if q.get('under_db') is not None else {}),
                     'music_zero_start': bool(q.get('music_zero_start'))})

    # zones: zone:sfx_gain (gain [+ floor] on cues of `kinds` inside [frame, until)), zone:no_duck (no music dips)
    no_duck = []
    for z in zones:
        end = z.get('until_f') or z['frame']
        if z['asset'] == 'zone:no_duck':
            no_duck.append((z['frame'], end))
            continue
        kinds = z.get('kinds', ['game'])
        for c in cues:
            if c['kind'] in kinds and z['frame'] <= c['frame'] < end and not str(c['name']).startswith(('room_tone', 'night_amb')):
                c['gain_db'] += float(z.get('gain_db', 0))
                c['zone_db'] = c.get('zone_db', 0) + float(z.get('gain_db', 0))
                if z.get('floor_lufs') is not None:
                    c['floor_lufs'] = float(z['floor_lufs'])
    for c in cues:
        if any(a <= c['frame'] < b for a, b in no_duck):
            c['no_duck'] = True

    # ── 5. music bed ──
    music_path = args.music or (edl.get('audio', {}) or {}).get('music')
    if not music_path:
        for p in ({'trailer': ['videos/music/trailer_edit.wav', 'videos/audio2/score_alt/score_alt.wav']}.get(video) or
                  [P.get('bed') or f'videos/audio2/beds/{video}_bed.wav']):
            if rel(p).exists():
                music_path = p
                break
    music_info = {'path': str(music_path), 'offset_frames': args.music_offset_frames}
    seg_report = []
    if music_path and rel(music_path).exists():
        m = load_audio(rel(music_path))
        bed_gain = dsp.undb(P['music_lufs'] - dsp.integrated(m))  # one gain for every score source (all ~-16 LUFS)
        base = np.zeros((N, 2))
        dsp.place(base, m * bed_gain, args.music_offset_frames * SPF)
        music_info['lufs_in'] = round(dsp.integrated(load_audio(rel(music_path))), 2)
        plan_path = args.score or (edl.get('audio', {}) or {}).get('score') or P.get('score')
        base_env = np.ones(N)
        layers = np.zeros((N, 2))
        if plan_path and not args.no_score and rel(plan_path).exists():
            plan = json.loads(rel(plan_path).read_text())
            srcs = {k: rel(v) for k, v in plan.get('sources', {}).items()}
            downs = cs['downbeats'] if cs else []
            for sg in plan.get('segments', []):
                if sg.get('only_with') and sg['only_with'] not in str(music_path):
                    continue
                spans = []
                if sg.get('clips') == 'programming':
                    # bar-majority rule: a bar (downbeat → downbeat) carries the groove when >= min_cover of its
                    # frames show programming clips (sub-bar 32/64-frame cuts can't each land on a downbeat)
                    prog = np.zeros(dur_f + 1, bool)
                    for c in edl['clips']:
                        if is_programming(c) and (not sg.get('section') or c.get('section') == sg['section']):
                            prog[c['start']:min(c['end'], dur_f)] = True
                    sec = cs['sections'].get(sg['section']) if (cs and sg.get('section')) else None
                    dl = [d for d in (cs['downbeats'] if cs else []) if (not sec or sec[0] <= d <= sec[1])]
                    if sg.get('within'):  # optional window [from, to] (anchors) restricting the bars
                        w0, w1 = resolve_anchor(sg['within'][0], cs, bpm), resolve_anchor(sg['within'][1], cs, bpm)
                        dl = [d for d in dl if w0 <= d <= w1]
                    run = None
                    for d0, d1 in zip(dl, dl[1:]):
                        cov = float(prog[d0:d1].mean()) if d1 > d0 else 0.0
                        if cov >= sg.get('min_cover', 0.5):
                            if run and run[1] == d0:
                                run[1] = d1
                                run[2].append(round(cov, 2))
                            else:
                                run = [d0, d1, [round(cov, 2)]]
                                spans.append(run)
                        else:
                            run = None
                else:
                    a = resolve_anchor(sg['from'], cs, bpm)
                    b = resolve_anchor(sg['to'], cs, bpm)
                    if a is not None and b is not None:
                        spans.append([a, b])
                xf = int(sg.get('xfade_frames', 6)) * SPF
                src_path = srcs.get(sg['source'], rel(sg['source']))
                if not Path(src_path).exists():
                    print('  ! score source missing', sg['source'])
                    continue
                sx = dsp.fit(load_audio(src_path) * bed_gain * dsp.undb(sg.get('gain_db', 0.0)), N)
                for sp in spans:
                    a, b = sp[0], sp[1]
                    cover = sp[2] if len(sp) > 2 else None
                    sa = min(downs, key=lambda d: abs(d - a)) if downs else a
                    sb = min(downs, key=lambda d: abs(d - b)) if downs else b
                    if sb <= sa:
                        continue
                    i0, i1 = sa * SPF, sb * SPF
                    env = np.zeros(N)
                    env[i0:i1] = 1.0
                    n_in = min(xf, i0)
                    if n_in:  # equal-power fade-in that completes ON the downbeat
                        env[i0 - n_in:i0] = np.sin((np.arange(n_in) + 1) / n_in * np.pi / 2)
                    n_out = len(env[i1:i1 + xf])
                    if n_out:  # fade-out that starts ON the downbeat
                        env[i1:i1 + n_out] = np.cos(np.arange(n_out) / max(xf, 1) * np.pi / 2)
                    layers += sx * env[:, None]
                    if sg.get('mode') == 'replace':
                        base_env = np.minimum(base_env, np.sqrt(np.clip(1 - env ** 2, 0, 1)))
                    elif sg.get('bed_db'):  # layer that makes room: the bed dips under it (keeps the section's energy)
                        base_env = base_env * (1 - env * (1 - dsp.undb(sg['bed_db'])))
                    seg_report.append({'source': sg['source'], 'mode': sg.get('mode', 'layer'), 'gain_db': sg.get('gain_db', 0.0), 'bed_db': sg.get('bed_db', 0.0),
                                       'requested_frames': [a, b], 'frames': [sa, sb], 'on_downbeat': bool(not downs or (sa in downs and sb in downs)),
                                       'snapped': [sa - a, sb - b], 'xfade_frames': int(sg.get('xfade_frames', 6)),
                                       'clips': sg.get('clips'), 'bar_programming_cover': cover, 'plan': relp(rel(plan_path))})
        stems['music'] = base * base_env[:, None] + layers
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

    auto_rep, gcurve = {}, None
    secs_list = sorted(((k, a, b) for k, (a, b) in (cs['sections'].items() if cs else [])), key=lambda r: r[1])
    if P.get('music_first') and cs:
        import mixfirst
        # polish FIRST (fills, compressors, fades), so the automation measures and hits the targets on what plays
        stems['music'] = mixfirst.music_polish(stems['music'], secs_list, explainer=bool(P.get('explainer')))
        tg = mixfirst.explainer_targets(secs_list) if P.get('explainer') else P.get('music_targets', mixfirst.TARGETS)
        stems['music'], gcurve, auto_rep = mixfirst.automate_music(stems['music'], secs_list, cs['downbeats'], tg,
                                                                   ramp_s=1.0 if P.get('explainer') else 0.2)

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
        if not q['featured'] or len(q['x']) < 64 or '+plr9' in str(q['src']):
            continue
        key = (q['src'], len(q['x']), float(np.sum(np.abs(q['x'][:2000]))))
        if key not in plr_cache:
            x = q['x']
            m = float(np.max(dsp.momentary(dsp.fit(x, max(len(x), int(0.4 * SR))), 0.01)))
            ceil = m + P['plr_db'] + (6.0 if q.get('accent') else 0.0)  # accents: short clicks, keep their snap
            pk = dsp.true_peak_db(x)
            plr_cache[key] = (dsp.limiter(x, ceil, 0.002, 0.04) if pk > ceil else x, round(pk - ceil, 2) if pk > ceil else 0.0)
        q['x'], q['plr_cut_db'] = plr_cache[key]
    level_rep = []
    if P.get('music_first'):
        import mixfirst
        for q in cues:  # fade every tail (>= 20 ms): nothing ends on a click
            if len(q['x']) > int(0.05 * SR):
                q['x'] = dsp.fade(q['x'], 0.0, 0.02)
        presence_rep = []
        if P.get('explainer'):  # phones can't reproduce < ~250 Hz: low featured notes get a presence-band layer
            tw_beep = lib.asset('trailer/listen_beep')[0]
            tw_snap = lib.asset('trailer/snap_measure')[0]
            for q in cues:
                if q['kind'] == 'design' and q['name'] in MUST_READ_DESIGN:
                    # the closing snap (designed): the bed takes the same breath and dip as the measurement snap
                    q['music_dip_db'], q['pre_dip_db'] = 8.0, 9.0
                    presence_rep.append({'frame': q['frame'], 'cue': q['name'], 'rule': 'must-read closing snap: 8 dB music dip, 9 dB pre-breath'})
                    continue
                if q['kind'] != 'game' or not q['featured']:
                    continue
                low_bot = q['name'] == 'botNote' and '_beep' in str(q['src']) and BOT_MIDI.get(str(q['src']).split('bot_')[-1][:1], 99) < LOW_NOTE_MIDI
                if low_bot:
                    twins = [c for c in cues if c['kind'] == 'game' and c['name'] == 'listen_beep' and abs(c['frame'] - q['frame']) <= 2]
                    if twins:  # the game's own listen_beep on that frame becomes the trailer-weight (2.8 kHz) one
                        for c in twins:
                            c['x'], c['src'] = tw_beep, 'trailer/listen_beep (presence layer)'
                    else:
                        x = dsp.fit(q['x'], max(len(q['x']), len(tw_beep)))
                        dsp.place(x, tw_beep, 0, dsp.undb(-2.0))
                        q['x'], q['src'] = x, str(q['src']) + '+presence'
                    q['music_dip_db'] = 6.0
                    presence_rep.append({'frame': q['frame'], 'cue': q['name'], 'rule': 'bot note < 250 Hz: trailer listen_beep layer + 6 dB music dip'})
                elif q['name'] in MUST_READ:
                    # the measurement snap must read on a phone: the trailer-weight (presence-voiced) snap + the dip
                    # density, as for the highfive (the bus limiter crushed the bare transient ~10 dB): short room,
                    # peak-to-loudness <= 9 dB; and the bed takes a breath before it (6 dB, ramped over the 400 ms before)
                    x = dsp.reverb(dsp.fit(tw_snap, len(tw_snap) + int(0.25 * SR)), HIGHFIVE_ROOM, wet=0.3)[:len(tw_snap) + int(0.25 * SR)]
                    m = float(np.max(dsp.momentary(dsp.fit(x, max(len(x), int(0.4 * SR))), 0.01)))
                    q['x'] = dsp.fade(dsp.limiter(x, m + 9.0, 0.001, 0.03), 0.0, 0.05)
                    q['src'] = 'trailer/snap_measure (must-read)+room+plr9'
                    q['music_dip_db'] = 8.0
                    q['pre_dip_db'] = 9.0
                    presence_rep.append({'frame': q['frame'], 'cue': q['name'], 'rule': 'must-read snap: trailer-weight snap, room, PLR <= 9 dB, 8 dB music dip with a 9 dB pre-breath over the 400 ms before'})
                elif q['name'] in LOW_HEAVY:
                    # density, not peak: the master glue/limiter flattened the 60 ms slap (stem -21.5 -> mix -25.7 dB
                    # in the cue's 200 ms). Presence, then a short room for body, then peak-to-loudness <= 9 dB
                    x = dsp.presence(q['x'], 6.0)
                    x = dsp.reverb(dsp.fit(x, len(x) + int(0.25 * SR)), HIGHFIVE_ROOM, wet=0.35)[:len(x) + int(0.25 * SR)]
                    m = float(np.max(dsp.momentary(dsp.fit(x, max(len(x), int(0.4 * SR))), 0.01)))
                    x = dsp.limiter(x, m + 9.0, 0.001, 0.03)
                    q['x'] = dsp.fade(x, 0.0, 0.05)
                    q['src'] = str(q['src']) + '+presence+room+plr9'
                    q['music_dip_db'] = 6.0
                    q['pre_dip_db'] = 4.0  # a small breath before the slap (showcase: 4 of 11 under +4 dB without it)
                    presence_rep.append({'frame': q['frame'], 'cue': q['name'], 'rule': 'low-heavy hit: +6 dB presence, short room, PLR <= 9 dB, 6 dB music dip, 4 dB pre-breath'})
        level_rep = mixfirst.level_cues(cues, stems['music'], secs_list, P)
        if P.get('explainer'):
            # the dips (after levelling, so the cue keeps its level while the bed steps aside): broadband, 30 ms attack,
            # held 200 ms, 250 ms release; the cue's aim and window move up by the dip (measured against the dipped bed)
            dips = [(q['start'] / SR, q['start'] / SR + 0.2, q['music_dip_db']) for q in cues if q.get('music_dip_db')]
            if dips:
                env = dip_envelope(dips, N * CR // SR + 1, attack=0.03, release=0.25, look=0.03)
                pre = [(q['start'] / SR, q['start'] / SR + 0.2, q['pre_dip_db']) for q in cues if q.get('pre_dip_db')]
                if pre:  # the bed's breath before a must-read cue: ramps in over the 400 ms before it
                    env = np.maximum(env, dip_envelope(pre, len(env), attack=0.35, release=0.25, look=0.4))
                env = ctrl_to_samples(env, N)
                stems['music'] *= dsp.undb(-env)[:, None]
                for q in cues:
                    d = max((dd for (a, b, dd) in dips if a - 0.05 <= q['start'] / SR <= b), default=0.0)
                    if d and q.get('aim_margin') is not None:
                        grp = [c for c in cues if c.get('grp') == q.get('grp')]
                        for c in grp:
                            if not c.get('_dip_applied'):
                                bonus = 1.0 if c['name'] in LOW_HEAVY else 0.0  # low-heavy hits aim 1 LU higher (5.5 of 3..6)
                                c['aim_margin'] = (c['aim_margin'] or 0) + d + bonus
                                c['gain_db'] += bonus
                                if c.get('window'):
                                    c['window'] = (c['window'][0] + d, c['window'][1] + d)
                                c['_dip_applied'] = True
    else:
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

        # anticipation arc (Critic fix 5): before the payoff, no featured cue outside the drop may out-shout the drop
        if P.get('arc_cap_lufs') is not None and cs:
            d0 = cs['hits_f'].get('drop', cs['sections'].get('drop', (10 ** 9,))[0])
            pay = cs['hits_f'].get('payoff_slam', cs['sections'].get('payoff', (10 ** 9,))[0])
            cand = sorted([q for q in cues if q['featured'] and q['frame'] < pay and not (d0 <= q['frame'] < d0 + 252)
                           and q['kind'] != 'voice'], key=lambda q: q['frame'])
            groups, cur = [], []
            for q in cand:  # cues within 3 frames of each other sound as one event: cap their COMBINED loudness
                if cur and q['frame'] - cur[0]['frame'] > 3:
                    groups.append(cur)
                    cur = []
                cur.append(q)
            if cur:
                groups.append(cur)
            for grp in groups:
                tot = 10 * np.log10(sum(10 ** (mmax(q) / 10) for q in grp))
                over = tot - P['arc_cap_lufs']
                if over > 0:
                    for q in grp:
                        q['gain_db'] -= over
                        q['arc_cut_db'] = round(over, 2)
    for q in cues:
        q['gain'] = dsp.undb(q['gain_db'])
        dsp.place(stems[q['stem']], q['x'], q['start'], q['gain'])
        q['body_s'] = body_end(q['x'], 0)

    # ── 8. music-first: no ducking; measure every cue against the music; SFX bus processing ──
    bus_rep = {}
    if P.get('music_first'):
        import mixfirst
        n_ctrl = N * CR // SR + 1
        music_raw = stems['music'].copy()
        target = args.margin + 1.0
        for q in cues:  # long reverb tails (sig_a) are cropped so the design stem never sits on the music
            if q.get('mix_max_s') and len(q['x']) > q['mix_max_s'] * SR:
                q['x'] = dsp.fade(q['x'][:int(q['mix_max_s'] * SR)], 0.0, 0.6)
        bus_rep = mixfirst.place_and_correct(cues, stems, music_raw)
        if voice_cues:  # Qubblese lines: readable over the bed (+3 LU integrated over each line), never shouting
            bus_rep['voices'] = mixfirst.level_voices(stems['voices'], music_raw, voice_cues, P.get('voice_window', (-1.0, 4.0, 1.5)))
        stems['sfx'], bus_rep['presence_match'] = mixfirst.presence_match(stems['sfx'], music_raw, secs_list)
        # Critic (fix 5 polish): the build must rise bar by bar on the FULL mix, not just in the music stem
        bus_rep['build_bars'] = mixfirst.monotonic_build(stems, cs['downbeats'], cs['sections'].get('build')) if cs else {}
        for q in cues:
            q.update({'duck_db': 0.0, 'band_db': 0.0, 'boost_db': 0.0, 'band_margin_db': 0.0})
    else:
        # ── 8. ducking solve ──
        n_ctrl = N * CR // SR + 1
        music_raw = stems['music'].copy()
        band = dsp.bandpass(music_raw, 2000, 5000, 2, zp=True)
        rest = music_raw - band
        feat = [q for q in cues if q['featured'] and not q.get('no_duck')] + voice_cues
        exempt = [q for q in cues if q['featured'] and q.get('no_duck')]
        nd_mask = np.ones(N)
        for a, b in no_duck:
            i0, i1, r = a * SPF, b * SPF, int(0.01 * SR)
            nd_mask[i0:i1] = 0.0
            nd_mask[max(0, i0 - r):i0] = np.linspace(1, 0, min(r, i0))
            nd_mask[i1:i1 + r] = np.linspace(0, 1, len(nd_mask[i1:i1 + r]))
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
            env = ctrl_to_samples(dip_envelope([(*span(q), q['duck_db']) for q in feat], n_ctrl), N) * nd_mask
            band_env = band_env * nd_mask
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
                        q['boost_db'] = min(12.0 if q.get('accent') else 6.0, q['boost_db'] + short + 0.3)
            if worst >= target - 0.05:
                break
        stems['music'] = music_d
        for q in exempt:  # measured and reported, but not ducked: the drop is a co-hit with the music (Critic fix 5)
            q['boost_db'] = 0.0
            c, m, tk, bm = measure(q, music_d)
            q.update({'cue_lufs_m': c, 'music_lufs_m': m, 'band_margin_db': bm, 'margin_lu': c - max(m, -70.0),
                      'duck_db': 0.0, 'band_db': 0.0, 'boost_db': 0.0})
        # re-place boosted cues
        for q in cues:
            if q.get('boost_db'):
                dsp.place(stems[q['stem']], q['x'], q['start'], dsp.undb(q['gain_db'] + q['boost_db']) - q['gain'])

    # ── 9. master ──
    n_out = dur_f * SPF
    mix = sum(stems.values())[:n_out]
    glue_rep = {}
    if P.get('music_first'):
        import mixfirst
        mix, glue_rep = mixfirst.glue(mix)
    for k in stems:
        stems[k] = stems[k][:n_out]
    if args.target is None:
        args.target = P.get('target_lufs', -14.0)  # -14 trailer, -16 for the longer explainers
    g_db = args.target - dsp.integrated(mix)
    out = None
    for _ in range(4):
        out = dsp.limiter(mix * dsp.undb(g_db), args.tp - 0.5)  # 0.5 dB codec headroom: the AAC re-encode overshoots ~0.3 dB
        L = dsp.integrated(out)
        if abs(L - args.target) < 0.15:
            break
        g_db += args.target - L
    out = dsp.fade(out, 0.0, 0.05)
    master_gain = dsp.undb(g_db)
    music_bed = music_raw[:n_out] * dsp.undb(g_db)
    return dict(presence_rep=locals().get('presence_rep', []), auto_rep=auto_rep, level_rep=level_rep, bus_rep=bus_rep, glue_rep=glue_rep, seg_report=seg_report, music_bed=music_bed, edl=edl, P=P, cs=cs, bpm=bpm, stems=stems, mix=out, master_gain_db=g_db, cues=cues, voice_cues=voice_cues,
                thinned=thinned, offscreen=offscreen, gates=gates, music_info=music_info, voice_src=voice_src, video=video,
                master_gain=master_gain, target=target)


def write(res, args):
    edl = res['edl']
    au = edl.get('audio', {}) or {}
    outdir = rel(args.out) if args.out else (rel(au['mix']).parent if au.get('mix') else ROOT / f'videos/audio2/mix/{res["video"]}')
    outdir.mkdir(parents=True, exist_ok=True)
    mix_path = outdir / 'mix.wav'
    dsp.write_wav(mix_path, res['mix'])
    if res['cs'] and res['cs'].get('synthetic'):  # explainers: a cue-sheet-shaped sections file for analyze_mix
        # in an explainer the game's actions and Schrödi's lines ARE the hits: a level change on one is intended
        nh = res['cs']['raw']['named_hits']
        for q in res['cues']:
            if q['featured'] and q['kind'] == 'game':
                nh[f"{q['id']}_{q['name']}"] = q['frame']
        for v in res['voice_cues']:
            nh[f"{v['id']}_line"] = v['frame']
        sp = outdir / 'sections_sheet.json'
        dsp.save_json(sp, res['cs']['raw'])
        res['cs']['path'] = relp(sp)
    rz = outdir / 'edl.resolved.json'
    if not rz.exists() or args.out:  # cut list for the jump gate (the Editor's assembler writes the same file)
        try:
            dsp.save_json(rz, E.resolved(edl))
        except Exception:
            pass
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
        if q.get('accent'):
            row['accent'] = True
            row['quantised_from'] = q.get('quantised_from')
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
                        'no_duck': bool(q.get('no_duck')), 'arc_cut_db': q.get('arc_cut_db'), 'zone_db': q.get('zone_db'),
                        'window_rule': q.get('window_rule'), 'window_lu': q.get('window'),
                        'pass': (bool((q.get('window') is None or (q['window'][0] - 0.3 <= q.get('margin_lu', -99) <= q['window'][1] + 0.3))
                                      and (q.get('cue_lufs_m', -99) > -40 or (q['kind'] == 'voice' and q.get('window') is None)))
                                 if res['P'].get('music_first') else
                                 bool((q.get('no_duck') or q.get('margin_lu', -99) >= args.margin) and q.get('cue_lufs_m', -99) > -40))})
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
    # Critic fix 5: full-mix anticipation arc; fix 9: re-measure the ENCODED file (AAC 320k, as delivered)
    arcg = {}
    try:
        import arc_gate
        hf = (res['cs'] or {}).get('hits_f', {}) if res['cs'] else {}
        d0 = hf.get('drop', 1394)
        arcg = arc_gate.arc(res['mix'], d0, d0 + 252, hf.get('silence_start', 1298), hf.get('payoff_slam', 3026))
    except Exception as ex:
        arcg = {'error': str(ex)}
    aac = {}
    try:
        import subprocess
        m4a = outdir / 'mix_check.m4a'
        subprocess.run(['ffmpeg', '-y', '-v', 'error', '-i', str(mix_path), '-c:a', 'aac', '-b:a', '320k', '-ar', '48000', str(m4a)], check=True)
        aac = {'codec': 'aac 320k 48k (ffmpeg native)', **dsp.ffmpeg_ebur128(m4a)}
        aac['pass_true_peak_-1'] = aac.get('TP') is not None and aac['TP'] <= -1.0
        m4a.unlink()
    except Exception as ex:
        aac = {'error': str(ex)}
    phone = {}
    if res['P'].get('music_first'):
        try:
            import mixfirst
            ps, ph_gain = mixfirst.phone_sim(res['mix'], return_gain=True)
            pp = ROOT / 'videos/final/review' / f"{outdir.name}_phone_sim.wav"  # per work dir (trailer, trailer_public)
            dsp.write_wav(pp, ps)
            hf = res['cs']['hits_f'] if res['cs'] else {}
            secs = res['cs']['sections'] if res['cs'] else {}

            def stand(f, look=0.6):
                a, b = int(f * SPF), int((f / 60 + look) * SR)
                pre = ps[max(0, a - SR):a]
                mh = float(np.max(dsp.momentary(dsp.fit(ps[a:b], max(b - a, int(0.4 * SR))), 0.02)))
                mp = float(np.median(dsp.momentary(dsp.fit(pre, max(len(pre), int(0.4 * SR))), 0.05))) if len(pre) else -70
                return {'frame': f, 'hit_momentary': round(mh, 1), 'pre_1s_median': round(max(mp, -70), 1), 'stands_out_lu': round(mh - max(mp, -70), 1)}
            keys = {k: hf[k] for k in ('peek_collapse', 'bot_beep', 'drop', 'snap_circuit_reveal') if k in hf}
            phone = {'file': relp(pp), 'hits': {k: stand(v) for k, v in keys.items()}}
            if 'payoff' in secs and 'lights_out' in secs:  # the payoff is preceded by its swell: compare sections
                pl = dsp.integrated(ps[secs['payoff'][0] * SPF:secs['payoff'][1] * SPF])
                ll = dsp.integrated(ps[secs['lights_out'][0] * SPF:secs['lights_out'][1] * SPF])
                phone['payoff_vs_lights_out'] = {'payoff_lufs': round(pl, 1), 'lights_out_lufs': round(ll, 1), 'lu': round(pl - ll, 1), 'pass': pl - ll >= 3}
            if 'closing_musicbox' in secs:
                a, b = secs['closing_musicbox']
                box = dsp.integrated(ps[a * SPF:b * SPF])
                pay = dsp.integrated(ps[secs['payoff'][0] * SPF:secs['payoff'][1] * SPF]) if 'payoff' in secs else None
                phone['closing_musicbox'] = {'lufs': round(box, 1), 'payoff_lufs': round(pay, 1) if pay else None,
                                             'below_payoff_lu': round(pay - box, 1) if pay else None, 'audible': box > -35}
            phone['pass'] = (all(h['stands_out_lu'] >= 3 for h in phone['hits'].values()) and phone.get('closing_musicbox', {}).get('audible', True)
                             and phone.get('payoff_vs_lights_out', {}).get('pass', True))
            if res['P'].get('explainer'):  # every game action must read on a phone: featured cues vs the second before
                rows_f = [q for q in res['cues'] if q['featured'] and q['kind'] == 'game']
                pb = mixfirst.phone_sim(res['stems']['music'], gain_db=ph_gain)  # the bed alone (stems carry the master gain), same phone, same playback gain
                st = []
                for q in rows_f:
                    a = q['start']
                    seg, bed = ps[a:a + int(0.6 * SR)], pb[a:a + int(0.6 * SR)]
                    if len(seg) < 100:
                        continue
                    sm = dsp.momentary(dsp.fit(seg, max(len(seg), int(0.4 * SR))), 0.02)
                    k = int(np.argmax(sm))
                    bm = dsp.momentary(dsp.fit(bed, max(len(bed), int(0.4 * SR))), 0.02)
                    over = float(sm[k] - max(bm[min(k, len(bm) - 1)], -70))
                    quiet = '_quiet' in str(q['src'])
                    r200 = ps[a:a + int(0.2 * SR)]
                    r400 = ps[max(0, a - int(0.4 * SR)):a]
                    crit = float(10 * np.log10((np.mean(r200 ** 2) + 1e-14) / (np.mean(r400 ** 2) + 1e-14))) if len(r400) else 99.0
                    need = None
                    if q['name'] in ('listen_beep', 'botNote') and not quiet:
                        need = 6.0
                    elif q['name'] in LOW_HEAVY:
                        need = 4.0
                    elif q['name'] in MUST_READ:
                        need = 6.0
                    st.append({'frame': q['frame'], 'name': q['name'] + (' (quiet)' if quiet else ''), 'over_bed_lu': round(over, 1),
                               'rms200_vs_prev400_db': round(crit, 1), 'need_db': need,
                               'ok': over >= (-2.0 if quiet else 1.5) and (need is None or crit >= need)})
                ok = sum(x['ok'] for x in st)
                phone['featured_cues'] = {'checked': len(st), 'readable': ok, 'rule': 'on the phone, the mix at the cue >= the bed alone +1.5 LU (QUIET >= -2 LU); '
                                          'Critic metric (cue 200 ms RMS vs the 400 ms before): BEEPs and the measurement snap >= +6 dB, highfives >= +4 dB',
                                          'per_cue': st,
                                          'not_readable': [x for x in st if not x['ok']][:20]}
                phone['pass'] = bool(st) and ok >= 0.9 * len(st)
        except Exception as ex:
            phone = {'error': str(ex)}
    rep = {
        'arc_gate': arcg, 'aac_check': aac, 'mode': 'music-first' if res['P'].get('music_first') else 'sfx-ducking',
        'music_automation': res.get('auto_rep'), 'sfx_bus': res.get('bus_rep'), 'glue': res.get('glue_rep'),
        'level_decisions': res.get('level_rep'), 'phone_sim': phone, 'presence_layers': res.get('presence_rep'),
        'score_segments': res.get('seg_report', []),
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
        'stems_scaled_by_master_gain': True,  # stems on disk already include the master gain (pre glue/limiter)
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
    ap.add_argument('--score', help='score-segment plan JSON (default: the EDL audio.score, else the preset plan)')
    ap.add_argument('--no-score', action='store_true', help='ignore score segments (bed only)')
    ap.add_argument('--no-engine', action='store_true')
    ap.add_argument('--out')
    ap.add_argument('--target', type=float, default=None, help='integrated LUFS (default: the preset, -14 trailer / -16 explainers)')
    ap.add_argument('--tp', type=float, default=-1.5)  # Critic fix 9: platforms re-encode (inter-sample overshoot)
    ap.add_argument('--margin', type=float, default=6.0)
    args = ap.parse_args(argv)
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'progress'))
    from progress import Progress
    prog = Progress(f'mix:{Path(args.out or args.edl).stem}', title=f'Mix {Path(args.edl).name}', agent=os.environ.get('NP_AGENT', 'sound'))
    try:
        prog.stage('building stems + cues')
        res = build(args)
        prog.stage('writing mix + loudness report')
        rep, rp = write(res, args)
    except BaseException as x:
        prog.fail(x)
        raise
    s = rep['summary']
    L = rep['loudness']
    prog.output(rep['mix'], 'mix')
    prog.output(rp, 'report')
    prog.done(f"I={L['ffmpeg_ebur128']['I']} LUFS, TP={L['ffmpeg_ebur128']['TP']} dBTP, featured {s['featured_pass']}/{s['featured']} pass"
              + (f", FAIL {s['featured_fail']}" if s['featured_fail'] else ''))
    print(f"mix: {rep['mix']}  I={L['ffmpeg_ebur128']['I']} LUFS  TP={L['ffmpeg_ebur128']['TP']} dBTP (own: {L['integrated_lufs']}/{L['true_peak_dbtp']})")
    print(f"cues {s['cues']}  featured {s['featured_pass']}/{s['featured']} pass  min margin {s['min_margin_lu']} LU  thinned {s['thinned']}")
    if s['featured_fail']:
        print('  FAIL:', s['featured_fail'])
    print('report:', rp.relative_to(ROOT) if rp.is_relative_to(ROOT) else rp)
    return rep


if __name__ == '__main__':
    main()
