"""Regenerate the tray icons. Run from this directory: `python3 generate.py`.

Everything here is derived from the two vendored SVGs, so the .ico files are
reproducible rather than binaries nobody can rebuild. Needs Pillow.

# What the icon is

The Phew Blue mark in brand blue, with the Material Symbols whistle inside it,
flipped and rotated 35 degrees anti-clockwise. Xeebra is the VAR review system,
hence a referee's whistle.

# Why the artwork is drawn at every size

The icons this replaced shipped a single 256px image. Windows asks the tray for
16px (SM_CXSMICON at 100% scaling), and downsampling a thin 256px outline that
far produced a pale smudge -- which is why the app looked like it had no icon at
all. Each size is now rendered from the vector at its own resolution.

# Why there are two sets

The tray takes one icon and cannot follow the Windows theme by itself, and the
taskbar is dark or light depending on SystemUsesLightTheme. A white glyph
disappears on a light taskbar and a dark one disappears on a dark taskbar, so
both sets exist and the app picks at startup: white on dark, mark-blue on light.
The mark itself is brand blue in both, which reads either way.

# Where the glyph sits

Not the centre of the tile, and not the centre of the mark's bounding box. The
mark is an open outline -- the stroke stops short at the bottom left, where the
dot sits -- so there is no enclosed region to find, and flood-filling leaks
straight out of the gap. `interior_centroid` takes the span the strokes bracket
on each row and averages it. The largest inscribed square was tried first and
rejected: it is bigger, but it shoves a landscape glyph hard against the left
upstroke.
"""
import re
from PIL import Image, ImageDraw

BLUE = (0, 146, 202, 255)     # brand phew-blue
WHITE = (255, 255, 255, 255)
AQUA = (29, 233, 182, 255)    # brand aqua  -- running
GOLD = (255, 209, 102, 255)   # brand gold  -- degraded
CORAL = (255, 110, 110, 255)  # brand coral -- stopped

STATES = {"green": AQUA, "amber": GOLD, "red": CORAL}
ICO_SIZES = (16, 24, 32, 48, 256)
APP_ICON_SIZE = 512

MARK_BOX = (0.88, 0.92)   # mark within the tile, leaving room for the badge
GLYPH_WIDTH = 0.70        # of the clear width at the centroid
ROTATION = 35             # degrees anti-clockwise
BADGE_RADIUS = 0.19       # large enough to read at 16px
SS = 4                    # supersample factor


# ---------------------------------------------------------------- SVG paths

def flatten(d, steps=24):
    """Flatten an SVG path to polylines. Handles M/L/H/V/C/S/Q/T/Z."""
    toks = re.findall(r'[MmLlHhVvCcSsQqTtZz]|-?\d*\.?\d+(?:e-?\d+)?', d)
    subs, cur = [], []
    i = 0
    x = y = sx = sy = 0.0
    px = py = None
    cmd = None

    def num():
        nonlocal i
        v = float(toks[i]); i += 1
        return v

    def cub(x0, y0, x1, y1, x2, y2, x3, y3):
        for k in range(1, steps + 1):
            t = k / steps; u = 1 - t
            cur.append((u*u*u*x0 + 3*u*u*t*x1 + 3*u*t*t*x2 + t*t*t*x3,
                        u*u*u*y0 + 3*u*u*t*y1 + 3*u*t*t*y2 + t*t*t*y3))

    def quad(x0, y0, x1, y1, x2, y2):
        for k in range(1, steps + 1):
            t = k / steps; u = 1 - t
            cur.append((u*u*x0 + 2*u*t*x1 + t*t*x2, u*u*y0 + 2*u*t*y1 + t*t*y2))

    while i < len(toks):
        if re.match(r'[A-Za-z]', toks[i]):
            cmd = toks[i]; i += 1
        rel = cmd.islower(); c = cmd.upper()
        if c == 'M':
            if cur: subs.append(cur); cur = []
            a, b = num(), num()
            x, y = (x + a, y + b) if rel else (a, b)
            sx, sy = x, y; cur = [(x, y)]
            cmd = 'l' if rel else 'L'; px = py = None
        elif c == 'L':
            a, b = num(), num(); x, y = (x + a, y + b) if rel else (a, b)
            cur.append((x, y)); px = py = None
        elif c == 'H':
            a = num(); x = x + a if rel else a; cur.append((x, y)); px = py = None
        elif c == 'V':
            a = num(); y = y + a if rel else a; cur.append((x, y)); px = py = None
        elif c == 'C':
            x1, y1, x2, y2, ex, ey = (num() for _ in range(6))
            if rel: x1, y1, x2, y2, ex, ey = x+x1, y+y1, x+x2, y+y2, x+ex, y+ey
            cub(x, y, x1, y1, x2, y2, ex, ey); px, py = x2, y2; x, y = ex, ey
        elif c == 'S':
            x2, y2, ex, ey = (num() for _ in range(4))
            if rel: x2, y2, ex, ey = x+x2, y+y2, x+ex, y+ey
            x1, y1 = (2*x - px, 2*y - py) if px is not None else (x, y)
            cub(x, y, x1, y1, x2, y2, ex, ey); px, py = x2, y2; x, y = ex, ey
        elif c == 'Q':
            x1, y1, ex, ey = (num() for _ in range(4))
            if rel: x1, y1, ex, ey = x+x1, y+y1, x+ex, y+ey
            quad(x, y, x1, y1, ex, ey); px, py = x1, y1; x, y = ex, ey
        elif c == 'T':
            ex, ey = num(), num()
            if rel: ex, ey = x + ex, y + ey
            x1, y1 = (2*x - px, 2*y - py) if px is not None else (x, y)
            quad(x, y, x1, y1, ex, ey); px, py = x1, y1; x, y = ex, ey
        elif c == 'Z':
            if cur: cur.append((sx, sy)); subs.append(cur); cur = []
            x, y = sx, sy; px = py = None
        else:
            i += 1
    if cur: subs.append(cur)
    return subs


