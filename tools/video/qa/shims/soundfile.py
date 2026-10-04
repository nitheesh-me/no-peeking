"""Minimal ffmpeg-backed stand-in for soundfile.read (used only when the real package is absent),
so tools/video/audio/music_gate.py can run inside the QA gates."""
import json
import subprocess

import numpy as np


def read(path, dtype='float32', always_2d=False):
    info = json.loads(subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=sample_rate,channels',
                                      '-of', 'json', path], capture_output=True, text=True).stdout)['streams'][0]
    sr, ch = int(info['sample_rate']), int(info['channels'])
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-acodec', 'pcm_f32le', '-'], capture_output=True).stdout
    y = np.frombuffer(raw, np.float32).reshape(-1, ch).astype(dtype)
    return (y if (ch > 1 or always_2d) else y[:, 0]), sr
