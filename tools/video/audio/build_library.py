"""Build the hi-fi game SFX library from the game's own engine (offline render, 48 kHz / 24-bit).

    python3 tools/video/audio/build_library.py            # everything
    python3 tools/video/audio/build_library.py --only trailer   # just re-derive trailer-weight versions

Outputs (videos/audio2/lib/):
  game/<sfx>__v{1,2,3}.wav        all 25 SfxName, dry (no engine reverb), 3 seeded variants
  game_wet/<sfx>__v1.wav          same with the game's own convolution reverb (as heard in-game)
  bots/bot_<a..h>_{beep,quiet}.wav  botNote voices (a/b are the ones used in the videos)
  chords/chord_<bits>.wav         syndromeChord for every 2-, 3- and 4-bot syndrome
  voices/<who>/<slug>.wav + voices/index.json   Qubblese for every dialogue line in the game,
                                  typed at the game's 22 ms/char typewriter rate
  trailer/<sfx>.wav               "trailer-weight" featured SFX: transient shaping + 2-4 kHz
                                  presence + 40-60 Hz sub thump + short room
  library.json                    manifest: file, duration, sample/true peak, max momentary LUFS
Relative levels between game SFX are the engine's own balance (SFX_GAIN); one global gain
puts the loudest game SFX at -1 dBFS. Every file starts at the engine call time (so the
engine's own 5 ms scheduling lead is preserved for frame-exact placement).
"""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import dsp  # noqa: E402
from engine_render import render_jobs, ensure_server, ROOT, CHROME_ARGS  # noqa: E402

OUT = ROOT / 'videos/audio2/lib'
SFX_NAMES = ['boop', 'shush', 'spin', 'highfive', 'listen_beep', 'listen_quiet', 'reset', 'peek_collapse',
             'gremlin_sneak', 'gremlin_flip', 'ghost_phase', 'wobble', 'test_pass', 'test_fail', 'level_win',
             'ui_click', 'ui_hover', 'card_pick', 'card_drop', 'rewind', 'snap_measure', 'qubble_snore',
             'qubble_giggle', 'schrodi_meow', 'glitch']
BOTS = 'abcdefgh'
SLOT = 5.0
CHAR_DT = 0.022  # dialogue typewriter interval (src/ui/dialogue.ts setInterval 22 ms)

# featured SFX → trailer-weight tuning: (sub Hz, sub level rel. peak, presence dB, attack dB, room wet)
TRAILER = {
    'peek_collapse': (46, 0.9, 3.5, 6, 0.22), 'boop': (55, 0.75, 4.0, 6, 0.15), 'highfive': (50, 0.8, 3.5, 7, 0.18),
    'listen_beep': (58, 0.55, 3.0, 4, 0.12), 'listen_quiet': (58, 0.35, 3.0, 3, 0.10), 'gremlin_flip': (48, 0.85, 3.5, 6, 0.18),
    'ghost_phase': (42, 0.6, 3.0, 3, 0.25), 'wobble': (50, 0.6, 3.0, 4, 0.18), 'test_pass': (55, 0.55, 3.0, 4, 0.15),
    'test_fail': (45, 0.7, 3.0, 4, 0.18), 'level_win': (44, 0.8, 3.0, 4, 0.22), 'glitch': (48, 0.8, 3.5, 6, 0.12),
    'snap_measure': (60, 0.6, 4.0, 8, 0.08), 'spin': (52, 0.5, 3.0, 3, 0.15), 'shush': (55, 0.3, 2.0, 2, 0.15),
    'schrodi_meow': (52, 0.35, 3.0, 3, 0.15), 'qubble_snore': (40, 0.4, 2.5, 0, 0.15), 'gremlin_sneak': (45, 0.5, 3.0, 3, 0.2),
    'reset': (55, 0.5, 3.0, 4, 0.12), 'rewind': (50, 0.5, 3.0, 3, 0.15), 'qubble_giggle': (55, 0.3, 3.0, 3, 0.12),
    # card UI as rhythmic accents (REVISED 2: the programming is heard): tight, woody, small sub tick
    'card_pick': (60, 0.35, 4.0, 6, 0.06), 'card_drop': (55, 0.55, 3.5, 7, 0.06), 'ui_click': (58, 0.55, 4.5, 4, 0.14),
}


