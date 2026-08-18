#!/usr/bin/env python3
"""Generate the extension icon: bubbly UK flag (blue blob + Saltire) with a
magnifying glass over the top-right.

Stdlib only — no PIL. Supersampled for smooth edges. Writes icons/icon*.png.
Run: python3 scripts/make_icons.py
"""
import math
import os
import struct
import zlib

BLUE = (1, 33, 105)  # UK flag blue #012169
RED = (200, 16, 46)  # UK flag red #C8102E
WHITE = (255, 255, 255)
SQRT2 = math.sqrt(2.0)


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


def seg_dist(px, py, a, b):
    ax, ay = a
    bx, by = b
    dx, dy = bx - ax, by - ay
    denom = dx * dx + dy * dy
    t = clamp01(((px - ax) * dx + (py - ay) * dy) / denom)
    return math.hypot(px - (ax + dx * t), py - (ay + dy * t))


def make_icon(size, ss=4):
    S = size * ss

    # Bubbly flag blob: union of circles in a rough 6x6 grid.
    fc = (0.44 * S, 0.54 * S)  # flag centre
    step = 0.17 * S
    r = 0.155 * S
    bubbles = []
    for i in range(6):
        for j in range(6):
            bubbles.append((fc[0] + (i - 2.5) * step, fc[1] + (j - 2.5) * step, r))

    # Saltire: two diagonal bands (white, then red inset), through the centre.
    wx = 0.115 * S  # white band half-width... use full width
    rx = 0.05 * S  # red band full width
    c1 = fc[0] - fc[1]
    c2 = fc[0] + fc[1]

    def xband(x, y):
        return min(abs((x - y) - c1) / SQRT2, abs((x + y) - c2) / SQRT2)

    # Magnifier: white ring + handle, tilted over the top-right.
    lcx, lcy, lr = 0.68 * S, 0.30 * S, 0.165 * S
    ring = 0.04 * S
    handle = ((0.79 * S, 0.42 * S), (0.885 * S, 0.515 * S))
    handle_thick = 0.05 * S

    pixels = bytearray(size * size * 4)
    for py in range(size):
        for px in range(size):
            r_acc = g_acc = b_acc = a_acc = 0.0
            for sy in range(ss):
                for sx in range(ss):
                    x = px * ss + sx + 0.5
                    y = py * ss + sy + 0.5
                    # blob coverage (union of bubbles)
                    a_b = max(clamp01(0.5 - (math.hypot(x - bx, y - by) - br)) for bx, by, br in bubbles)
                    # glass coverage
                    a_ring = clamp01(0.5 - (abs(math.hypot(x - lcx, y - lcy) - lr) - ring / 2))
                    a_handle = clamp01(0.5 - (seg_dist(x, y, *handle) - handle_thick / 2))
                    a_glass = max(a_ring, a_handle)
                    # flag colour: blue, white X, red X inset
                    d = xband(x, y)
                    a_wx = clamp01(0.5 - (d - wx / 2))
                    a_rx = clamp01(0.5 - (d - rx / 2))
                    cr, cg, cb = BLUE
                    if a_wx > 0:
                        cr, cg, cb = WHITE
                    if a_rx > 0:
                        cr, cg, cb = RED
                    # glass paints white over the flag
                    if a_glass > 0:
                        cr, cg, cb = WHITE
                    alpha = max(a_b, a_glass)
                    if alpha <= 0:
                        continue
                    r_acc += cr * alpha
                    g_acc += cg * alpha
                    b_acc += cb * alpha
                    a_acc += alpha
            n = ss * ss
            i = (py * size + px) * 4
            pixels[i : i + 4] = (int(r_acc / n), int(g_acc / n), int(b_acc / n), int(a_acc / n * 255))

    write_png(path, size, pixels)


if __name__ == "__main__":
    out = os.path.join(os.path.dirname(__file__), "..", "icons")
    os.makedirs(out, exist_ok=True)
    for size in (16, 32, 48, 128):
        path = os.path.join(out, f"icon{size}.png")
        make_icon(size)
        print(f"wrote {path}")
