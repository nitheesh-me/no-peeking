"""NO PEEKING! audio DSP helpers (numpy/scipy only).

Shared by build_library.py, design.py, score.py, beds.py and mix.py.
All audio is float64 numpy arrays shaped (n, 2) at SR = 48 kHz unless noted.
Loudness follows ITU-R BS.1770-4 / EBU R128 (K-weighting, 400 ms momentary, 3 s short-term,
gated integrated); true peak is measured on a 4x oversampled signal.
"""
from __future__ import annotations

import json
import subprocess
import wave
from pathlib import Path

import numpy as np
from scipy import signal

SR = 48000
FPS = 60


# ───────────────────────── I/O ─────────────────────────
def read_wav(path, sr: int = SR) -> np.ndarray:
    """Read any WAV (16/24/32-bit int or 32-bit float); anything else is decoded by ffmpeg."""
    path = str(path)
    try:
        with wave.open(path, 'rb') as w:
            ch, sw, fr, n = w.getnchannels(), w.getsampwidth(), w.getframerate(), w.getnframes()
            raw = w.readframes(n)
        if fr != sr:
            raise wave.Error('resample')
        if sw == 2:
            x = np.frombuffer(raw, '<i2').astype(np.float64) / 32768.0
        elif sw == 3:
            b = np.frombuffer(raw, np.uint8).reshape(-1, 3)
            i = (b[:, 0].astype(np.int32) | (b[:, 1].astype(np.int32) << 8) | (b[:, 2].astype(np.int32) << 16))
            i = np.where(i >= 1 << 23, i - (1 << 24), i)
            x = i.astype(np.float64) / float(1 << 23)
        elif sw == 4:
            x = np.frombuffer(raw, '<i4').astype(np.float64) / float(1 << 31)
        else:
            raise wave.Error('width')
        x = x.reshape(-1, ch)
    except (wave.Error, EOFError):
        out = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-f', 'f32le', '-ac', '2', '-ar', str(sr), '-'],
                             check=True, capture_output=True).stdout
        x = np.frombuffer(out, '<f4').astype(np.float64).reshape(-1, 2)
    if x.shape[1] == 1:
        x = np.repeat(x, 2, axis=1)
    return x[:, :2].copy()


