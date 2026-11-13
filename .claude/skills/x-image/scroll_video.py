"""Turn a tall 1200px-wide PNG into a square 1200x1200 scrolling MP4 (and optional GIF) for X.

Usage: python3 scroll_video.py <tall.png> <out.mp4> [--gif out.gif]

1200x1200 is the largest square X accepts for video (X's max is 1920x1200 or 1200x1900).
Timeline: hold top 1.5 s, ease down, hold bottom 1.5 s, ease back up. Speed is about
110 px/s, clamped to 3-9 s per direction, so long pages don't fly past.
"""
import subprocess
import sys

from PIL import Image, ImageDraw

S, FPS = 1200, 30


def ease(t):
    return t * t * (3 - 2 * t)


def main():
    args = sys.argv[1:]
    gif = None
    if '--gif' in args:
        i = args.index('--gif'); gif = args[i + 1]; del args[i:i + 2]
    src, out = args
    page = Image.open(src).convert('RGB')
    if page.width != S:
        page = page.resize((S, round(page.height * S / page.width)), Image.LANCZOS)
    maxoff = page.height - S
    if maxoff <= 0:
        sys.exit('FIX: page is not taller than 1200px; make a still card instead')
    move = min(9.0, max(3.0, maxoff / 110))
    seq = [('top', 1.5), ('down', move), ('bottom', 1.5), ('up', move)]
    ff = subprocess.Popen(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24',
                           '-s', f'{S}x{S}', '-r', str(FPS), '-i', '-', '-c:v', 'libx264', '-preset', 'slow',
                           '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], stdin=subprocess.PIPE)
    thumb = S * S / page.height
    for kind, dur in seq:
        n = int(dur * FPS)
        for i in range(n):
            t = i / (n - 1) if n > 1 else 0
            off = {'top': 0, 'bottom': maxoff, 'down': ease(t) * maxoff, 'up': (1 - ease(t)) * maxoff}[kind]
            off = round(off)
            fr = page.crop((0, off, S, off + S))
            y = off / maxoff * (S - thumb)
            ImageDraw.Draw(fr).rounded_rectangle((S - 12, y + 8, S - 6, y + thumb - 8), radius=3, fill=(110, 118, 129))
            ff.stdin.write(fr.tobytes())
    ff.stdin.close(); ff.wait()
    print(f'saved {out} ({S}x{S}, {sum(d for _, d in seq):.1f} s, scroll {maxoff}px)')
    if gif:
        import os
        # X rejects GIFs over 15 MB: step down size/fps/colours until it fits.
        for size, fps, colors in [(800, 15, 128), (720, 12, 96), (640, 12, 64), (560, 10, 64), (480, 10, 48)]:
            subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', out, '-vf',
                            f'fps={fps},scale={size}:{size}:flags=lanczos,split[a][b];'
                            f'[a]palettegen=max_colors={colors}[p];[b][p]paletteuse=dither=bayer:bayer_scale=4',
                            '-loop', '0', gif], check=True)
            mb = os.path.getsize(gif) / 1e6
            if mb <= 14.5:
                print(f'saved {gif} ({size}x{size} GIF, {fps} fps, {mb:.1f} MB)')
                break
        else:
            print(f'FIX: GIF is still {mb:.1f} MB, over X\'s 15 MB limit; post the MP4 instead')


if __name__ == '__main__':
    main()
