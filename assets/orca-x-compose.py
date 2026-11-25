import sys, subprocess, math
import numpy as np
from PIL import Image, ImageFilter

SRC = sys.argv[1]
OUT = sys.argv[2]
PREVIEW = [float(x) for x in sys.argv[3:]]  # if given, write PNGs at these times instead

SW, SH = 1040, 770
CW = CH = 1200
FPS = 30
S = 1.12
VW, VH = round(SW * S), round(SH * S)          # 1165 x 862
X0, Y0 = (CW - VW) // 2, 78
# device frame in source coords: x 9.5..1034, y 117..761, radius ~13
FL, FR = X0 + 9.5 * S, X0 + 1034 * S
FT, FB = Y0 + 117 * S, Y0 + 761.5 * S
RAD = 14.0

yy, xx = np.mgrid[0:CH, 0:CW].astype(np.float32)
cx, cy = (FL + FR) / 2, (FT + FB) / 2
hx, hy = (FR - FL) / 2, (FB - FT) / 2
qx = np.abs(xx - cx) - (hx - RAD)
qy = np.abs(yy - cy) - (hy - RAD)
sdf = np.sqrt(np.maximum(qx, 0) ** 2 + np.maximum(qy, 0) ** 2) + np.minimum(np.maximum(qx, qy), 0) - RAD
inside = np.clip(0.5 - sdf, 0, 1)[..., None]
theta = np.arctan2((yy - cy) / hy, (xx - cx) / hx)  # normalised so speed is even-ish
ring = np.where(sdf > -2.5, np.exp(-np.maximum(sdf, 0) / 22.0), 0).astype(np.float32)
ring_core = np.exp(-np.abs(sdf) / 2.2).astype(np.float32)

# vignette
r2 = ((xx - CW / 2) / (CW * 0.62)) ** 2 + ((yy - CH * 0.48) / (CH * 0.62)) ** 2
vign = np.clip(1.0 - 0.55 * r2, 0.35, 1)[..., None].astype(np.float32)

BASE = np.array([7, 7, 11], np.float32) / 255
CYAN = np.array([56, 189, 248], np.float32) / 255
VIOL = np.array([139, 92, 246], np.float32) / 255
PINK = np.array([236, 72, 153], np.float32) / 255
TEAL = np.array([45, 212, 191], np.float32) / 255

# dot grid (static, faded radially, hidden under the window anyway)
dots = (((xx % 30) < 1.6) & ((yy % 30) < 1.6)).astype(np.float32)
dots *= np.clip(1.2 - np.sqrt(r2) * 1.1, 0, 1) * 0.07

# floor (perspective grid below the window)
below = yy > FB
dz = np.maximum(yy - FB, 0.5)
depth = 220.0 / dz                       # large near horizon
floor_fade = np.where(below, np.clip((yy - FB) / 40, 0, 1) * np.clip(1 - (yy - FB) / 340, 0, 1) ** 0.6, 0).astype(np.float32)
xpers = (xx - CW / 2) / dz * 2.2

# particles
rng = np.random.default_rng(7)
NP = 90
P = dict(x=rng.uniform(0, CW, NP), y=rng.uniform(0, CH, NP), sp=rng.uniform(8, 28, NP),
         sz=rng.uniform(1.0, 2.6, NP), br=rng.uniform(0.25, 0.9, NP), ph=rng.uniform(0, 6.28, NP),
         c=rng.integers(0, 3, NP))
PCOL = [CYAN, VIOL, TEAL]


def smooth(a, b, x):
    t = np.clip((x - a) / (b - a), 0, 1)
    return t * t * (3 - 2 * t)


def aurora(t):
    h = 120
    gy, gx = np.mgrid[0:h, 0:h].astype(np.float32) / h
    acc = np.zeros((h, h, 3), np.float32)
    blobs = [
        (0.20 + 0.10 * math.sin(t * 0.31), 0.05 + 0.05 * math.cos(t * 0.27), 0.30, VIOL, 0.55),
        (0.80 + 0.08 * math.cos(t * 0.23), 0.02 + 0.06 * math.sin(t * 0.35), 0.28, CYAN, 0.45),
        (0.50 + 0.25 * math.sin(t * 0.17), 0.95, 0.30, TEAL, 0.30),
        (0.10 + 0.05 * math.sin(t * 0.4), 0.90, 0.22, PINK, 0.16),
    ]
    for bx, by, rr, col, k in blobs:
        g = np.exp(-(((gx - bx) ** 2 + (gy - by) ** 2) / (2 * rr * rr)))
        acc += g[..., None] * col * k
    im = Image.fromarray((np.clip(acc, 0, 1) * 255).astype(np.uint8)).resize((CW, CH), Image.BICUBIC)
    return np.asarray(im, np.float32) / 255


def particles(t, buf):
    for i in range(NP):
        y = (P['y'][i] - P['sp'][i] * t) % CH
        x = P['x'][i] + 10 * math.sin(t * 0.5 + P['ph'][i])
        tw = 0.6 + 0.4 * math.sin(t * 2.0 + P['ph'][i] * 3)
        s = P['sz'][i]
        R = int(s * 3) + 1
        x0, y0 = int(x) - R, int(y) - R
        x1, y1 = x0 + 2 * R + 1, y0 + 2 * R + 1
        if x0 < 0 or y0 < 0 or x1 > CW or y1 > CH:
            continue
        ly, lx = np.mgrid[y0:y1, x0:x1]
        g = np.exp(-((lx - x) ** 2 + (ly - y) ** 2) / (2 * s * s)).astype(np.float32)
        buf[y0:y1, x0:x1] += g[..., None] * PCOL[P['c'][i]] * (P['br'][i] * tw * 0.8)


