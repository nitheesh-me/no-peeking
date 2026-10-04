#!/usr/bin/env python3
"""Same picture, another mix: stream-copy every output of a rendered EDL and mux an alternate mix (AAC 320k).

usage: python3 tools/video/assemble/alt_audio.py tools/video/edl/trailer.edl.json videos/final/work/trailer_public/mix.wav public
-> videos/final/trailer_public.mp4, videos/final/trailer_master_1440p_public.mp4
"""
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'edl'))
import edl as E  # noqa: E402
from render import AAC_TP_GUARD  # noqa: E402


def main():
    edl_p, mix, tag = sys.argv[1:4]
    e = E.load(edl_p)
    for o in e['outputs']:
        src = E.rel(o['path'])
        root, ext = os.path.splitext(src)
        dst = f'{root}_{tag}{ext}'
        cmd = ['ffmpeg', '-v', 'error', '-y', '-threads', '6', '-i', src, '-i', E.rel(mix), '-map', '0:v', '-map', '1:a', '-af', AAC_TP_GUARD, '-c:v', 'copy',
               '-c:a', 'aac', '-b:a', '320k', '-ar', '48000', '-ac', '2', '-shortest', '-movflags', '+faststart', dst + '.tmp.mp4']
        subprocess.run([E.rel('tools/video/safe-run.sh'), '--', *cmd], check=True)
        os.replace(dst + '.tmp.mp4', dst)
        print(os.path.relpath(dst, E.ROOT))


if __name__ == '__main__':
    main()
