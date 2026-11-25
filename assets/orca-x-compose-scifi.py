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
X0 = (CW - VW) // 2
FT_TARGET = 292.0
CY0 = 114                                   # source row where the window crop starts
WH = round((SH - CY0) * S)                  # scaled crop height
WY = round(FT_TARGET - (117 - CY0) * S)     # canvas row of crop top
Y0 = WY - CY0 * S                           # virtual offset of full source frame
FL, FR = X0 + 9.5 * S, X0 + 1034 * S
FT, FB = Y0 + 117 * S, Y0 + 761.5 * S
# icons
ISRC = [184.5 + 84.5 * i for i in range(9)]
ISY = 35
IS = 1.8
ICON_Y = 96
IX = [100 + 125 * i for i in range(9)]
HUB = (CW / 2, FT - 2)
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



IC = 30                                     # half crop in source px
ICO = round(2 * IC * IS)
_iy, _ix = np.mgrid[0:ICO, 0:ICO].astype(np.float32) - (ICO - 1) / 2
_qx = np.abs(_ix) - (31 - 14); _qy = np.abs(_iy) - (31 - 14)
_rsdf = np.sqrt(np.maximum(_qx, 0) ** 2 + np.maximum(_qy, 0) ** 2) + np.minimum(np.maximum(_qx, _qy), 0) - 14
PLATE = np.clip((0.5 - _rsdf) / 2.5, 0, 1)[..., None]
ICON_MASK = np.clip((46 - np.maximum(np.abs(_ix), np.abs(_iy))) / 8, 0, 1)[..., None]

from PIL import ImageDraw
SS = 2  # supersample for vector fx


def bez(p0, p1, p2, p3, n=160):
    t = np.linspace(0, 1, n)[:, None]
    pts = (1 - t) ** 3 * p0 + 3 * (1 - t) ** 2 * t * p1 + 3 * (1 - t) * t ** 2 * p2 + t ** 3 * p3
    return pts


BEAMS = []
for x in IX:
    p0 = np.array([x, ICON_Y + 40.0]); p1 = np.array([x, ICON_Y + 110.0])
    p2 = np.array([CW / 2 + (x - CW / 2) * 0.12, HUB[1] - 95.0]); p3 = np.array(HUB)
    BEAMS.append(bez(p0, p1, p2, p3) * SS)

ACT = np.zeros(9)


def icon_activity(src):
    sc = []
    for c in ISRC:
        c = int(c); cr = src[8:62, c - 28:c + 28].astype(np.float32)
        sc.append(cr[..., 2].mean() - cr[..., 0].mean())
    sc = np.array(sc)
    return np.clip((sc - np.median(sc) - 1.0) / 4.5, 0, 1)


def col(c, k):
    return tuple(int(max(0, min(255, v * 255 * k))) for v in c)


def ellipse_pts(cx, cy, rx, ry, a0, a1, n=48):
    a = np.linspace(a0, a1, n)
    return np.stack([cx + rx * np.cos(a), cy + ry * np.sin(a)], 1), a