def _svg(path):
    src = open(path).read()
    d = re.search(r'\sd="([^"]+)"', src).group(1)
    vb = re.search(r'viewBox="([^"]+)"', src)
    if vb:
        box = [float(v) for v in vb.group(1).split()]
    else:
        m = re.search(r'scale\(([\d.]+)\)\s*translate\(([\d.]+),\s*([\d.]+)\)', src)
        box = None if not m else m
    return src, d, box


def render_glyph(size, colour):
    """The whistle, filled, with its hole. Even-odd so the hole stays a hole."""
    _, d, (vx, vy, vw, vh) = _svg('whistle.svg')
    n = size * 2
    s = min(n / vw, n / vh)
    ox = (n - vw*s)/2 - vx*s
    oy = (n - vh*s)/2 - vy*s
    acc = Image.new('L', (n, n), 0)
    for sub in flatten(d):
        if len(sub) < 3:
            continue
        m = Image.new('L', (n, n), 0)
        ImageDraw.Draw(m).polygon([(ox + px*s, oy + py*s) for px, py in sub], fill=255)
        acc = Image.frombytes('L', acc.size,
                              bytes(a ^ b for a, b in zip(acc.tobytes(), m.tobytes())))
    out = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    out.paste(colour, mask=acc)
    return out.resize((size, size), Image.LANCZOS)


# ---------------------------------------------------------------- the mark

def _mark_subpaths():
    src, d, _ = _svg('phew-blue-icon.svg')
    m = re.search(r'scale\(([\d.]+)\)\s*translate\(([\d.]+),\s*([\d.]+)\)', src)
    sc = float(m.group(1)); tx, ty = float(m.group(2)), float(m.group(3))
    return [[((px + tx)*sc, (py + ty)*sc) for px, py in s] for s in flatten(d)]


_SUBS = _mark_subpaths()
_XS = [p[0] for s in _SUBS for p in s]
_YS = [p[1] for s in _SUBS for p in s]
_BOX = (min(_XS), min(_YS), max(_XS), max(_YS))


def draw_mark(img, box, colour):
    x0, y0, x1, y1 = box
    bw, bh = _BOX[2]-_BOX[0], _BOX[3]-_BOX[1]
    s = min((x1-x0)/bw, (y1-y0)/bh)
    ox = x0 + ((x1-x0) - bw*s)/2 - _BOX[0]*s
    oy = y0 + ((y1-y0) - bh*s)/2 - _BOX[1]*s
    layer = Image.new('RGBA', img.size, (0, 0, 0, 0))
    dr = ImageDraw.Draw(layer)
    for sub in _SUBS:
        pts = [(ox + px*s, oy + py*s) for px, py in sub]
        if len(pts) > 2:
            dr.polygon(pts, fill=colour)
    img.alpha_composite(layer)


def interior_centroid(n=320):
    """Centre of the space the triangle encloses, and the clear width there."""
    im = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    draw_mark(im, (0, 0, n*MARK_BOX[0], n*MARK_BOX[1]), WHITE)
    solid = [p > 40 for p in im.split()[3].getdata()]
    xs = ys = cnt = 0
    rows = {}
    for r in range(n):
        row = [c for c in range(n) if solid[r*n + c]]
        if len(row) < 2:
            continue
        clear = [c for c in range(row[0]+1, row[-1]) if not solid[r*n + c]]
        if not clear:
            continue
        rows[r] = (clear[0], clear[-1])
        for c in clear:
            xs += c; ys += r; cnt += 1
    cx, cy = xs/cnt/n, ys/cnt/n
    lo, hi = rows.get(int(cy*n), (0, 0))
    return cx, cy, (hi - lo)/n


CX, CY, CLEAR_W = interior_centroid()


# ---------------------------------------------------------------- the icons

def icon(size, glyph_colour, badge=None):
    n = size * SS
    im = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    draw_mark(im, (0, 0, n*MARK_BOX[0], n*MARK_BOX[1]), BLUE)
    g = render_glyph(max(6, int(n*CLEAR_W*GLYPH_WIDTH)), glyph_colour)
    g = g.transpose(Image.FLIP_LEFT_RIGHT)
    g = g.rotate(ROTATION, resample=Image.BICUBIC, expand=True)
    im.alpha_composite(g, (int(n*CX - g.width/2), int(n*CY - g.height/2)))
    if badge:
        r = n * BADGE_RADIUS
        ImageDraw.Draw(im).ellipse([n-2*r, n-2*r, n, n], fill=badge)
    return im.resize((size, size), Image.LANCZOS)


written = []
for theme, glyph_colour in (('', WHITE), ('-light', BLUE)):
    for state, badge in STATES.items():
        frames = [icon(s, glyph_colour, badge) for s in ICO_SIZES]
        p = f'icon-{state}{theme}.ico'
        frames[-1].save(p, format='ICO', sizes=[(s, s) for s in ICO_SIZES],
                        append_images=frames[:-1])
        written.append(p)

# The application icon carries no state, so it carries no badge either.
icon(APP_ICON_SIZE, WHITE).save('app-icon.png')
written.append('app-icon.png')

for p in written:
    print('wrote', p)
