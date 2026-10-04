#!/usr/bin/env python3
"""Generate the show grade as 33^3 .cube LUTs (tools/video/assemble/luts/).

day   : slight warm lift (shadows/mids toward amber), gentle S-curve, +4% saturation
night : deep blue: shadows lifted toward blue, mids cooled and 10% desaturated,
        highlights kept neutral so the moon and the paper text stay white
none  : identity (Motion Designer pieces are delivered graded)
Subtle on purpose: the game's own palette must stay recognisable.
"""
import os

import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
N = 33


def luma(c):
    return 0.2126 * c[..., 0] + 0.7152 * c[..., 1] + 0.0722 * c[..., 2]


def s_curve(x, k):
    return x + k * (x - 0.5) * x * (1 - x) * 2  # fixed endpoints


def day(c):
    y = luma(c)[..., None]
    sh = (1 - y) ** 2
    c = c + sh * np.array([0.018, 0.010, -0.006]) + (y * (1 - y)) * np.array([0.020, 0.006, -0.016])
    c = s_curve(np.clip(c, 0, 1), 0.10)
    y = luma(c)[..., None]
    return y + (c - y) * 1.04


def night(c):
    y = luma(c)[..., None]
    sh = (1 - y) ** 3
    c = c + sh * np.array([-0.004, 0.006, 0.030])          # blue in the blacks (never crushed to pure 0)
    mid = 4 * y * (1 - y)
    c = c + mid * np.array([-0.022, -0.004, 0.026])         # cool mids
    y = luma(c)[..., None]
    c = y + (c - y) * (1 - 0.10 * mid)                      # desaturate mids only
    hl = np.clip((y - 0.75) / 0.25, 0, 1)
    c = c * (1 - hl) + (np.clip(c, 0, 1) * 0.5 + y * 0.5) * hl  # neutral highlights
    return s_curve(np.clip(c, 0, 1), 0.06)


def write(name, fn):
    g = np.linspace(0, 1, N)
    b, gg, r = np.meshgrid(g, g, g, indexing='ij')  # .cube: red varies fastest
    rgb = np.stack([r, gg, b], -1).reshape(-1, 3)
    out = np.clip(fn(rgb.copy()), 0, 1)
    os.makedirs(os.path.join(HERE, 'luts'), exist_ok=True)
    p = os.path.join(HERE, 'luts', f'{name}.cube')
    with open(p, 'w') as f:
        f.write(f'TITLE "NO PEEKING {name}"\nLUT_3D_SIZE {N}\n')
        for v in out:
            f.write(f'{v[0]:.6f} {v[1]:.6f} {v[2]:.6f}\n')
    return p


def main():
    for n, fn in (('day', day), ('night', night), ('none', lambda c: c)):
        print(write(n, fn))


if __name__ == '__main__':
    main()