def slug(s: str, n=40) -> str:
    return re.sub(r'[^a-z0-9]+', '_', s.lower()).strip('_')[:n]


def collect_lines() -> list[dict]:
    """All {who, text} dialogue lines from the game's levels (walked in the browser) + screen lines."""
    from playwright.sync_api import sync_playwright
    url, proc = ensure_server()
    try:
        with sync_playwright() as p:
            b = p.chromium.launch(args=CHROME_ARGS)
            pg = b.new_page()
            pg.goto(url + '/src/audio/test.html')
            lines = pg.evaluate("""async () => {
              const { LEVELS } = await import('/src/levels/index.ts');
              const out = [], seen = new Set();
              const walk = (o, lvl) => {
                if (!o || typeof o !== 'object') return;
                if (Array.isArray(o)) { o.forEach((x) => walk(x, lvl)); return; }
                if (typeof o.who === 'string' && typeof o.text === 'string') {
                  const k = o.who + '|' + o.text; if (!seen.has(k)) { seen.add(k); out.push({ who: o.who, text: o.text, level: lvl }); }
                }
                for (const v of Object.values(o)) walk(v, lvl);
              };
              for (const l of LEVELS) walk(l, l.id);
              return out;
            }""")
            b.close()
    finally:
        if proc:
            proc.kill()
    extra = [('schrodi', 'No peeking! Poking is how peeking starts.'), ('schrodi', 'Hands off the blanket. That Qubble is mid-dream.'),
             ('schrodi', 'If it wakes up, it forgets half its dream. Forever. No pressure.'),
             ('schrodi', "Oh. You found my notes. Don't tell the Qubbles."), ('schrodi', 'Hello, caretaker.'),
             ('schrodi', 'Morning check: perfect!'), ('flipper', 'Hee hee! Flip!'), ('phasey', 'Ooooh... you can\'t see meee...'),
             ('wobbles', 'Blub. Wobble wobble.')]
    have = {(l['who'], l['text']) for l in lines}
    for w, t in extra:
        if (w, t) not in have:
            lines.append({'who': w, 'text': t, 'level': 'extra'})
    return lines


def slice_slots(x: np.ndarray, starts: list[float], lens: list[float]) -> list[np.ndarray]:
    out = []
    for s, L in zip(starts, lens):
        a = int(round(s * dsp.SR))
        seg = x[a:a + int(round(L * dsp.SR))]
        # tail trim at -80 dBFS (head untouched: the file starts at the engine call time)
        amp = np.max(np.abs(seg), axis=1)
        nz = np.nonzero(amp > dsp.undb(-80))[0]
        end = (nz[-1] + int(0.03 * dsp.SR)) if len(nz) else int(0.05 * dsp.SR)
        out.append(dsp.fade(seg[:min(end, len(seg))], 0, 0.01))
    return out


def stats(x):
    return {'dur': round(len(x) / dsp.SR, 3), 'peak_db': round(dsp.sample_peak_db(x), 2), 'tp_db': round(dsp.true_peak_db(x), 2),
            'max_lufs_m': round(float(np.max(dsp.momentary(x, 0.02))) if len(x) > 0.4 * dsp.SR else
                                float(dsp.momentary(dsp.fit(x, int(0.4 * dsp.SR)))[0]), 2)}