def draw_fx(t, act):
    im = Image.new('RGB', (CW * SS, CH * SS))
    d = ImageDraw.Draw(im)
    # --- HUD rail through the icon row, broken around icons ---
    ry_ = ICON_Y * SS
    xs = [30] + [x for x in IX] + [CW - 30]
    for i in range(len(xs) - 1):
        a = xs[i] + (40 if i > 0 else 0); b = xs[i + 1] - (40 if i < len(xs) - 2 else 0)
        d.line([(a * SS, ry_), (b * SS, ry_)], fill=col(CYAN, 0.22), width=2)
    scan = (math.sin(t * 0.9) * 0.5 + 0.5) * (CW - 60) + 30
    for k in range(14):
        xa = scan - k * 6 * math.copysign(1, math.cos(t * 0.9))
        d.line([(xa * SS, ry_), ((xa + 6) * SS, ry_)], fill=col(CYAN, 1.0 * (1 - k / 14) ** 2), width=4)
    # --- tick ruler above icons ---
    for i, x in enumerate(range(40, CW - 30, 16)):
        wave = 0.5 + 0.5 * math.sin(x * 0.02 - t * 3.0)
        h = 10 if i % 5 == 0 else 5
        d.line([(x * SS, 34 * SS), (x * SS, (34 + h) * SS)], fill=col(VIOL, 0.18 + 0.5 * wave ** 4), width=2)
    # corner brackets
    for (cx_, cy_, sx, sy) in [(18, 18, 1, 1), (CW - 18, 18, -1, 1), (18, CH - 18, 1, -1), (CW - 18, CH - 18, -1, -1)]:
        k = 0.35 + 0.25 * math.sin(t * 1.5)
        d.line([(cx_ * SS, cy_ * SS), ((cx_ + 34 * sx) * SS, cy_ * SS)], fill=col(CYAN, k), width=3)
        d.line([(cx_ * SS, cy_ * SS), (cx_ * SS, (cy_ + 34 * sy) * SS)], fill=col(CYAN, k), width=3)

    # --- beams ---
    for i, pts in enumerate(BEAMS):
        a = act[i]
        base = 0.30 + 0.55 * a
        c = CYAN if i % 2 == 0 else VIOL
        c = c * (1 - a) + CYAN * a
        d.line([tuple(p) for p in pts], fill=col(c, base), width=3 + int(2 * a))
        npk = 2 + int(round(2 * a))
        speed = 0.45 + 0.35 * a
        L = 0.16
        n = len(pts)
        for j in range(npk):
            ph = (t * speed + i * 0.137 + j / npk) % 1.0
            i1 = int(ph * (n - 1)); i0 = max(0, int((ph - L) * (n - 1)))
            seg = pts[i0:i1 + 1]
            m = len(seg)
            for q in range(m - 1):
                k = ((q + 1) / m) ** 2 * (0.7 + 0.6 * a)
                d.line([tuple(seg[q]), tuple(seg[q + 1])], fill=col(c * 0.6 + 0.4, k), width=5 + int(3 * a))
            if m > 1:
                hx_, hy_ = seg[-1]; r = (5 + 3 * a) * SS / 2
                d.ellipse([hx_ - r, hy_ - r, hx_ + r, hy_ + r], fill=col(np.array([1, 1, 1], np.float32), 0.9))
    # hub + shockwave rings
    hx_, hy_ = HUB[0] * SS, HUB[1] * SS
    for j in range(3):
        u = (t * 0.7 + j / 3) % 1
        r = (8 + 70 * u) * SS; ryy = r * 0.32
        d.ellipse([hx_ - r, hy_ - ryy, hx_ + r, hy_ + ryy], outline=col(CYAN, 0.8 * (1 - u) ** 1.5), width=3)
    r = 7 * SS
    d.ellipse([hx_ - r, hy_ - r * 0.6, hx_ + r, hy_ + r * 0.6], fill=col(np.array([0.85, 0.97, 1], np.float32), 1))

    # --- hologram pedestal below the window ---
    pcx, pcy = CW / 2 * SS, (FB + 104) * SS
    rings = [(150, 'solid', CYAN, 0.0), (250, 'dash24', CYAN, 0.35), (370, 'ticks', TEAL, -0.22),
             (500, 'dash6', VIOL, 0.12), (640, 'solid', VIOL, 0.0)]
    for rx, kind, c, w in rings:
        rxs, rys = rx * SS, rx * 0.16 * SS
        rot = t * w
        if kind == 'solid':
            pts, ang = ellipse_pts(pcx, pcy, rxs, rys, 0, 2 * np.pi, 160)
            for q in range(len(pts) - 1):
                fr = 0.35 + 0.65 * (0.5 + 0.5 * math.sin(ang[q]))
                k = (0.75 if rx == 150 else 0.38) * fr * (0.85 + 0.15 * math.sin(t * 2.2))
                d.line([tuple(pts[q]), tuple(pts[q + 1])], fill=col(c, k), width=3)
        elif kind.startswith('dash'):
            nd = int(kind[4:])
            for j in range(nd):
                a0 = rot + j * 2 * np.pi / nd
                a1 = a0 + (2 * np.pi / nd) * (0.55 if nd > 10 else 0.7)
                pts, ang = ellipse_pts(pcx, pcy, rxs, rys, a0, a1, 24)
                fr = 0.35 + 0.65 * (0.5 + 0.5 * math.sin((a0 + a1) / 2))
                d.line([tuple(p) for p in pts], fill=col(c, 0.75 * fr), width=4 if nd < 10 else 3)
        else:  # ticks + radar sweep
            for j in range(90):
                a = rot + j * 2 * np.pi / 90
                fr = 0.3 + 0.7 * (0.5 + 0.5 * math.sin(a))
                sweep = math.exp(-(((a - t * 1.4) + np.pi) % (2 * np.pi) - np.pi) ** 2 / 0.08)
                x1, y1 = pcx + rxs * math.cos(a), pcy + rys * math.sin(a)
                x2, y2 = pcx + rxs * 1.05 * math.cos(a), pcy + rys * 1.05 * math.sin(a)
                d.line([(x1, y1), (x2, y2)], fill=col(c, (0.38 + 0.9 * sweep) * fr), width=3)
            # sweep arc
            for k in range(20):
                a0 = t * 1.4 - k * 0.04
                pts, _ = ellipse_pts(pcx, pcy, rxs * 0.97, rys * 0.97, a0 - 0.04, a0, 4)
                d.line([tuple(p) for p in pts], fill=col(c, 0.9 * (1 - k / 20) ** 2 * (0.4 + 0.6 * (0.5 + 0.5 * math.sin(a0)))), width=5)
    # orbiting satellites on the dash ring
    for j in range(3):
        a = -t * 0.6 + j * 2 * np.pi / 3
        x_, y_ = pcx + 250 * SS * math.cos(a), pcy + 40 * SS * math.sin(a)
        r = 4 * SS * (0.7 + 0.3 * math.sin(a))
        d.ellipse([x_ - r, y_ - r, x_ + r, y_ + r], fill=col(CYAN, 0.6 + 0.4 * math.sin(a)))

    im = im.resize((CW, CH), Image.LANCZOS)
    g1 = im.filter(ImageFilter.GaussianBlur(5)); g2 = im.filter(ImageFilter.GaussianBlur(16))
    a = np.asarray(im, np.float32) / 255
    return a + np.asarray(g1, np.float32) / 255 * 1.3 + np.asarray(g2, np.float32) / 255 * 0.9