def wrap(a):
    return (a + np.pi) % (2 * np.pi) - np.pi


def comet_phase(t):
    # ignition: one fast lap in the first 1.6 s, then a slow orbit
    if t < 1.6:
        u = t / 1.6
        return -np.pi / 2 + 2 * np.pi * (1 - (1 - u) ** 3), 1.0 + 1.2 * (1 - u)
    return -np.pi / 2 + 2 * np.pi + (t - 1.6) * (2 * np.pi / 9.0), 1.0


def frame(src_u8, t):
    vid = Image.fromarray(src_u8).resize((VW, VH), Image.LANCZOS)
    vid = vid.filter(ImageFilter.UnsharpMask(radius=1.0, percent=45, threshold=1))
    v = np.asarray(vid, np.float32) / 255

    # ---------- background ----------
    bg = np.broadcast_to(BASE, (CH, CW, 3)).copy()
    bg += aurora(t) * 0.55
    bg += dots[..., None] * np.array([0.8, 0.85, 1.0], np.float32)

    # floor grid, gently flowing toward the viewer
    zz = depth + t * 0.35
    hl = np.exp(-((zz - np.round(zz)) ** 2) / (2 * (0.02 + 0.02 / depth.clip(0.3)) ** 2))
    vl = np.exp(-((xpers - np.round(xpers)) ** 2) / (2 * 0.035 ** 2))
    grid = np.maximum(hl, vl) * floor_fade * 0.16
    bg += grid[..., None] * (0.6 * CYAN + 0.4 * VIOL)

    particles(t, bg)

    # ---------- place video ----------
    canvas = bg.copy()
    sl = (slice(Y0, Y0 + VH), slice(X0, X0 + VW))
    ins = inside[sl]
    lifted = np.clip((v - 0.04) / 0.96, 0, 1)  # drop the recording's near-black so it melts into the stage
    screen = 1 - (1 - canvas[sl]) * (1 - lifted)
    canvas[sl] = ins * v + (1 - ins) * screen

    # ---------- orbiting border light ----------
    phi, boost = comet_phase(t)
    d1 = wrap(theta - phi)
    d2 = wrap(theta - phi - np.pi)
    inten = 0.10 + 0.95 * np.exp(-d1 ** 2 / (2 * 0.42 ** 2)) + 0.45 * np.exp(-d2 ** 2 / (2 * 0.32 ** 2))
    inten *= boost
    mix = (0.5 + 0.5 * np.sin(theta + t * 0.6))[..., None]
    col = mix * CYAN + (1 - mix) * VIOL
    glow = (ring * inten * 0.7 + ring_core * inten * 1.0)[..., None] * col
    glow *= (1 - inside * 0.85)
    canvas = 1 - (1 - canvas) * (1 - np.clip(glow, 0, 1))

    # ---------- glass sheen sweep (every 8 s) ----------
    ts = (t - 2.2) % 8.0
    if ts < 1.8:
        pos = -400 + (CW + 1300) * smooth(0, 1.8, ts)
        u = xx + 0.55 * yy
        band = np.exp(-((u - pos) / 70) ** 2) * 0.07 + np.exp(-((u - pos + 120) / 22) ** 2) * 0.035
        canvas += (band[..., None] * inside)

    # ---------- reflection + horizon ----------
    fb = int(round(FB))
    rh = CH - fb
    win = (canvas * inside)[fb - rh:fb][::-1]
    rimg = Image.fromarray((np.clip(win, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(2.2))
    refl = np.asarray(rimg, np.float32) / 255
    k = np.arange(rh, dtype=np.float32)
    fade = (0.40 * np.exp(-k / 80.0))[:, None, None]
    canvas[fb:] += refl * fade
    hz = np.exp(-((yy - FB - 1) / 3.0) ** 2) * 0.55 + np.exp(-((yy - FB - 2) / 26.0) ** 2) * 0.16
    hzx = np.exp(-((xx - CW / 2) / (CW * 0.36)) ** 2)
    pulse = 0.85 + 0.15 * math.sin(t * 1.3)
    canvas += ((hz * hzx * pulse) * (yy > FB - 2))[..., None] * (0.55 * CYAN + 0.45 * np.array([1, 1, 1], np.float32))

    canvas *= vign * (1 - inside) + inside
    return (np.clip(canvas, 0, 1) * 255 + 0.5).astype(np.uint8)


def reader():
    p = subprocess.Popen(['ffmpeg', '-loglevel', 'error', '-i', SRC, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
                         stdout=subprocess.PIPE)
    n = SW * SH * 3
    while True:
        b = p.stdout.read(n)
        if len(b) < n:
            break
        yield np.frombuffer(b, np.uint8).reshape(SH, SW, 3)


if PREVIEW:
    want = {int(round(t * FPS)): t for t in PREVIEW}
    for i, f in enumerate(reader()):
        if i in want:
            Image.fromarray(frame(f, i / FPS)).save(f"{OUT}_{want[i]:.1f}.png")
        if i > max(want):
            break
    sys.exit()

enc = subprocess.Popen([
    'ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{CW}x{CH}', '-r', str(FPS), '-i', '-',
    '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p',
    '-c:v', 'libx264', '-profile:v', 'high', '-level', '4.1', '-preset', 'slow', '-crf', '16',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
    '-movflags', '+faststart', '-an', OUT], stdin=subprocess.PIPE)
for i, f in enumerate(reader()):
    enc.stdin.write(frame(f, i / FPS).tobytes())
    if i % 60 == 0:
        print(i, flush=True)
enc.stdin.close()
enc.wait()
