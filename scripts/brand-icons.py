#!/usr/bin/env python3
"""
Gera os PNGs de ícone da marca Nought.

Existe porque a máquina não tem rasterizador de SVG — e porque não precisa de um: a marca
são dois círculos concêntricos sobre um gradiente. Encoder PNG em zlib puro, zero
dependências. `python3 scripts/brand-icons.py`.

Os números vêm de `src/components/logo.tsx` e são os mesmos: viewBox de 64, anel de raio
24 com traço 8, núcleo de raio 7. O símbolo ocupa 57% do lado do ícone, e 44% no
maskable, para respeitar a safe zone.

O antialiasing é analítico — cobertura pela distância ao raio, uma passada na resolução
final. Supersampling de 4x num ícone de 1024 seriam 16 milhões de amostras em Python
puro, e isso levava minutos.
"""

import math
import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / 'assets' / 'images'

EMBER = (0xF2, 0x65, 0x3A)
EMBER_LITE = (0xFF, 0x8A, 0x5C)
EMBER_DEEP = (0xB3, 0x3C, 0x1E)
GOLD = (0xE8, 0xB4, 0x4A)
INK = (0x12, 0x10, 0x0E)
DARK_WARM = (0x2A, 0x17, 0x10)
CREAM = (0xF6, 0xF1, 0xEA)


def write_png(path: Path, size: int, pixels: bytes) -> None:
    raw = b''.join(
        b'\x00' + pixels[y * size * 4 : (y + 1) * size * 4] for y in range(size)
    )

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack('>I', len(data))
            + tag
            + data
            + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    path.write_bytes(
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
        + chunk(b'IDAT', zlib.compress(raw, 9))
        + chunk(b'IEND', b'')
    )


def mix(a, b, t):
    t = min(1.0, max(0.0, t))
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def over(dst, dst_a, src, src_a):
    """Compõe src sobre dst, ambos premultiplicados na saída."""
    a = src_a + dst_a * (1 - src_a)
    if a <= 0:
        return (0.0, 0.0, 0.0), 0.0
    col = tuple(
        (src[i] * src_a + dst[i] * dst_a * (1 - src_a)) / a for i in range(3)
    )
    return col, a


def coverage(d: float, r: float) -> float:
    """Cobertura de um disco de raio r a uma distância d do centro. Borda de 1 px."""
    return min(1.0, max(0.0, r - d + 0.5))


def render(
    size: int,
    *,
    background: str,
    ring: tuple,
    core: tuple | None,
    symbol_ratio: float,
    squircle: bool,
) -> bytes:
    mark = size * symbol_ratio
    origin = (size - mark) / 2
    unit = mark / 64.0

    cx = cy = origin + 32 * unit
    r_ring = 24 * unit
    half = 4 * unit  # metade do traço 8
    r_core = 7 * unit if core else 0.0
    corner = size * 0.285

    out = bytearray(size * size * 4)
    at = 0
    for y in range(size):
        py = y + 0.5
        for x in range(size):
            px = x + 0.5

            if background == 'none':
                col, alpha = (0.0, 0.0, 0.0), 0.0
            else:
                if background == 'ember':
                    # 150deg: da diagonal superior esquerda para a inferior direita.
                    t = (px + py) / (2 * size)
                    col = (
                        mix(EMBER_LITE, EMBER, t / 0.44)
                        if t < 0.44
                        else mix(EMBER, EMBER_DEEP, (t - 0.44) / 0.56)
                    )
                else:  # dark: radial em 20% 0%
                    d = math.hypot(px - size * 0.2, py) / (size * 1.2)
                    col = mix(DARK_WARM, INK, d / 0.62)
                alpha = 1.0
                if squircle:
                    alpha = squircle_alpha(px, py, size, corner)
                    col = tuple(float(c) for c in col)

            d = math.hypot(px - cx, py - cy)
            # O anel é a diferença de dois discos: o de fora menos o de dentro.
            ring_a = coverage(d, r_ring + half) * (1.0 - coverage(d, r_ring - half))
            if ring_a > 0:
                col, alpha = over(col, alpha, tuple(float(c) for c in ring), ring_a)
            if r_core > 0:
                core_a = coverage(d, r_core)
                if core_a > 0:
                    col, alpha = over(col, alpha, tuple(float(c) for c in core), core_a)

            out[at] = round(col[0])
            out[at + 1] = round(col[1])
            out[at + 2] = round(col[2])
            out[at + 3] = round(alpha * 255)
            at += 4

    return bytes(out)


def squircle_alpha(x, y, side, radius):
    """Alfa do canto arredondado. Fora dos cantos é 1."""
    cx = radius if x < radius else side - radius if x > side - radius else None
    cy = radius if y < radius else side - radius if y > side - radius else None
    if cx is None or cy is None:
        return 1.0
    return coverage(math.hypot(x - cx, y - cy), radius)


JOBS = [
    # nome, lado, fundo, anel, núcleo, símbolo, squircle
    ('icon.png', 1024, 'ember', INK, INK, 0.57, True),
    ('apple-touch-icon.png', 180, 'ember', INK, INK, 0.57, True),
    ('icon-192.png', 192, 'ember', INK, INK, 0.57, True),
    ('icon-512.png', 512, 'ember', INK, INK, 0.57, True),
    ('maskable-512.png', 512, 'ember', INK, INK, 0.44, True),
    ('favicon.png', 64, 'dark', EMBER, GOLD, 0.62, False),
    ('splash-icon.png', 512, 'none', EMBER, GOLD, 0.9, False),
    # Adaptive icon: o fundo é um PNG à parte, e o Android recorta a máscara dele.
    ('android-icon-background.png', 432, 'ember', None, None, 0.0, False),
    ('android-icon-foreground.png', 432, 'none', INK, INK, 0.45, False),
    ('android-icon-monochrome.png', 432, 'none', CREAM, CREAM, 0.45, False),
]


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, size, background, ring, core, ratio, squircle in JOBS:
        pixels = render(
            size,
            background=background,
            ring=ring if ring else (0, 0, 0),
            core=core,
            symbol_ratio=ratio if ring else 0.0,
            squircle=squircle,
        )
        write_png(OUT / name, size, pixels)
        print(f'{name:34} {size}x{size}  {background}')


if __name__ == '__main__':
    main()