def build_game(manifest):
    jobs, layout = [], []
    for wet in (False, True):
        for v in ((1, 2, 3) if not wet else (1,)):
            calls = [{'t': i * SLOT, 'k': 'sfx', 'name': n} for i, n in enumerate(SFX_NAMES)]
            calls[0]['t'] = 0.0
            jobs.append({'name': f'sfx v{v} wet={wet}', 'secs': SLOT * len(SFX_NAMES), 'dry': not wet, 'seed': 1000 + v, 'calls': calls})
            layout.append((wet, v))
    # bots + chords in one more job
    bot_calls, bot_names = [], []
    t = 0.0
    for i, b in enumerate(BOTS):
        for r in (1, 0):
            bot_calls.append({'t': t, 'k': 'bot', 'i': i, 'r': r})
            bot_names.append(f'bot_{b}_{"beep" if r else "quiet"}')
            t += 2.0
    chords = []
    for nb in (2, 3, 4):
        for m in range(2 ** nb):
            bits = [(m >> (nb - 1 - j)) & 1 for j in range(nb)]
            chords.append(bits)
            bot_calls.append({'t': t, 'k': 'chord', 'bits': bits})
            bot_names.append('chord_' + ''.join(map(str, bits)))
            t += 3.0
    jobs.append({'name': 'bots+chords', 'secs': t + 1, 'dry': True, 'seed': 77, 'calls': bot_calls})
    pcm = render_jobs(jobs)

    files = {}
    for (wet, v), x in zip(layout, pcm):
        segs = slice_slots(x, [i * SLOT for i in range(len(SFX_NAMES))], [SLOT] * len(SFX_NAMES))
        for n, s in zip(SFX_NAMES, segs):
            files[(('game_wet' if wet else 'game'), f'{n}__v{v}')] = s
    starts = [c['t'] for c in bot_calls]
    lens = [2.0 if n.startswith('bot') else 3.0 for n in bot_names]
    for n, s in zip(bot_names, slice_slots(pcm[-1], starts, lens)):
        files[('bots' if n.startswith('bot') else 'chords', n)] = s
    # one global gain: loudest dry game sfx → -1 dBFS (keeps the engine's balance across everything)
    g = dsp.undb(-1.0) / max(np.max(np.abs(s)) for (d, _), s in files.items() if d in ('game', 'bots', 'chords'))
    manifest['global_gain_db'] = round(float(dsp.db(g)), 2)
    for (d, n), s in files.items():
        y = s * g
        p = OUT / d / f'{n}.wav'
        dsp.write_wav(p, y)
        manifest['files'][f'{d}/{n}'] = {'path': str(p.relative_to(ROOT)), **stats(y)}
    print('game sfx:', len(files), 'files; global gain', manifest['global_gain_db'], 'dB')


def build_voices(manifest):
    lines = collect_lines()
    jobs, metas = [], []
    # batch lines into jobs of ~60 s
    cur, t = [], 0.0
    def flush():
        nonlocal cur, t
        if cur:
            calls = []
            for m in cur:
                for i in range(len(m['text'])):
                    calls.append({'t': m['t0'] + i * CHAR_DT, 'k': 'voice', 'who': m['who'], 'i': i, 'line': m['text']})
            jobs.append({'name': f'voices x{len(cur)}', 'secs': t + 0.5, 'dry': True, 'seed': 5, 'calls': calls})
            metas.append(cur)
        cur, t = [], 0.0
    for l in lines:
        L = len(l['text']) * CHAR_DT + 1.2
        cur.append({**l, 't0': t, 'len': L})
        t += L
        if t > 60:
            flush()
    flush()
    pcm = render_jobs(jobs)
    segs_all = []
    for x, ms in zip(pcm, metas):
        segs_all += list(zip(ms, slice_slots(x, [m['t0'] for m in ms], [m['len'] for m in ms])))
    g = dsp.undb(-3.0) / max(np.max(np.abs(s)) for _, s in segs_all)
    index = []
    for m, s in segs_all:
        h = hashlib.sha1((m['who'] + '|' + m['text']).encode()).hexdigest()[:8]
        p = OUT / 'voices' / m['who'] / f"{slug(m['text'])}_{h}.wav"
        dsp.write_wav(p, s * g)
        index.append({'who': m['who'], 'text': m['text'], 'level': m['level'], 'file': str(p.relative_to(ROOT)),
                      'char_dt': CHAR_DT, 'dur': round(len(s) / dsp.SR, 3)})
    manifest['voice_gain_db'] = round(float(dsp.db(g)), 2)
    dsp.save_json(OUT / 'voices/index.json', index)
    by = {}
    for e in index:
        by[e['who']] = by.get(e['who'], 0) + 1
    print('voices:', by)


