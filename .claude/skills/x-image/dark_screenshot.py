"""Return the SAME screenshot, dark, on a 4096x4096 square for X.

Usage: python3 dark_screenshot.py <in.png> <out.png> [--crop L,T,R,B] [--keep L,T,R,B ...]

Nothing is rewritten or re-laid-out. The screenshot is colour-flipped to dark
(lightness inverted, hues kept), scaled to the full 4096 width and centred on a
matching dark square. --crop trims browser chrome (e.g. the URL bar). --keep marks
photo regions (in original pixel coordinates) to leave un-flipped.
"""
import os, sys
import numpy as np
from PIL import Image

args = sys.argv[1:]
crop, keeps = None, []
while '--crop' in args:
    i = args.index('--crop'); crop = tuple(map(int, args[i + 1].split(','))); del args[i:i + 2]
while '--keep' in args:
    i = args.index('--keep'); keeps.append(tuple(map(int, args[i + 1].split(',')))); del args[i:i + 2]
src, out = args
im = Image.open(src).convert('RGB')
a = np.asarray(im).astype(np.int16)
mx, mn = a.max(axis=2, keepdims=True), a.min(axis=2, keepdims=True)
d = np.clip(a + 255 - mx - mn, 0, 255)          # invert lightness, keep hue
d = (d * (230 / 255) + np.array([13, 17, 23])).clip(0, 255).astype(np.uint8)  # lift black to #0d1117
dark = Image.fromarray(d)
for box in keeps:
    dark.paste(im.crop(box), box[:2])
if crop:
    dark = dark.crop(crop)
S = 4096
w, h = dark.size
scale = min(S / w, S / h)
big = dark.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
canvas = Image.new('RGB', (S, S), (13, 17, 23))
canvas.paste(big, ((S - big.width) // 2, (S - big.height) // 2))
canvas.save(out, optimize=True)
mb = os.path.getsize(out) / 1e6
if mb > 5:
    out = out.rsplit('.', 1)[0] + '.jpg'
    canvas.save(out, quality=92, optimize=True, subsampling=0); mb = os.path.getsize(out) / 1e6
print(f'saved {out} (4096x4096, {mb:.1f} MB), screenshot fills {big.width}x{big.height}')