# projection cone from pedestal up to the window
_cone_w = np.interp(yy, [FB - 10, FB + 104], [470, 150])
CONE = (np.exp(-((xx - CW / 2) / _cone_w) ** 4) * ((yy > FB - 2) & (yy < FB + 104)) *
        np.clip((yy - FB) / 20, 0, 1)).astype(np.float32)


def frame(src_u8, t):
    global ACT
    ACT = ACT * 0.6 + icon_activity(src_u8) * 0.4
    vid = Image.fromarray(src_u8[CY0:]).resize((VW, WH), Image.LANCZOS)
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
    bg += CONE[..., None] * (0.06 + 0.02 * math.sin(t * 3.1)) * (0.6 * CYAN + 0.4 * TEAL)
    bg += draw_fx(t, ACT)

    # ---------- place video ----------
    canvas = bg.copy()
    # enlarged icons, each cropped from the recording
    for i in range(9):
        c = int(round(ISRC[i]))
        cr = Image.fromarray(src_u8[ISY - IC:ISY + IC, c - IC:c + IC]).resize((ICO, ICO), Image.LANCZOS)
        cr = cr.filter(ImageFilter.UnsharpMask(radius=1.2, percent=60, threshold=1))
        ic = np.clip((np.asarray(cr, np.float32) / 255 - 0.04) / 0.96, 0, 1)
        y0_ = ICON_Y - ICO // 2; x0_ = IX[i] - ICO // 2
        reg = canvas[y0_:y0_ + ICO, x0_:x0_ + ICO]
        plate = 0.55  # darken behind icon so the rail/aurora don't show through
        reg = reg * (1 - plate * PLATE)
        canvas[y0_:y0_ + ICO, x0_:x0_ + ICO] = 1 - (1 - reg) * (1 - ic * ICON_MASK)
    sl = (slice(WY, WY + WH), slice(X0, X0 + VW))
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
    canvas[fb:] += refl * fade * 0.8
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
