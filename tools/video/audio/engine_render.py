"""Offline-render jobs through the game's own WebAudio engine (headless Chromium via Playwright).

    from engine_render import render_jobs
    pcm_list = render_jobs([job, ...])          # each -> np.ndarray (n, 2) float64 at 48 kHz

A vite dev server is needed (the page imports /src/audio/index.ts). We reuse one on
NP_VITE_URL / 127.0.0.1:4391 / localhost:4381, else start `npx vite --port 4391` ourselves.
See render.js for the job format.
"""
from __future__ import annotations

import base64
import os
import subprocess
import time
import urllib.request
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
CHROME_ARGS = ['--autoplay-policy=no-user-gesture-required', '--disable-gpu', '--use-angle=swiftshader',
               '--enable-unsafe-swiftshader', '--js-flags=--max-old-space-size=2048']  # docs/VIDEO_RESOURCES.md
CANDIDATES = [os.environ.get('NP_VITE_URL'), 'http://127.0.0.1:4391', 'http://localhost:4381']


def _alive(url: str) -> bool:
    try:
        with urllib.request.urlopen(url + '/src/audio/test.html', timeout=2) as r:
            return r.status == 200
    except Exception:
        return False


def ensure_server():
    for u in CANDIDATES:
        if u and _alive(u):
            return u, None
    proc = subprocess.Popen(['npx', 'vite', '--port', '4391', '--strictPort', '--host', '127.0.0.1'], cwd=ROOT,
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    for _ in range(60):
        time.sleep(0.5)
        if _alive('http://127.0.0.1:4391'):
            return 'http://127.0.0.1:4391', proc
    proc.kill()
    raise RuntimeError('could not start vite for offline rendering')


_PULL = """([o,c]) => { const a = window.__pcm.subarray(o, o+c); const u = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
 let s=''; for (let i=0;i<u.length;i+=32768) s += String.fromCharCode.apply(null, u.subarray(i,i+32768)); return btoa(s); }"""


def render_jobs(jobs: list[dict], verbose: bool = True) -> list[np.ndarray]:
    from playwright.sync_api import sync_playwright
    url, proc = ensure_server()
    js = (HERE / 'render.js').read_text()
    outs = []
    try:
        with sync_playwright() as p:
            b = p.chromium.launch(args=CHROME_ARGS)
            pg = b.new_page()
            pg.goto(url + '/src/audio/test.html')
            for job in jobs:
                t0 = time.time()
                n = pg.evaluate(js, job)
                raw = bytearray()
                CH = 48000 * 2 * 10
                for off in range(0, n * 2, CH):
                    raw += base64.b64decode(pg.evaluate(_PULL, [off, CH]))
                x = np.frombuffer(bytes(raw), '<f4').astype(np.float64).reshape(-1, 2)
                outs.append(x)
                if verbose:
                    print(f"  rendered {job.get('name', '?')}: {n / 48000:.1f}s in {time.time() - t0:.1f}s", flush=True)
            b.close()
    finally:
        if proc:
            proc.kill()
    return outs
