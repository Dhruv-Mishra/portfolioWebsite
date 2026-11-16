"""Build the CC0 surface textures in public/resources/textures/.

Downloads the source scans (ambientCG and Poly Haven, both CC0 1.0) into a cache
directory and regenerates every texture deterministically: tileable gray-50 detail
maps (128 = neutral for soft-light/overlay), colour tiles, procedural RGBA overlays
and the torn-edge SVG masks.

Usage (from portfolio/):
    python scripts/build-textures.py [--cache DIR] [--out DIR]
    TEXTURE_CACHE=DIR python scripts/build-textures.py

Requires Python 3.11+, numpy and Pillow (with WebP). The cache defaults to a temp dir.

/resources is served with immutable cache headers: when you change a texture, give
the output a new file name and update its references instead of overwriting it.
"""
import argparse
import io
import json
import os
import tempfile
import urllib.request
import zipfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parents[1] / "public" / "resources" / "textures"
UA = {"User-Agent": "Mozilla/5.0 (portfolio build-textures)"}
SOURCES = {
    "paper": ("ambientcg", "Paper001", "2K"),
    "canvas": ("polyhaven", "rough_linen", "2k"),
    "slate": ("ambientcg", "Plaster003", "2K"),
    "cork": ("ambientcg", "Cork004", "1K"),
    "burlap": ("polyhaven", "hessian_380", "2k"),
    "cardboard": ("ambientcg", "Paper006", "1K"),
    "wood": ("polyhaven", "oak_veneer_01", "1k"),
}


def get(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=300) as r:
        return r.read()


def fetch(key, cache):
    """Return (colour map, OpenGL normal map) for a source, downloading once into cache."""
    provider, aid, res = SOURCES[key]
    d = Path(cache) / f"{aid}_{res}"
    if not d.is_dir():
        d.mkdir(parents=True)
        if provider == "ambientcg":
            z = zipfile.ZipFile(io.BytesIO(get(f"https://ambientcg.com/get?file={aid}_{res}-JPG.zip")))
            for n in z.namelist():
                if n.endswith(("_Color.jpg", "_NormalGL.jpg")):
                    (d / ("color.jpg" if "_Color" in n else "normal.jpg")).write_bytes(z.read(n))
        else:
            files = json.loads(get(f"https://api.polyhaven.com/files/{aid}"))
            for k, name in (("Diffuse", "color.jpg"), ("nor_gl", "normal.jpg")):
                (d / name).write_bytes(get(files[k][res]["jpg"]["url"]))
    rgb = lambda p: np.asarray(Image.open(p).convert("RGB"), np.float64) / 255
    return rgb(d / "color.jpg"), rgb(d / "normal.jpg")


# ---------------------------------------------------------------- image helpers
def blur(a, sy, sx=None):
    """Periodic Gaussian blur via FFT (2-D arrays)."""
    sx = sy if sx is None else sx
    fy, fx = np.fft.fftfreq(a.shape[0])[:, None], np.fft.fftfreq(a.shape[1])[None, :]
    return np.real(np.fft.ifft2(np.fft.fft2(a) * np.exp(-2 * np.pi ** 2 * ((fy * sy) ** 2 + (fx * sx) ** 2))))


def chans(f, a):
    return f(a) if a.ndim == 2 else np.stack([f(a[..., c]) for c in range(a.shape[2])], -1)


def blur_reflect(a, s):
    p = int(3 * s) + 1
    return chans(lambda c: blur(np.pad(c, p, mode="reflect"), s)[p:-p, p:-p], a)


def highpass(a, s):
    """Remove lighting gradients: subtract a heavy blur, keep the mean."""
    return a - blur_reflect(a, s) + a.mean(axis=(0, 1))


def even_out(g, s):
    """Local contrast normalisation so grain density is uniform (no patchy repeats when tiled)."""
    g = g - g.mean()
    return g / np.sqrt(blur_reflect(g * g, s) + 1e-9)


def noise(rng, n, sy, sx=None, m=None):
    a = blur(rng.standard_normal((n, m or n)), sy, sx)
    return (a - a.mean()) / a.std()