def trailer_weight(x: np.ndarray, sub_hz, sub_lvl, pres_db, att_db, wet, ir) -> np.ndarray:
    """Sweeten a game SFX for the trailer: transient shaping → 2–4 kHz presence → sub thump → short room → peak −1 dBFS."""
    pk = np.max(np.abs(x))
    y = dsp.transient_shape(x, att_db, -1.0)
    y = dsp.presence(y, pres_db)
    y = dsp.highpass(y, 35, 2)
    # onset: first sample within 24 dB of the peak
    on = int(np.argmax(np.max(np.abs(x), 1) > pk * dsp.undb(-24)))
    sub = dsp.stereo(dsp.sub_thump(sub_hz, 0.22, 1.7), 0) / np.sqrt(2) * pk * sub_lvl
    out = dsp.fit(y, max(len(y), on + len(sub)) + int(0.3 * dsp.SR))
    dsp.place(out, sub, on)
    out = dsp.reverb(out, ir, wet=wet, dry=1.0)
    out = dsp.soft_clip(out / (np.max(np.abs(out)) + 1e-9) * 1.05, 1.5) * 0.97
    out = dsp.trim_silence(out, -80, 0, 0.03)
    out = dsp.fit(out, max(len(out), int(0.45 * dsp.SR)))
    # consistent weight: max momentary loudness → -16 LUFS (limited to ≤ 6 dB of peak reduction), TP ≤ -1 dBTP
    m = float(np.max(dsp.momentary(out, 0.01)))
    gain = min(-16.0 - m, -1.0 - dsp.sample_peak_db(out) + 6.0)
    out = dsp.limiter(out * dsp.undb(gain), -1.2, 0.002, 0.05)
    return out


def build_trailer(manifest):
    ir = dsp.make_ir(0.7, 6.0, 0.008, 7000, seed=3)
    n = 0
    for name, prm in TRAILER.items():
        x = dsp.read_wav(OUT / 'game' / f'{name}__v1.wav')
        y = trailer_weight(x, *prm, ir)
        p = OUT / 'trailer' / f'{name}.wav'
        dsp.write_wav(p, y)
        manifest['files'][f'trailer/{name}'] = {'path': str(p.relative_to(ROOT)), **stats(y)}
        n += 1
    for b in 'ab':
        for r in ('beep', 'quiet'):
            x = dsp.read_wav(OUT / 'bots' / f'bot_{b}_{r}.wav')
            y = trailer_weight(x, 56, 0.6 if r == 'beep' else 0.35, 3.0, 4 if r == 'beep' else 3, 0.12, ir)
            p = OUT / 'trailer' / f'bot_{b}_{r}.wav'
            dsp.write_wav(p, y)
            manifest['files'][f'trailer/bot_{b}_{r}'] = {'path': str(p.relative_to(ROOT)), **stats(y)}
            n += 1
    for bits in ('00', '10', '01', '11'):
        x = dsp.read_wav(OUT / 'chords' / f'chord_{bits}.wav')
        y = trailer_weight(x, 50, 0.55, 3.0, 3, 0.2, ir)
        p = OUT / 'trailer' / f'chord_{bits}.wav'
        dsp.write_wav(p, y)
        manifest['files'][f'trailer/chord_{bits}'] = {'path': str(p.relative_to(ROOT)), **stats(y)}
        n += 1
    print('trailer-weight:', n)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--only', choices=['game', 'voices', 'trailer'])
    a = ap.parse_args()
    mpath = OUT / 'library.json'
    manifest = json.loads(mpath.read_text()) if mpath.exists() else {'sr': dsp.SR, 'bits': 24, 'files': {}}
    if a.only in (None, 'game'):
        build_game(manifest)
    if a.only in (None, 'voices'):
        build_voices(manifest)
    if a.only in (None, 'trailer', 'game'):
        build_trailer(manifest)
    dsp.save_json(mpath, manifest)


if __name__ == '__main__':
    main()
