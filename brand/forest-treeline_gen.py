"""Boulder Creek Local - layered forest treeline for the site header.
ORIGINAL vector art in brand greens (NOT the watermarked reference image).
3 layers, transparent depth. Deterministic (mulberry32) and byte-identical to
the in-browser approved preview (same RNG, specs, and rounding).
"""
import math, os

W = 2560
VBH = 200

class RNG:
    def __init__(self, seed): self.s = seed & 0xFFFFFFFF
    def next(self):
        self.s = (self.s + 0x6D2B79F5) & 0xFFFFFFFF
        t = self.s
        t = (t ^ (t >> 15)) * (t | 1) & 0xFFFFFFFF
        t ^= (t + ((t ^ (t >> 7)) * (t | 61) & 0xFFFFFFFF)) & 0xFFFFFFFF
        t &= 0xFFFFFFFF
        return ((t ^ (t >> 14)) & 0xFFFFFFFF) / 4294967296.0
    def range(self, a, b): return a + (b - a) * self.next()

def noise_fn(r, comps=3):
    P = [(r.range(0.0006, 0.0022), r.range(0, 6.283), r.range(0.4, 1.0)) for _ in range(comps)]
    tot = sum(p[2] for p in P)
    def f(x):
        return sum(a * math.sin(x * fr + ph) for fr, ph, a in P) / tot
    return f

def pine(cx, b, h, hw, ti):
    pts = []
    for t in range(ti):
        f = t / ti; y = b - h * f; w = hw * (1 - f * 0.92)
        pts.append((cx - w, y)); pts.append((cx - w * 0.5, y - h * (0.55 / ti)))
    pts.append((cx, b - h))
    for t in reversed(range(ti)):
        f = t / ti; y = b - h * f; w = hw * (1 - f * 0.92)
        pts.append((cx + w * 0.5, y - h * (0.55 / ti))); pts.append((cx + w, y))
    return "M" + " ".join(f"{round(x)},{round(y)}" for x, y in pts) + " Z"

def band(r, by0, amp, hmin, hmax, hwr, spr, sp, tmin, tmax):
    nf = noise_fn(r, 3); subs = []; x = -40.0
    while x < W + 60:
        spire = r.next() < sp
        h = r.range(hmax * 0.9, hmax * 1.25) if spire else r.range(hmin, hmax)
        hw = h * r.range(hwr[0], hwr[1])
        by = by0 + nf(x) * amp
        ti = int(r.range(tmin, tmax + 0.999))
        subs.append(pine(x + hw, by, h, hw, ti))
        x += hw * r.range(spr[0], spr[1])
    top = [f"{xx},{round(by0 + nf(xx) * amp)}" for xx in range(-20, W + 40, 24)]
    bY = by0 + amp + 70
    strip = "M" + " ".join(top) + f" {W+40},{round(bY)} -20,{round(bY)} Z"
    return " ".join(subs) + " " + strip

SEED = 20260720
SPECS = [
    dict(b=98,  a=9,  hmin=24, hmax=44, hw=(0.22,0.30), sp=(0.95,1.35), spire=0.12, t=(3,3), col="#5f8571", op=0.65),
    dict(b=150, a=12, hmin=32, hmax=60, hw=(0.21,0.29), sp=(0.88,1.28), spire=0.15, t=(3,4), col="#367059", op=0.82),
    dict(b=214, a=15, hmin=46, hmax=92, hw=(0.19,0.27), sp=(0.80,1.18), spire=0.18, t=(4,5), col="#173f36", op=1.0),
]

def build():
    parts = []
    for i, s in enumerate(SPECS):
        d = band(RNG((SEED + 1301 * (i + 1)) & 0xFFFFFFFF), s["b"], s["a"], s["hmin"],
                 s["hmax"], s["hw"], s["sp"], s["spire"], s["t"][0], s["t"][1])
        parts.append(f'<g opacity="{s["op"]}"><path d="{d}" fill="{s["col"]}"/></g>')
    return "\n".join(parts)

svg = (f'<svg viewBox="0 0 {W} {VBH}" preserveAspectRatio="none" '
       f'xmlns="http://www.w3.org/2000/svg" aria-hidden="true">\n{build()}\n</svg>\n')

here = os.path.dirname(os.path.abspath(__file__))
with open(os.path.join(here, "forest.svg"), "w") as f: f.write(svg)
print("bytes:", len(svg))
