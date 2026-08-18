#!/usr/bin/env python3
"""Generate the extension icon: soft-rounded Union Jack.

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


def sd_rounded_box(x, y, cx, cy, hw, hh, r):
    qx = abs(x - cx) - (hw - r)
    qy = abs(y - cy) - (hh - r)
    return min(max(qx, qy), 0.0) + math.hypot(max(qx, 0.0), max(qy, 0.0)) - r


def make_icon(size, ss=4):
    S = size * ss

    # Flag: soft rounded rect (generous radius = bubbly feel), centred.
    fw = fh = 0.84 * S  # 0.08 .. 0.92
    fr = 0.20 * S  # corner radius — soft, not lumpy

    # Union Jack bands (centred for the icon).
    ws, rs = 0.11 * S, 0.05 * S  # Saltire white / red widths
    wc, rc = 0.09 * S, 0.045 * S  # St George white / red widths

    pixels = bytearray(size * size * 4)
    for py in range(size):
        for px in range(size):
            r_acc = g_acc = b_acc = a_acc = 0.0
            for sy in range(ss):
                for sx in range(ss):
                    x = px * ss + sx + 0.5
                    y = py * ss + sy + 0.5
                    a_flag = clamp01(0.5 - sd_rounded_box(x, y, S / 2, S / 2, fw / 2, fh / 2, fr))

                    # band distance helpers
                    d_saltire = min(abs(x - y) / SQRT2, abs(x + y - S) / SQRT2)
                    d_cross = min(abs(x - S / 2), abs(y - S / 2))
                    a_w = max(
                        clamp01(0.5 - (d_saltire - ws / 2)),
                        clamp01(0.5 - (d_cross - wc / 2)),
                    )
                    a_r = max(
                        clamp01(0.5 - (d_saltire - rs / 2)),
                        clamp01(0.5 - (d_cross - rc / 2)),
                    )

                    # flag colour
                    cr, cg, cb = BLUE
                    if a_w > 0:
                        cr, cg, cb = WHITE
                    if a_r > 0:
                        cr, cg, cb = RED

                    alpha = a_flag
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
