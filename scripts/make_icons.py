#!/usr/bin/env python3
"""Generate the extension icon: UK-flag blue tile + white checkmark.

Stdlib only — no PIL. Supersampled for smooth edges. Writes icons/icon*.png.
Run: python3 scripts/make_icons.py
"""
import math
import os
import struct
import zlib

BLUE = (1, 33, 105)  # UK flag blue (#012169)
WHITE = (255, 255, 255)


def png_chunk(tag, data):
    return (
        struct.pack(">I", len(data))
        + tag
        + data
        + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
    )


def write_png(path, size, pixels):
    raw = b"".join(b"\x00" + bytes(pixels[y * size * 4 : (y + 1) * size * 4]) for y in range(size))
    ihdr = struct.pack(">IIBBBBB", size, size, 8, 6, 0, 0, 0)
    data = b"\x89PNG\r\n\x1a\n" + png_chunk(b"IHDR", ihdr) + png_chunk(b"IDAT", zlib.compress(raw)) + png_chunk(b"IEND", b"")
    with open(path, "wb") as f:
        f.write(data)


def clamp01(v):
    return 0.0 if v < 0.0 else (1.0 if v > 1.0 else v)


def sd_rounded_box(x, y, cx, cy, hw, hh, r):
    qx = abs(x - cx) - (hw - r)
    qy = abs(y - cy) - (hh - r)
    return min(max(qx, qy), 0.0) + math.hypot(max(qx, 0.0), max(qy, 0.0)) - r


def seg_dist(px, py, a, b):
    ax, ay = a
    bx, by = b
    dx, dy = bx - ax, by - ay
    denom = dx * dx + dy * dy
    t = clamp01(((px - ax) * dx + (py - ay) * dy) / denom)
    return math.hypot(px - (ax + dx * t), py - (ay + dy * t))


def make_icon(size, ss=4):
    S = size * ss
    tile = S * 0.92
    off = (S - tile) / 2
    radius = tile * 0.22
    hw = hh = tile / 2
    cx = cy = S / 2
    thick = tile * 0.075
    # Checkmark strokes, in S units (tile is 0.92S wide, centered).
    seg1 = ((0.31 * S, 0.56 * S), (0.44 * S, 0.69 * S))
    seg2 = ((0.44 * S, 0.69 * S), (0.71 * S, 0.34 * S))
    pixels = bytearray(size * size * 4)

    for py in range(size):
        for px in range(size):
            r = g = b = a = 0.0
            for sy in range(ss):
                for sx in range(ss):
                    x = px * ss + sx + 0.5
                    y = py * ss + sy + 0.5
                    a_t = clamp01(0.5 - sd_rounded_box(x, y, cx, cy, hw, hh, radius))
                    if a_t <= 0:
                        continue
                    d = min(seg_dist(x, y, *seg1), seg_dist(x, y, *seg2))
                    a_c = clamp01(0.5 - (d - thick / 2))
                    cr = BLUE[0] + (WHITE[0] - BLUE[0]) * a_c
                    cg = BLUE[1] + (WHITE[1] - BLUE[1]) * a_c
                    cb = BLUE[2] + (WHITE[2] - BLUE[2]) * a_c
                    r += cr * a_t
                    g += cg * a_t
                    b += cb * a_t
                    a += a_t
            n = ss * ss
            i = (py * size + px) * 4
            pixels[i : i + 4] = (int(r / n), int(g / n), int(b / n), int(a / n * 255))

    write_png(path, size, pixels)


if __name__ == "__main__":
    out = os.path.join(os.path.dirname(__file__), "..", "icons")
    os.makedirs(out, exist_ok=True)
    for size in (16, 32, 48, 128):
        path = os.path.join(out, f"icon{size}.png")
        make_icon(size)
        print(f"wrote {path}")