def write_wav(path, x: np.ndarray, bits: int = 24, sr: int = SR) -> None:
    """Write stereo PCM WAV (24-bit default) with TPDF dither; clips at full scale."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    x = np.ascontiguousarray(x, np.float64)
    if x.ndim == 1:
        x = np.stack([x, x], 1)
    rng = np.random.default_rng(12345)
    if bits == 24:
        q = float(1 << 23)
        d = (rng.random(x.shape) - rng.random(x.shape))  # TPDF, ±1 LSB
        i = np.clip(np.round(x * q + d), -q, q - 1).astype(np.int32)
        b = np.ascontiguousarray(i.astype('<i4')).view(np.uint8).reshape(-1, 4)[:, :3]
        raw = b.tobytes()
        sw = 3
    elif bits == 16:
        q = 32768.0
        d = (rng.random(x.shape) - rng.random(x.shape))
        raw = np.clip(np.round(x * q + d), -q, q - 1).astype('<i2').tobytes()
        sw = 2
    elif bits == 32:  # IEEE float (stems that may exceed 0 dBFS before the limiter)
        import struct
        data = x.astype('<f4').tobytes()
        ch = x.shape[1]
        hdr = b'RIFF' + struct.pack('<I', 36 + len(data)) + b'WAVE' + b'fmt ' + struct.pack('<IHHIIHH', 16, 3, ch, sr, sr * ch * 4, ch * 4, 32)
        path.write_bytes(hdr + b'data' + struct.pack('<I', len(data)) + data)
        return
    else:
        raise ValueError(bits)
    with wave.open(str(path), 'wb') as w:
        w.setnchannels(x.shape[1])
        w.setsampwidth(sw)
        w.setframerate(sr)
        w.writeframes(raw)


def save_json(path, obj) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(obj, indent=1, default=lambda o: float(o) if isinstance(o, np.floating) else str(o)))


# ───────────────────────── basics ─────────────────────────
def db(x):
    return 20 * np.log10(np.maximum(np.abs(x), 1e-12))


def undb(d):
    return 10 ** (np.asarray(d) / 20.0)


def silence(sec: float) -> np.ndarray:
    return np.zeros((int(round(sec * SR)), 2))


def stereo(m: np.ndarray, pan: float = 0.0) -> np.ndarray:
    """Mono → stereo with an equal-power pan (-1..1)."""
    a = (pan + 1) * np.pi / 4
    return np.stack([m * np.cos(a), m * np.sin(a)], 1) * np.sqrt(2)


def place(dst: np.ndarray, src: np.ndarray, at: int, gain: float = 1.0) -> None:
    """Add src into dst at sample index `at` (clipped to bounds, negative `at` trims the head)."""
    if at < 0:
        src = src[-at:]
        at = 0
    n = min(len(src), len(dst) - at)
    if n > 0:
        dst[at:at + n] += src[:n] * gain


def fit(x: np.ndarray, n: int) -> np.ndarray:
    if len(x) >= n:
        return x[:n]
    return np.concatenate([x, np.zeros((n - len(x),) + x.shape[1:])])


def trim_silence(x: np.ndarray, thresh_db: float = -70, pre: float = 0.0, tail: float = 0.05) -> np.ndarray:
    a = np.max(np.abs(x), axis=1)
    idx = np.nonzero(a > undb(thresh_db))[0]
    if not len(idx):
        return x[:1]
    s = max(0, idx[0] - int(pre * SR))
    e = min(len(x), idx[-1] + int(tail * SR))
    return x[s:e]


def fade(x: np.ndarray, fin: float = 0.0, fout: float = 0.0) -> np.ndarray:
    x = x.copy()
    if fin > 0:
        n = min(len(x), int(fin * SR))
        x[:n] *= np.linspace(0, 1, n)[:, None] ** 2
    if fout > 0:
        n = min(len(x), int(fout * SR))
        x[len(x) - n:] *= (np.linspace(1, 0, n) ** 2)[:, None]
    return x


def env_exp(n: int, a: float, d: float, peak: float = 1.0) -> np.ndarray:
    """Attack (linear, seconds) then exponential decay with time constant ~d/6.9 (−60 dB at d)."""
    t = np.arange(n) / SR
    e = np.where(t < a, t / max(a, 1e-6), np.exp(-(t - a) * 6.9 / max(d, 1e-6)))
    return e * peak


# ───────────────────────── filters ─────────────────────────
def _sos_apply(sos, x, zero_phase=False):
    return signal.sosfiltfilt(sos, x, axis=0) if zero_phase else signal.sosfilt(sos, x, axis=0)


def lowpass(x, f, order=4, zp=False):
    return _sos_apply(signal.butter(order, min(f, SR / 2 * 0.99), 'low', fs=SR, output='sos'), x, zp)


def highpass(x, f, order=4, zp=False):
    return _sos_apply(signal.butter(order, f, 'high', fs=SR, output='sos'), x, zp)


def bandpass(x, f1, f2, order=2, zp=False):
    return _sos_apply(signal.butter(order, [f1, min(f2, SR / 2 * 0.99)], 'band', fs=SR, output='sos'), x, zp)


def _biquad(kind, f0, gain_db, q):
    A = 10 ** (gain_db / 40)
    w = 2 * np.pi * f0 / SR
    al = np.sin(w) / (2 * q)
    c = np.cos(w)
    if kind == 'peak':
        b = [1 + al * A, -2 * c, 1 - al * A]
        a = [1 + al / A, -2 * c, 1 - al / A]
    elif kind == 'lowshelf':
        s = 2 * np.sqrt(A) * al
        b = [A * ((A + 1) - (A - 1) * c + s), 2 * A * ((A - 1) - (A + 1) * c), A * ((A + 1) - (A - 1) * c - s)]
        a = [(A + 1) + (A - 1) * c + s, -2 * ((A - 1) + (A + 1) * c), (A + 1) + (A - 1) * c - s]
    elif kind == 'highshelf':
        s = 2 * np.sqrt(A) * al
        b = [A * ((A + 1) + (A - 1) * c + s), -2 * A * ((A - 1) + (A + 1) * c), A * ((A + 1) + (A - 1) * c - s)]
        a = [(A + 1) - (A - 1) * c + s, 2 * ((A - 1) - (A + 1) * c), (A + 1) - (A - 1) * c - s]
    else:
        raise ValueError(kind)
    b = np.array(b) / a[0]
    a = np.array(a) / a[0]
    return np.concatenate([b, a])[None, :]


def eq(x, kind, f0, gain_db, q=0.707):
    return signal.sosfilt(_biquad(kind, f0, gain_db, q), x, axis=0)


def presence(x, gain_db=3.5):
    """The 2–4 kHz presence lift: a broad peak at 2.8 kHz (Q≈0.9 spans ~2–4 kHz)."""
    return eq(x, 'peak', 2800, gain_db, 0.9)


# ───────────────────────── loudness (BS.1770-4) ─────────────────────────
_KW = np.array([
    [1.53512485958697, -2.69169618940638, 1.19839281085285, 1.0, -1.69065929318241, 0.73248077421585],
    [1.0, -2.0, 1.0, 1.0, -1.99004745483398, 0.99007225036621],
])


def kweight(x):
    return signal.sosfilt(_KW, x, axis=0)


def _ms_windows(x, win, hop):
    """Mean-square (summed over channels) of K-weighted x in sliding windows; returns array per hop."""
    k = kweight(x)
    p = np.sum(k * k, axis=1)
    c = np.concatenate([[0.0], np.cumsum(p)])
    w = int(win * SR)
    h = int(hop * SR)
    if len(p) < w:
        return np.array([c[-1] / max(w, 1)])
    starts = np.arange(0, len(p) - w + 1, h)
    return (c[starts + w] - c[starts]) / w


def lufs_from_ms(ms):
    return -0.691 + 10 * np.log10(np.maximum(ms, 1e-20))


def momentary(x, hop=0.1):
    """Momentary loudness series (400 ms window), one value per `hop` seconds."""
    return lufs_from_ms(_ms_windows(x, 0.4, hop))


def short_term(x, hop=0.1):
    return lufs_from_ms(_ms_windows(x, 3.0, hop))


def integrated(x) -> float:
    ms = _ms_windows(x, 0.4, 0.1)
    l = lufs_from_ms(ms)
    g = ms[l > -70]
    if not len(g):
        return -70.0
    rel = lufs_from_ms(np.mean(g)) - 10
    g2 = ms[(l > -70) & (l > rel)]
    return float(lufs_from_ms(np.mean(g2))) if len(g2) else -70.0


def true_peak_db(x) -> float:
    up = signal.resample_poly(x, 4, 1, axis=0)
    return float(db(np.max(np.abs(up))))


def sample_peak_db(x) -> float:
    return float(db(np.max(np.abs(x))))


def loudness_report(x) -> dict:
    st = short_term(x)
    stv = st[st > -70]
    lra = float(np.percentile(stv, 95) - np.percentile(stv, 10)) if len(stv) > 2 else 0.0
    return {'integrated_lufs': round(integrated(x), 2), 'true_peak_dbtp': round(true_peak_db(x), 2),
            'sample_peak_dbfs': round(sample_peak_db(x), 2), 'lra_lu': round(lra, 1),
            'max_momentary_lufs': round(float(np.max(momentary(x))), 2), 'duration_s': round(len(x) / SR, 3)}


def normalize_lufs(x, target):
    return x * undb(target - integrated(x))


def normalize_peak(x, target_db=-1.0):
    p = np.max(np.abs(x))
    return x * (undb(target_db) / p) if p > 0 else x


def ffmpeg_ebur128(path) -> dict:
    """Independent check with ffmpeg's ebur128 (the QA gate's meter)."""
    r = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', str(path), '-af', 'ebur128=peak=true', '-f', 'null', '-'],
                       capture_output=True, text=True).stderr
    tail = r[r.rfind('Summary:'):]
    out = {}
    import re
    m = re.search(r'I:\s+(-?[\d.]+) LUFS', tail)
    out['I'] = float(m.group(1)) if m else None
    m = re.search(r'LRA:\s+(-?[\d.]+) LU', tail)
    out['LRA'] = float(m.group(1)) if m else None
    m = re.search(r'Peak:\s+(-?[\d.]+|-inf) dBFS', tail)
    out['TP'] = float(m.group(1)) if m and m.group(1) != '-inf' else None
    return out


# ───────────────────────── dynamics ─────────────────────────
def _movmax(a, w):
    from scipy.ndimage import maximum_filter1d
    return maximum_filter1d(a, size=max(1, w), mode='nearest')


def limiter(x, ceiling_db=-1.2, lookahead=0.005, release=0.08, iters=4):
    """Lookahead brickwall limiter on a 4x-oversampled peak detector (true-peak aware)."""
    from scipy.ndimage import minimum_filter1d, uniform_filter1d
    y = x.copy()
    ceil = undb(ceiling_db)
    B = 16  # gain computed on 16-sample blocks (0.33 ms), then smoothed back to samples
    for _ in range(iters):
        up = signal.resample_poly(y, 4, 1, axis=0)
        pk = np.max(np.abs(up), axis=1)
        pk = fit(pk[:, None], 4 * len(y))[:, 0].reshape(-1, 4).max(axis=1)
        g = np.minimum(1.0, ceil / np.maximum(pk, 1e-9))
        if g.min() >= 0.9999:
            break
        la = int(lookahead * SR)
        g = minimum_filter1d(g, size=2 * la + 1, mode='nearest')
        nb = len(g) // B + 1
        gb = fit(g[:, None], nb * B)[:, 0]
        gb[len(g):] = 1.0
        gb = gb.reshape(nb, B).min(axis=1)
        sm = _onepole_release_blocks(gb, release, B)
        out = np.repeat(sm, B)[:len(g)]
        out = uniform_filter1d(out, size=la + 1, mode='nearest')
        out = np.minimum(out, g)
        y = y * out[:, None]
    return y


def _onepole_release_blocks(g, release, B):
    a = np.exp(-B / (release * SR))
    out = np.empty_like(g)
    cur = 1.0
    for i in range(len(g)):
        gi = g[i]
        cur = gi if gi < cur else gi + (cur - gi) * a
        out[i] = cur
    return out


def _onepole_release(g, release):
    """Gain smoothing: instant down, exponential up (vectorised via scipy lfilter where possible)."""
    a = np.exp(-1.0 / (release * SR))
    out = np.empty_like(g)
    cur = 1.0
    for i in range(len(g)):
        gi = g[i]
        cur = gi if gi < cur else gi + (cur - gi) * a
        out[i] = cur
    return out


def envelope(x, attack=0.001, release=0.05):
    """Peak envelope follower (mono), downsampled-safe python loop on 1 ms blocks."""
    m = np.max(np.abs(x), axis=1) if x.ndim == 2 else np.abs(x)
    blk = SR // 1000
    nb = len(m) // blk + 1
    mb = fit(m[:, None], nb * blk)[:, 0].reshape(nb, blk).max(axis=1)
    aa = np.exp(-1.0 / (attack * 1000))
    ra = np.exp(-1.0 / (release * 1000))
    e = np.empty(nb)
    cur = 0.0
    for i in range(nb):
        v = mb[i]
        cur = v + (cur - v) * (aa if v > cur else ra)
        e[i] = cur
    return np.repeat(e, blk)[:len(m)]


def transient_shape(x, attack_gain_db=6.0, sustain_gain_db=0.0):
    """Differential-envelope transient shaper: boosts the first ms of each onset by up to attack_gain_db."""
    fast = envelope(x, 0.0005, 0.02) + 1e-9
    slow = envelope(x, 0.015, 0.12) + 1e-9
    ratio = np.clip(fast / slow, 1.0, 8.0)
    g_att = undb(attack_gain_db * np.clip((ratio - 1) / 3.0, 0, 1))
    g_sus = undb(sustain_gain_db * np.clip(1 - (ratio - 1) / 3.0, 0, 1))
    return x * (g_att * g_sus)[:, None]


def soft_clip(x, drive_db=0.0):
    d = undb(drive_db)
    return np.tanh(x * d) / np.tanh(d) if d > 1 else np.tanh(x)


# ───────────────────────── reverb / space ─────────────────────────
def make_ir(seconds=2.4, decay=3.0, predelay=0.02, damp_hz=6000, seed=7, width=1.0, early=True):
    """Stereo noise IR: exponential decay, frequency-dependent damping (darker tail), early reflections."""
    rng = np.random.default_rng(seed)
    n = int(seconds * SR)
    t = np.arange(n) / SR
    noise = rng.standard_normal((n, 2))
    noise[:, 1] = width * noise[:, 1] + (1 - width) * noise[:, 0]
    env = np.exp(-t * decay * 2.3)
    bright = noise * env[:, None]
    dark = lowpass(noise, damp_hz * 0.35, 2) * np.exp(-t * decay * 1.4)[:, None]
    mix_t = np.clip(t / seconds * 2, 0, 1)[:, None]
    ir = lowpass(bright, damp_hz, 2) * (1 - mix_t) + dark * mix_t * 1.6
    if early:
        for k, (dt, g) in enumerate([(0.011, 0.5), (0.017, 0.4), (0.023, 0.35), (0.031, 0.3), (0.043, 0.22)]):
            i = int(dt * SR)
            ir[i, k % 2] += g
    ir = np.concatenate([np.zeros((int(predelay * SR), 2)), ir])
    return ir / np.sqrt(np.sum(ir ** 2) / 2)


def reverb(x, ir, wet=0.3, dry=1.0):
    y = signal.fftconvolve(x, ir[:, :2], axes=0, mode='full')[:len(x) + len(ir) - 1]
    xx = fit(x, len(y))
    return xx * dry + y * wet


# ───────────────────────── synthesis primitives ─────────────────────────
def t_axis(sec):
    return np.arange(int(round(sec * SR))) / SR


def sine_sweep(f0, f1, sec, curve='exp'):
    t = t_axis(sec)
    if curve == 'exp':
        f = f0 * (f1 / f0) ** (t / sec)
    else:
        f = f0 + (f1 - f0) * t / sec
    return np.sin(2 * np.pi * np.cumsum(f) / SR), f


def sub_thump(freq=52.0, sec=0.18, drop=1.6, peak=1.0):
    """Sub thump: sine falling from freq*drop to freq over 60 ms, 40–60 Hz body, 60 ms-ish decay."""
    t = t_axis(sec)
    f = freq + (freq * drop - freq) * np.exp(-t / 0.025)
    ph = 2 * np.pi * np.cumsum(f) / SR
    e = (1 - np.exp(-t / 0.002)) * np.exp(-t / 0.055)
    return np.sin(ph) * e * peak


def noise(sec, seed=0, color='white'):
    rng = np.random.default_rng(seed)
    n = rng.standard_normal(int(round(sec * SR)))
    if color == 'pink':
        f = np.fft.rfft(n)
        k = np.arange(len(f))
        k[0] = 1
        n = np.fft.irfft(f / np.sqrt(k), len(n))
    elif color == 'brown':
        n = np.cumsum(n)
        n = signal.lfilter([1], [1, -0.995], np.diff(np.concatenate([[0], n])))
    return n / (np.std(n) + 1e-12)


def pitch_resample(x, ratio):
    """Varispeed by `ratio` (2.0 = octave up, half length)."""
    if abs(ratio - 1) < 1e-4:
        return x
    from fractions import Fraction
    fr = Fraction(1 / ratio).limit_denominator(400)
    return signal.resample_poly(x, fr.numerator, fr.denominator, axis=0)


def midi_hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)


def spectrogram_png(x, path, title='', dur=None, marks=None):
    """Listen-proxy: log-frequency spectrogram (top) + momentary loudness (bottom) as PNG."""
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    m = x.mean(axis=1)
    f, t, S = signal.spectrogram(m, SR, nperseg=2048, noverlap=1536, scaling='spectrum')
    fig, ax = plt.subplots(2, 1, figsize=(14, 6), sharex=True, gridspec_kw={'height_ratios': [3, 1]})
    ax[0].pcolormesh(t, np.maximum(f, 20), 10 * np.log10(S + 1e-14), shading='auto', cmap='magma', vmin=-110, vmax=-20)
    ax[0].set_yscale('log')
    ax[0].set_ylim(25, 20000)
    ax[0].set_ylabel('Hz')
    ax[0].set_title(title)
    mo = momentary(x, 0.05)
    ax[1].plot(np.arange(len(mo)) * 0.05 + 0.2, mo, lw=0.8, color='#6c63ff')
    ax[1].set_ylim(-60, 0)
    ax[1].set_ylabel('LUFS-M')
    ax[1].grid(alpha=0.3)
    if marks:
        for tt, lab in marks:
            for a in ax:
                a.axvline(tt, color='#3ddc97', lw=0.6, alpha=0.7)
            ax[0].text(tt, 16000, lab, color='w', fontsize=6, rotation=90, va='top')
    ax[1].set_xlabel('s')
    fig.tight_layout()
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(path, dpi=90)
    plt.close(fig)