def smoothstep(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def lum(rgb):
    return rgb @ np.array([0.2126, 0.7152, 0.0722])


def shade(nrm, light=(-0.55, 0.55, 0.63)):
    """Raking light from the top-left on an OpenGL normal map; flat surface = 0."""
    l = np.array(light) / np.linalg.norm(light)
    return (nrm * 2 - 1) @ l - l[2]


def resize(a, w, h):
    f = lambda c: np.asarray(Image.fromarray(c.astype(np.float32), "F").resize((w, h), Image.LANCZOS), np.float64)
    return chans(f, a)


def crossfade(a, n, b, search):
    """Make axis 1 wrap at the best-matching period in n±search by blending the strip after it into the start."""
    g = a if a.ndim == 2 else a.mean(-1)
    z = lambda s: s - s.mean()
    head = z(g[:, :b])
    corr = lambda d: (head * z(g[:, d:d + b])).sum() / np.sqrt((head ** 2).sum() * (z(g[:, d:d + b]) ** 2).sum())
    rho, d = max((corr(d), d) for d in range(n - search, n + search + 1))
    t = smoothstep(0, 1, (np.arange(b) + 0.5) / b).reshape((1, b) + (1,) * (a.ndim - 2))
    m = a.mean(axis=(0, 1))
    mix = (a[:, d:d + b] * (1 - t) + a[:, :b] * t - m) / np.sqrt(t * t + (1 - t) ** 2 + 2 * max(rho, 0) * t * (1 - t)) + m
    return np.concatenate([mix, a[:, b:d]], axis=1)


def tile(a, n, ny=None, b=96, search=(0, 0), at=(0, 0), scale=1.0):
    """Cut a seamless n×ny tile from a (optionally rescaled) source image."""
    ny = ny or n
    if scale != 1:
        a = resize(a, round(a.shape[1] * scale), round(a.shape[0] * scale))
    a = a[at[0]:at[0] + ny + search[1] + b, at[1]:at[1] + n + search[0] + b]
    a = crossfade(a, n, b, search[0])
    a = np.swapaxes(crossfade(np.swapaxes(a, 0, 1), ny, b, search[1]), 0, 1)
    if a.shape[:2] != (ny, n):  # resample the 3x3 wrap so the tile stays periodic
        a = resize(np.tile(a, (3, 3) + (1,) * (a.ndim - 2)), 3 * n, 3 * ny)[ny:2 * ny, n:2 * n]
    return a


def gray50(g, std):
    return np.clip((g - g.mean()) / g.std() * std + 128, 0, 255)


# ---------------------------------------------------------------- sourced tiles
def paper(cache):
    c, n = fetch("paper", cache)
    g = highpass(0.8 * lum(c) / lum(c).std() + 0.45 * shade(n) / shade(n).std(), 28)
    return gray50(tile(g, 512, at=(20, 200), scale=0.55), 10.5)


def canvas(cache):
    c, n = fetch("canvas", cache)
    g = highpass(0.7 * lum(c) / lum(c).std() + 0.7 * shade(n) / shade(n).std(), 12)
    return gray50(tile(g, 512, b=64, search=(8, 8), at=(700, 700)), 16)


def slate(cache):
    c, n = fetch("slate", cache)
    g = highpass(lum(c) / lum(c).std() + 0.6 * shade(n) / shade(n).std(), 10)
    g = np.clip(even_out(resize(g, 1024, 1024), 24), -3, 3)  # also hides a few bright pits
    return gray50(tile(g, 512, at=(50, 50)), 7.5)


def cork(cache):
    c, _ = fetch("cork", cache)
    c = tile(highpass(c, 40), 512, at=(80, 80), scale=0.75)
    return 255 * np.clip(c, 0, 1) ** 0.72


def burlap(cache):
    c, _ = fetch("burlap", cache)
    return 255 * np.clip(tile(highpass(c, 48), 512, b=64, search=(14, 14), at=(600, 600)), 0, 1)


def cardboard(cache):
    c, _ = fetch("cardboard", cache)
    return 255 * np.clip(tile(highpass(c, 40), 512, b=128, at=(150, 150)), 0, 1)


def wood(cache):
    c, _ = fetch("wood", cache)
    c = np.rot90(highpass(c, 60))  # grain runs horizontally
    return 255 * np.clip(tile(c, 512, 256, b=96, search=(0, 24), at=(300, 200)), 0, 1)


# ---------------------------------------------------------------- procedural overlays
def chalk_grain(n=256, seed=10):
    """Mask alpha: chalk dragged over slate (horizontal streaks, many small dropouts), mean ≈ 175."""
    rng = np.random.default_rng(seed)
    v = 0.6 * noise(rng, n, 0.6, 5) + 0.6 * noise(rng, n, 0.55) + 0.3 * noise(rng, n, 2, 8) + 0.12 * noise(rng, n, 12, 24)
    body = 0.88 + 0.06 * np.clip(noise(rng, n, 0.7), -2, 2)
    lo, hi = -3.0, 3.0
    for _ in range(40):  # bisect the coverage threshold
        t = (lo + hi) / 2
        a = 255 * body / (1 + np.exp(-(v - t) / 0.18))
        lo, hi = (t, hi) if a.mean() > 175 else (lo, t)
    return a


def wrap_apply(acc, patch, y0, x0, op):
    iy, ix = np.arange(y0, y0 + patch.shape[0]) % acc.shape[0], np.arange(x0, x0 + patch.shape[1]) % acc.shape[1]
    acc[np.ix_(iy, ix)] = op(acc[np.ix_(iy, ix)], patch)


def swipe(rng, acc, erased, cloud, c, R, a_mid, length, width, strength):
    """One curved felt-eraser stroke: soft residue band with streaks along the motion."""
    angs = a_mid + np.linspace(-0.5, 0.5, 32) * length / R
    px, py, pad = c[0] + R * np.cos(angs), c[1] + R * np.sin(angs), width / 2 + 4
    y0, x0 = int(py.min() - pad), int(px.min() - pad)
    yy, xx = np.mgrid[y0:int(py.max() + pad) + 1, x0:int(px.max() + pad) + 1].astype(float)
    th = (np.arctan2(yy - c[1], xx - c[0]) - a_mid + np.pi) % (2 * np.pi) - np.pi
    u, v, hw = np.hypot(xx - c[0], yy - c[1]) - R, th * R, width / 2
    across = smoothstep(hw, hw - 22, np.abs(u))
    along = smoothstep(-length / 2, 60 - length / 2, v) * smoothstep(length / 2, length / 2 - 160, v)
    m = int(width) + 64
    s2 = np.convolve(rng.standard_normal(m), np.exp(-np.linspace(-3, 3, 31) ** 2), "same")
    idx = np.clip(u + 4 * np.sin(v / rng.uniform(50, 110) + rng.uniform(0, 6)) + m / 2, 0, m - 1)
    st = 0.7 + 0.32 * np.interp(idx, np.arange(m), s2 / s2.std())
    cl = np.clip(0.75 + 0.45 * cloud[np.ix_(np.arange(y0, y0 + u.shape[0]) % acc.shape[0], np.arange(x0, x0 + u.shape[1]) % acc.shape[1])], 0.15, 1.5)
    edge = 0.35 * np.exp(-((np.abs(u) - hw + 12) / 9) ** 2)  # chalk pushed to the swipe borders
    fade = 0.55 + 0.45 * smoothstep(-length / 2, length / 2, v)
    wrap_apply(acc, strength * fade * cl * along * (across * np.clip(st, 0, 1.4) + edge), y0, x0, np.add)
    wrap_apply(erased, across * along, y0, x0, np.maximum)


def cursive(rng, x, y, letters, h):
    """Fake joined handwriting: a prolate cycloid with per-letter width, height, loop and descender variation."""
    out, slope, x_line = [], rng.normal(0, 0.03), x
    while letters > 0:
        wl = min(int(rng.integers(2, 7)), letters)
        letters -= wl
        t = np.linspace(0, wl * 2 * np.pi, wl * 24)
        c = np.arange(wl) * 2 * np.pi + np.pi
        knots = np.concatenate([[0], np.cumsum(rng.uniform(0.4, 0.8, wl))]) * h
        tall = np.where(rng.random(wl) < 0.25, rng.uniform(1.7, 2.2, wl), rng.uniform(0.85, 1.1, wl))
        desc = np.where(rng.random(wl) < 0.15, rng.uniform(0.6, 0.9, wl), 0)
        loop = np.interp(t, c, rng.uniform(-0.4, 0.9, wl)) * h * 0.3
        ph = t % (2 * np.pi)
        px = x + np.interp(t, np.arange(wl + 1) * 2 * np.pi, knots) - loop * np.sin(t)
        drop = np.interp(t, c, desc) * h * np.where(ph > 1.4 * np.pi, np.sin((ph - 1.4 * np.pi) / 0.6) ** 2, 0)
        py = y + (px - x_line) * slope - np.interp(t, c, tall) * h * 0.25 * (1 - np.cos(t)) + drop
        out.append(list(zip(px, py)))
        x = px[-1] + h * rng.uniform(0.5, 0.9)
    return out


def chalk_smudge(n=1024, seed=20):
    """Alpha of a used blackboard: dust haze, overlapping eraser arcs, half-erased writing."""
    rng = np.random.default_rng(seed)
    a = np.clip(0.5 + 0.5 * (0.7 * noise(rng, n, 90) + 0.3 * noise(rng, n, 25)), 0, None) * 6 + 2
    cloud = noise(rng, n, 22)
    sw, erased = np.zeros((n, n)), np.zeros((n, n))
    for g in rng.permutation(9)[:7]:  # wiping sessions on a jittered 3x3 grid
        mid = (np.array([g % 3, g // 3]) + rng.uniform(0.15, 0.85, 2)) * n / 3
        R, a_mid, width = rng.uniform(300, 800), rng.uniform(0, 2 * np.pi), rng.uniform(90, 150)
        for k in range(int(rng.integers(2, 5))):
            swipe(rng, sw, erased, cloud, mid - R * np.array([np.cos(a_mid), np.sin(a_mid)]),
                  R + (k - 1) * width * rng.uniform(0.5, 0.75), a_mid + rng.uniform(-0.12, 0.12),
                  rng.uniform(260, 560), width, rng.uniform(8, 15))
    img = Image.new("L", (n, n), 0)
    d = ImageDraw.Draw(img)
    strokes = []
    for _ in range(4):  # a few lines of writing
        x, y, h = *rng.uniform(0, n, 2), rng.uniform(30, 44)
        for row in range(int(rng.integers(1, 3))):
            strokes += cursive(rng, x + rng.normal(0, 8), y + row * h * 1.9, int(rng.integers(8, 16)), h)
    for _ in range(4):  # underlines and fraction bars
        x, y, L, ang = *rng.uniform(0, n, 2), rng.uniform(80, 240), rng.normal(0, 0.06)
        strokes.append([(x, y), (x + L * np.cos(ang), y + L * np.sin(ang))])
    for s in strokes:
        for ox in (-n, 0, n):
            for oy in (-n, 0, n):
                d.line([(px + ox, py + oy) for px, py in s], fill=255, width=4, joint="curve")
    rub = np.clip(0.4 + 0.45 * noise(rng, n, 30) + 0.2 * noise(rng, n, 2, 6), 0, 1)
    w = blur(np.asarray(img, float) / 255, 1.6) * rub * (1 - 0.8 * np.clip(erased, 0, 1)) * 26
    a = 55 * np.tanh((a + sw + w) / 55)
    return np.round(a / 2) * 2  # even levels halve the lossless alpha size; 2/255 steps are invisible


def coffee_ring(n=384, seed=30):
    """Alpha of a coffee-cup ring: crisp uneven rim, faint interior, a second partial ring and a drip."""
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:n, 0:n].astype(float)
    c = n / 2 + rng.normal(0, 3, 2)
    th, r = np.arctan2(yy - c[1], xx - c[0]), np.hypot(xx - c[0], yy - c[1])
    harm = lambda k, amp, p=1.1: sum(rng.normal(0, amp / f ** p) * np.cos(f * th + rng.uniform(0, 7)) for f in range(1, k + 1))
    arc = lambda at, w: smoothstep(w, 0, np.abs((th - at + np.pi) % (2 * np.pi) - np.pi))
    d = 146 + harm(12, 2.2) + harm(60, 0.3, 0.5) - r  # distance inside the rim
    inside = smoothstep(-0.9, 0.9, d)
    rim = (0.55 * np.exp(-np.clip(d, 0, None) / 2.5) + 0.45 * np.exp(-np.clip(d, 0, None) / (6 + harm(5, 1.5)).clip(4, 10))) * inside
    strength = np.clip(0.9 + 0.3 * harm(7, 1.0), 0.2, 1.15) * (1 - 0.85 * arc(2.2, 0.35))  # one broken section
    tide = sum(12 * np.exp(-((d - k) / 1.4) ** 2) * arc(rng.uniform(0, 7), 1.2) for k in (17 + harm(6, 2), 38 + harm(6, 3)))
    a = 140 * rim * strength * (1 + 0.2 * noise(rng, n, 1.0)) + inside * (np.clip(6 + 5 * noise(rng, n, 20) + 2 * noise(rng, n, 3), 0, 18) + tide)
    d2 = 144 + harm(10, 2) - np.hypot(xx - c[0] - 9, yy - c[1] + 6)  # cup set down twice
    a += 60 * np.exp(-np.clip(d2, 0, None) / 2.2) * smoothstep(-0.9, 0.9, d2) * arc(4.3, 0.7)
    rel = np.stack([xx - c[0], yy - c[1]], -1)
    drop = np.full((n, n), -9.0)  # splash: one elongated drop just outside the rim plus a few specks
    for dist, ang, ra, rb in ((164, 0.55, 7.5, 5), (178, 0.6, 2.2, 1.8), (184, 0.5, 1.3, 1.1), (160, 3.95, 1.7, 1.4)):
        u = np.array([np.cos(ang), np.sin(ang)])
        q = rel - dist * u
        drop = np.maximum(drop, (1 - np.hypot(q @ u / ra, q @ np.array([-u[1], u[0]]) / rb)) * rb)
    drop += 0.35 * noise(rng, n, 1.5)
    a += (80 * np.exp(-np.clip(drop, 0, None) / 1.3) + 14) * smoothstep(-0.7, 0.7, drop)
    return np.clip(a, 0, 150)


def foxing(n=512, seed=40):
    """RGBA of foxing: clustered small age spots and two faint tide-line water stains (tileable)."""
    rng = np.random.default_rng(seed)
    yy, xx = np.mgrid[0:n, 0:n].astype(float)
    wrapd = lambda p: ((xx - p[0] + n / 2) % n - n / 2, (yy - p[1] + n / 2) % n - n / 2)
    a = np.zeros((n, n))
    centres = rng.uniform(0, n, (6, 2))
    for _ in range(120):
        p = centres[rng.integers(6)] + rng.normal(0, 60, 2) if rng.random() < 0.7 else rng.uniform(0, n, 2)
        dx, dy = wrapd(p)
        rr = np.hypot(dx, dy) * (1 + 0.3 * rng.random() * np.sin(2 * np.arctan2(dy, dx) + rng.uniform(0, 7)))
        rad = rng.lognormal(0.5, 0.5)
        a = np.maximum(a, rng.uniform(15, 40) * (np.exp(-(rr / rad) ** 2) + 0.3 * np.exp(-(rr / (2.8 * rad)) ** 2)))
    for _ in range(2):
        dx, dy = wrapd(rng.uniform(0, n, 2))
        th, rot = np.arctan2(dy, dx), rng.uniform(0, np.pi)
        R = rng.uniform(75, 110) * (1 + 0.15 * np.cos(2 * (th - rot)))
        R = R * (1 + sum(rng.normal(0, 0.12 / f) * np.cos(f * th + rng.uniform(0, 7)) for f in range(2, 14)))
        d = R - np.hypot(dx, dy)
        part = np.clip(0.55 + 0.6 * np.cos(th - rng.uniform(0, 7)), 0, 1)  # the tide line fades out on one side
        a += smoothstep(-1.2, 1, d) * (26 * part * np.exp(-np.clip(d, 0, None) / 3.5) * np.clip(0.7 + 0.4 * noise(rng, n, 4), 0, 1.3)
                                        + np.clip(3 + 2 * noise(rng, n, 25), 0, 6))
    a = np.clip(a, 0, 60)
    rgb = np.array([0xa8, 0x87, 0x4f]) + np.clip(a / 40, 0, 1)[..., None] * (np.array([0x7a, 0x56, 0x2e]) - np.array([0xa8, 0x87, 0x4f]))
    return np.dstack([rgb, a])


def torn_svg(seed, side):
    """Repeating torn-paper edge mask (black = kept paper) for one side of a sheet."""
    rng = np.random.default_rng(seed)
    xs = np.arange(161) * 1.5  # 0..240
    base = sum(rng.normal(0, 1.0 if per >= 48 else 0.55) * np.sin(2 * np.pi * xs / per + rng.uniform(0, 7)) for per in (240, 120, 80, 60, 48, 40, 30))
    k = np.exp(-np.linspace(-2, 2, 5) ** 2)
    fine = np.real(np.fft.ifft(np.fft.fft(rng.standard_normal(160)) * np.fft.fft(k / k.sum(), 160)))
    jag = np.append(fine / fine.std() * 0.55 + rng.normal(0, 0.3, 160), 0)
    jag[-1] = jag[0]
    y = np.clip(9 + base / np.abs(base).max() * 3.4 + jag, 5, 13)
    pts = list(zip(xs, y))
    for i in sorted(rng.choice(np.arange(3, 157), 8, replace=False), reverse=True):  # fibres poking out
        x0, y0 = pts[i]
        pts[i + 1:i + 1] = [(x0 + 0.3, min(y0 + rng.uniform(1.2, 2.8), 15.6)), (x0 + 0.6, y0 + 0.2)]
    specks = [(xs[i] + rng.uniform(-1, 1), min(y[i] + rng.uniform(1.4, 2.6), 15.4), rng.uniform(0.3, 0.55)) for i in rng.integers(2, 158, 5)]
    tf = {"bottom": lambda x, v: (x, v), "top": lambda x, v: (x, 16 - v), "right": lambda x, v: (v, x), "left": lambda x, v: (16 - v, x)}[side]
    f = lambda v: f"{v:.1f}".rstrip("0").rstrip(".")
    xy = lambda x, v: "{},{}".format(*map(f, tf(x, v)))
    path = "M" + " ".join(xy(*p) for p in [(0, 0)] + pts + [(240, 0)]) + "Z"  # v=0 is the kept side
    dots = "".join('<circle cx="{}" cy="{}" r="{}"/>'.format(*map(f, tf(x, v)), f(rad)) for x, v, rad in specks)
    w, h = (240, 16) if side in ("top", "bottom") else (16, 240)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}" '
            f'preserveAspectRatio="none"><path d="{path}"/>{dots}</svg>\n')


# ---------------------------------------------------------------- output
def save(path, arr, budget, knob):
    """Encode as WebP, lowering `knob` (quality or alpha_quality) until it fits the byte budget; print stats."""
    mode = "L" if arr.ndim == 2 else ("RGB", "RGBA")[arr.shape[2] == 4]
    im = Image.fromarray(np.round(arr).clip(0, 255).astype(np.uint8), mode)
    opts = {"quality": 90, "alpha_quality": 100, "method": 6, "exact": True}
    lo, hi, best = 1, 100, None
    while lo <= hi:  # bisect for the highest setting that fits
        mid, buf = (lo + hi) // 2, io.BytesIO()
        im.save(buf, "WEBP", **{**opts, knob: mid})
        lo, hi, best = (mid + 1, hi, (mid, buf)) if buf.tell() <= budget else (lo, mid - 1, best)
    v, buf = best
    path.write_bytes(buf.getvalue())
    back = Image.open(path)
    px = np.asarray(back.convert("L" if mode == "L" else "RGB"), float)
    line = f"{path.name:18} {back.width}x{back.height} {mode:4} {knob}={v:<3} {path.stat().st_size:6} B  mean {px.mean():6.1f} std {px.std():5.1f}"
    if mode == "RGBA":
        al = np.asarray(back)[..., 3].astype(float)
        line += f"  alpha mean {al.mean():5.1f} p99 {np.percentile(al, 99):5.1f} max {al.max():3.0f}"
    print(line)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--cache", default=os.environ.get("TEXTURE_CACHE") or os.path.join(tempfile.gettempdir(), "portfolio-textures"))
    ap.add_argument("--out", default=OUT, type=Path)
    args = ap.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    white = lambda a: np.dstack([np.full(a.shape, 255.0)] * 3 + [a])
    jobs = [
        ("paper-grain", lambda: paper(args.cache), 35_000, "quality"),
        ("canvas-weave", lambda: canvas(args.cache), 35_000, "quality"),
        ("slate-grain", lambda: slate(args.cache), 30_000, "quality"),
        ("chalk-smudge", lambda: white(chalk_smudge()), 60_000, "alpha_quality"),
        ("cork", lambda: cork(args.cache), 45_000, "quality"),
        ("burlap", lambda: burlap(args.cache), 40_000, "quality"),
        ("cardboard", lambda: cardboard(args.cache), 30_000, "quality"),
        ("wood", lambda: wood(args.cache), 25_000, "quality"),
        ("chalk-grain", lambda: white(chalk_grain()), 25_000, "alpha_quality"),
        ("coffee-ring", lambda: np.dstack([np.full((384, 384, 3), (0x7A, 0x4A, 0x1E), float), coffee_ring()]), 25_000, "quality"),
        ("foxing", foxing, 25_000, "quality"),
    ]
    for name, make, budget, knob in jobs:
        save(args.out / f"{name}.webp", make(), budget, knob)
    for i, side in enumerate(("top", "bottom", "left", "right")):
        p = args.out / f"torn-{side}.svg"
        p.write_text(torn_svg(50 + i, side), encoding="utf-8", newline="\n")
        print(f"{p.name:18} {p.stat().st_size:6} B")


if __name__ == "__main__":
    main()
