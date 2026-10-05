"""Live progress for Python video jobs (same format as progress.mjs; see videos/status.html).

    from tools.video.progress.progress import Progress   # or sys.path-insert tools/video/progress
    p = Progress('render:trailer', title='Render trailer', total=4240, unit='frames')
    p.tick(n); p.output('videos/final/review/trailer_sheet.png'); p.done()  /  p.fail(e)
"""
import json, os, re, threading, time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
DIR = ROOT / 'videos/progress'
JOBS = DIR / 'jobs'
_LOCK = threading.Lock()  # render.py ticks from worker threads


def _atomic(path: Path, text: str):
    tmp = path.with_name(f'{path.name}.{os.getpid()}.{threading.get_ident()}.tmp')
    tmp.write_text(text)
    os.replace(tmp, path)


class Progress:
    def __init__(self, id, title=None, total=None, unit='steps', stage='', agent=None):
        JOBS.mkdir(parents=True, exist_ok=True)
        self.file = JOBS / (re.sub(r'[^\w.:-]', '_', id).replace(':', '__') + '.json')
        now = int(time.time() * 1000)
        self.s = dict(id=id, title=title or id, agent=agent or os.environ.get('NP_AGENT', ''), state='running', stage=stage,
                      done=0, total=total, unit=unit, note='', outputs=[], pid=os.getpid(), startedAt=now, updatedAt=now)
        self.last = 0.0
        self._write(True)

    def set(self, force=False, **fields):
        self.s.update(fields)
        return self._write(force)

    def tick(self, done, **fields):
        return self.set(done=done, **fields)

    def stage(self, stage, **fields):
        return self.set(True, stage=stage, **fields)

    def queued(self, note):
        return self.set(True, state='queued', note=note)

    def output(self, file, label=''):
        rel = os.path.relpath((ROOT / file).resolve(), ROOT)
        if not any(o['path'] == rel for o in self.s['outputs']):
            self.s['outputs'].append(dict(path=rel, label=label))
        return self._write(True)

    def done(self, note=''):
        self.set(True, state='done', note=note, done=self.s['total'] if self.s['total'] is not None else self.s['done'])
        _history(self.s)

    def fail(self, err):
        self.set(True, state='failed', note=str(err))
        _history(self.s)

    def _write(self, force):
        with _LOCK:
            return self._write_locked(force)

    def _write_locked(self, force):
        now = time.time()
        if not force and now - self.last < 1.0:
            return self
        self.last = now
        self.s['updatedAt'] = int(now * 1000)
        _atomic(self.file, json.dumps(self.s, indent=1))
        rebuild()
        return self


def _history(s):
    with open(DIR / 'history.jsonl', 'a') as f:
        f.write(json.dumps({**s, 'finishedAt': int(time.time() * 1000)}) + '\n')


def rebuild():
    JOBS.mkdir(parents=True, exist_ok=True)
    jobs = []
    for f in sorted(JOBS.glob('*.json')):
        try:
            jobs.append(json.loads(f.read_text()))
        except (ValueError, OSError):
            pass
    for j in jobs:
        if j['state'] in ('running', 'queued'):
            try:
                os.kill(j['pid'], 0)
            except OSError:
                j['state'] = 'dead'
    for j in jobs:
        # tolerate jobs that recorded outputs as bare paths (one malformed file must not break every job's board)
        j['outputs'] = [o if isinstance(o, dict) else dict(path=str(o), label='') for o in (j.get('outputs') or [])]
        for o in j['outputs']:
            try:
                o['v'] = int((ROOT / o['path']).stat().st_mtime * 1000)
            except OSError:
                pass
    m = re.search(r'PAGE_VERSION = (\d+)', (Path(__file__).parent / 'status.html').read_text())
    _atomic(DIR / 'status.js', 'window.NP_STATUS = ' + json.dumps(dict(builtAt=int(time.time() * 1000), pageVersion=int(m.group(1)) if m else 0, jobs=jobs)) + ';\n')
    return jobs


def contact_sheet(input, name, frames=None):
    """4×3 contact sheet (12 evenly spaced frames) of a finished clip -> videos/review/<name>_sheet.png, or None."""
    import subprocess
    out = ROOT / 'videos/review' / f'{name}_sheet.png'
    out.parent.mkdir(parents=True, exist_ok=True)
    step = max(1, (frames or 120) // 12)
    r = subprocess.run(['nice', '-n', '10', 'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-threads', '4', '-i', str(input),
                        '-vf', f'select=not(mod(n\\,{step})),scale=480:-2,tile=4x3', '-frames:v', '1', '-fps_mode', 'vfr', str(out)])
    return out if r.returncode == 0 else None


if __name__ == '__main__':
    # CLI for shell scripts (safe-run.sh): progress.py queued <id> <title> <note> <pid>  |  progress.py clear <id>
    import sys
    cmd, jid = sys.argv[1], sys.argv[2]
    f = JOBS / (re.sub(r'[^\w.:-]', '_', jid).replace(':', '__') + '.json')
    if cmd == 'queued':
        p = Progress(jid, title=sys.argv[3])
        p.s['pid'] = int(sys.argv[5])
        p.queued(sys.argv[4])
    elif cmd == 'clear':
        f.unlink(missing_ok=True)
        rebuild()
