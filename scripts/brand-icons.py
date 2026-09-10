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

## Uma marca só, em todo lugar

O ícone era **ink sobre gradiente ember** enquanto a splash, o logotipo e o favicon eram
**anel ember com núcleo gold**. Eram duas marcas: o app na gaveta não parecia o app que
abria. Agora todos os quatro são a mesma coisa — anel ember, núcleo gold, sobre o
gradiente escuro quente, que é o fundo que o app tem por dentro.

## Ícone é quadrado cheio e opaco

O `icon.png` desenhava os próprios cantos arredondados e deixava transparência fora deles.
Isso é errado nas duas plataformas, e era a borda branca: o iOS aplica a **máscara dele**
sobre o que a gente entrega, e o que sobrava fora do nosso canto — transparente, composto
contra branco — aparecia como quatro falhas claras nas quinas. O raio também não era o da
Apple (0,285 do lado, num arco circular, contra ~0,2237 num squircle contínuo), então o
nosso canto ficava *dentro* da máscara e a arte não chegava até a borda: era o "não pegando
tudo".

A regra é entregar o quadrado inteiro, sem canto e sem alfa, e deixar a máscara para o
sistema. Daí `opaque=True` na maioria dos alvos: eles saem em color type 2 (RGB, sem canal
alfa), que é também o que a App Store exige de um ícone de app.

Quem continua com alfa é só quem é *desenhado sobre outra coisa*: a splash (sobre o
`backgroundColor` do app.json) e o foreground do adaptive icon do Android (sobre o
background dele, que é outro PNG).
"""

import math
import struct
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / 'assets' / 'images'

EMBER = (0xF2, 0x65, 0x3A)
GOLD = (0xE8, 0xB4, 0x4A)
INK = (0x12, 0x10, 0x0E)
DARK_WARM = (0x2A, 0x17, 0x10)
CREAM = (0xF6, 0xF1, 0xEA)


def write_png(path: Path, size: int, pixels: bytes, opaque: bool) -> None:
    """
    `pixels` é sempre RGBA. `opaque` grava em color type 2, descartando o canal alfa.

    Descartar é seguro porque os alvos opacos são justamente os que têm fundo: alfa vale 1
    em todos os pixels deles. Não é uma conversão com perda, é a remoção de um canal que
    só carrega 255.
    """
    step = 4
    if opaque:
        pixels = b''.join(pixels[i : i + 3] for i in range(0, len(pixels), 4))
        step = 3

    raw = b''.join(
        b'\x00' + pixels[y * size * step : (y + 1) * size * step] for y in range(size)
    )

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack('>I', len(data))
            + tag
            + data
            + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    color_type = 2 if opaque else 6
    path.write_bytes(
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, color_type, 0, 0, 0))
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
) -> bytes:
    mark = size * symbol_ratio
    origin = (size - mark) / 2
    unit = mark / 64.0

    cx = cy = origin + 32 * unit
    r_ring = 24 * unit
    half = 4 * unit  # metade do traço 8
    r_core = 7 * unit if core else 0.0

    out = bytearray(size * size * 4)
    at = 0
    for y in range(size):
        py = y + 0.5
        for x in range(size):
            px = x + 0.5

            if background == 'none':
                col, alpha = (0.0, 0.0, 0.0), 0.0
            else:
                # dark: radial quente em 20% 0%, o mesmo fundo que as telas do app têm.
                d = math.hypot(px - size * 0.2, py) / (size * 1.2)
                col = tuple(float(c) for c in mix(DARK_WARM, INK, d / 0.62))
                alpha = 1.0

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


JOBS = [
    # nome, lado, fundo, anel, núcleo, símbolo, opaco
    #
    # Nenhum destes desenha canto: a máscara é do sistema. Ver o cabeçalho.
    ('icon.png', 1024, 'dark', EMBER, GOLD, 0.57, True),
    ('apple-touch-icon.png', 180, 'dark', EMBER, GOLD, 0.57, True),
    ('icon-192.png', 192, 'dark', EMBER, GOLD, 0.57, True),
    ('icon-512.png', 512, 'dark', EMBER, GOLD, 0.57, True),
    # Maskable: o navegador recorta em círculo, e 0.44 mantém a marca dentro da safe zone.
    ('maskable-512.png', 512, 'dark', EMBER, GOLD, 0.44, True),
    ('favicon.png', 64, 'dark', EMBER, GOLD, 0.62, True),
    # A splash é desenhada sobre o `backgroundColor` do app.json: alfa fica.
    ('splash-icon.png', 512, 'none', EMBER, GOLD, 0.9, False),
    # Adaptive icon: o fundo é um PNG à parte, e o Android recorta a máscara dele.
    ('android-icon-background.png', 432, 'dark', None, None, 0.0, True),
    ('android-icon-foreground.png', 432, 'none', EMBER, GOLD, 0.45, False),
    # O monocromático é tingido pelo sistema no tema dinâmico: a cor aqui é só o desenho.
    ('android-icon-monochrome.png', 432, 'none', CREAM, CREAM, 0.45, False),
]


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, size, background, ring, core, ratio, opaque in JOBS:
        pixels = render(
            size,
            background=background,
            ring=ring if ring else (0, 0, 0),
            core=core,
            symbol_ratio=ratio if ring else 0.0,
        )
        write_png(OUT / name, size, pixels, opaque)
        print(f'{name:34} {size}x{size}  {background:5} {"rgb" if opaque else "rgba"}')


if __name__ == '__main__':
    main()
