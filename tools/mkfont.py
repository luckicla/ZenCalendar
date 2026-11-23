#!/usr/bin/env python3
"""ZenCalendar: la fuente de matriz de puntos ZenDot (diseño «Dot»).

    python3 tools/mkfont.py

Solo hace falta fontTools. Cada glifo es una rejilla de 5×7 puntos redondos de
verdad (cada punto es un círculo cerrado de curvas cuadráticas, en el sentido
de las agujas del reloj, como pide TrueType, y ninguno se toca con otro).

Genera:
  assets/fonts/ZenDot.ttf                       la fuente
  assets/fonts/ZenDot.woff                      WOFF (zlib; no hay brotli)
  web/fonts/ZenDot.woff                         copia para la app
  docs/fonts/ZenDot.woff                        copia para la web de presentación
  android/app/src/main/res/font/zendot.ttf      copia para los widgets de Android

La rejilla (unidades de la fuente, 1000 por em):
  · cada punto ocupa un paso de 100 (P) y mide 80 de diámetro (2·R), con 20 de hueco;
  · fila 0 = arriba de las mayúsculas (altura 684), fila 6 = la de abajo, apoyada en la línea base;
  · minúsculas de verdad: altura x de 5 filas (2…6), ascendentes en la fila 0 y descendentes en las filas 7 y 8;
  · acentos de las mayúsculas en las filas -3 y -2 (con la -1 de hueco) y de las minúsculas en -1 y 0;
  · entre letra y letra queda una columna vacía; las cifras miden todas lo mismo (tabulares: los relojes no bailan).

Licencia: © 2026 luckicla. SIL Open Font License 1.1 (uso libre, también fuera de la app).
"""
import math
import os
import shutil
import sys

from fontTools.agl import UV2AGL
from fontTools.feaLib.builder import addOpenTypeFeaturesFromString
from fontTools.fontBuilder import FontBuilder
from fontTools.misc.timeTools import timestampFromString
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.ttLib import TTFont, newTable
from fontTools.ttLib.tables.O_S_2f_2 import Panose

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))

UPM = 1000
P = 100            # paso de la rejilla
R = 40             # radio del punto
CAP = 6 * P + 2 * R          # 680: altura de las mayúsculas
XH = 4 * P + 2 * R           # 480: altura x
VERSION = '1.000'
FAMILY = 'ZenDot'

# ---------------------------------------------------------------------------
# Los glifos. Cada uno: (fila de arriba, [filas]) con «#» = punto y «.» = vacío.
# Todas las filas de un glifo miden lo mismo (ese es su ancho en columnas).
# ---------------------------------------------------------------------------
G = {}


def glyph(ch, top, *rows):
    w = len(rows[0])
    for r in rows:
        assert len(r) == w, (ch, rows)
    G[ch] = (top, list(rows))


# --- cifras (5 de ancho, tabulares) ---
glyph('0', 0, '.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.')
glyph('1', 0, '..#..', '.##..', '#.#..', '..#..', '..#..', '..#..', '#####')
glyph('2', 0, '.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####')
glyph('3', 0, '.###.', '#...#', '....#', '..##.', '....#', '#...#', '.###.')
glyph('4', 0, '...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.')
glyph('5', 0, '#####', '#....', '####.', '....#', '....#', '#...#', '.###.')
glyph('6', 0, '..##.', '.#...', '#....', '####.', '#...#', '#...#', '.###.')
glyph('7', 0, '#####', '....#', '...#.', '..#..', '.#...', '.#...', '.#...')
glyph('8', 0, '.###.', '#...#', '#...#', '.###.', '#...#', '#...#', '.###.')
glyph('9', 0, '.###.', '#...#', '#...#', '.####', '....#', '...#.', '.##..')

# --- mayúsculas ---
UP = {
    'A': ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    'B': ['####.', '#...#', '#...#', '####.', '#...#', '#...#', '####.'],
    'C': ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
    'D': ['####.', '#...#', '#...#', '#...#', '#...#', '#...#', '####.'],
    'E': ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
    'F': ['#####', '#....', '#....', '####.', '#....', '#....', '#....'],
    'G': ['.###.', '#...#', '#....', '#.###', '#...#', '#...#', '.####'],
    'H': ['#...#', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
    'I': ['###', '.#.', '.#.', '.#.', '.#.', '.#.', '###'],
    'J': ['..###', '...#.', '...#.', '...#.', '...#.', '#..#.', '.##..'],
    'K': ['#...#', '#..#.', '#.#..', '##...', '#.#..', '#..#.', '#...#'],
    'L': ['#....', '#....', '#....', '#....', '#....', '#....', '#####'],
    'M': ['#...#', '##.##', '#.#.#', '#.#.#', '#...#', '#...#', '#...#'],
    'N': ['#...#', '#...#', '##..#', '#.#.#', '#..##', '#...#', '#...#'],
    'O': ['.###.', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    'P': ['####.', '#...#', '#...#', '####.', '#....', '#....', '#....'],
    'Q': ['.###.', '#...#', '#...#', '#...#', '#.#.#', '#..#.', '.##.#'],
    'R': ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
    'S': ['.###.', '#...#', '#....', '.###.', '....#', '#...#', '.###.'],
    'T': ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
    'U': ['#...#', '#...#', '#...#', '#...#', '#...#', '#...#', '.###.'],
    'V': ['#...#', '#...#', '#...#', '#...#', '#...#', '.#.#.', '..#..'],
    'W': ['#...#', '#...#', '#...#', '#.#.#', '#.#.#', '#.#.#', '.#.#.'],
    'X': ['#...#', '#...#', '.#.#.', '..#..', '.#.#.', '#...#', '#...#'],
    'Y': ['#...#', '#...#', '.#.#.', '..#..', '..#..', '..#..', '..#..'],
    # la «Z»: la diagonal va de esquina a esquina sin saltos
    'Z': ['#####', '....#', '...#.', '..#..', '.#...', '#....', '#####'],
}
for k, rows in UP.items():
    glyph(k, 0, *rows)

# --- minúsculas de verdad (altura x: filas 2…6) ---
LO = {
    'a': (2, ['.###.', '....#', '.####', '#...#', '.####']),
    'b': (0, ['#....', '#....', '####.', '#...#', '#...#', '#...#', '####.']),
    'c': (2, ['.####', '#....', '#....', '#....', '.####']),
    'd': (0, ['....#', '....#', '.####', '#...#', '#...#', '#...#', '.####']),
    'e': (2, ['.###.', '#...#', '#####', '#....', '.####']),
    'f': (0, ['..##', '.#..', '####', '.#..', '.#..', '.#..', '.#..']),
    'g': (2, ['.####', '#...#', '#...#', '#...#', '.####', '....#', '.###.']),
    'h': (0, ['#....', '#....', '####.', '#...#', '#...#', '#...#', '#...#']),
    'i': (0, ['.#.', '...', '##.', '.#.', '.#.', '.#.', '###']),
    'j': (0, ['...#', '....', '..##', '...#', '...#', '...#', '...#', '#..#', '.##.']),
    'k': (0, ['#...', '#...', '#..#', '#.#.', '##..', '#.#.', '#..#']),
    'l': (0, ['##.', '.#.', '.#.', '.#.', '.#.', '.#.', '.##']),
    'm': (2, ['##.#.', '#.#.#', '#.#.#', '#.#.#', '#.#.#']),
    'n': (2, ['####.', '#...#', '#...#', '#...#', '#...#']),
    'o': (2, ['.###.', '#...#', '#...#', '#...#', '.###.']),
    'p': (2, ['####.', '#...#', '#...#', '#...#', '####.', '#....', '#....']),
    'q': (2, ['.####', '#...#', '#...#', '#...#', '.####', '....#', '....#']),
    'r': (2, ['#.##', '##..', '#...', '#...', '#...']),
    's': (2, ['.####', '#....', '.###.', '....#', '####.']),
    't': (1, ['.#..', '####', '.#..', '.#..', '.#..', '..##']),
    'u': (2, ['#...#', '#...#', '#...#', '#...#', '.####']),
    'v': (2, ['#...#', '#...#', '#...#', '.#.#.', '..#..']),
    'w': (2, ['#...#', '#...#', '#.#.#', '#.#.#', '.#.#.']),
    'x': (2, ['#...#', '.#.#.', '..#..', '.#.#.', '#...#']),
    'y': (2, ['#...#', '#...#', '#...#', '#...#', '.####', '....#', '.###.']),
    'z': (2, ['#####', '...#.', '..#..', '.#...', '#####']),
}
for k, (top, rows) in LO.items():
    glyph(k, top, *rows)

# --- acentos (se ponen encima/debajo de la letra base, centrados) ---
#   mayúsculas: filas -3 y -2 · minúsculas: -1 y 0
MARKS = {
    'acute': ['.#', '#.'],
    'grave': ['#.', '.#'],
    'dieresis': ['#.#'],
    'tilde': ['.##.#', '#..#.'],
}


def compose(ch, base, mark, upper):
    top, rows = G[base]
    m = MARKS[mark]
    w = len(rows[0])
    mw = len(m[0])
    # en las mayúsculas, la diéresis va a la altura de la segunda fila del acento (más pegada)
    mtop = (-3 if upper else -1) if len(m) == 2 else (-2 if upper else 0)
    if base in ('i',):
        rows = ['...'] * 2 + rows[2:]          # la «i» pierde su punto
        top = 0
    # el punto de abajo del acento queda encima de la columna del centro
    off = (w - mw) // 2
    if mark == 'acute':
        off = w // 2
    elif mark == 'grave':
        off = w // 2 - 1
    grid = {}
    for y, r in enumerate(rows):
        for x, c in enumerate(r):
            if c == '#':
                grid[(x, top + y)] = 1
    for y, r in enumerate(m):
        for x, c in enumerate(r):
            if c == '#':
                grid[(x + off, mtop + y)] = 1
    ys = [p[1] for p in grid]
    t, b = min(ys), max(ys)
    out = []
    for y in range(t, b + 1):
        out.append(''.join('#' if (x, y) in grid else '.' for x in range(w)))
    glyph(ch, t, *out)


for ch, base, mark in [
    ('á', 'a', 'acute'), ('é', 'e', 'acute'), ('í', 'i', 'acute'), ('ó', 'o', 'acute'), ('ú', 'u', 'acute'),
    ('à', 'a', 'grave'), ('è', 'e', 'grave'), ('ì', 'i', 'grave'), ('ò', 'o', 'grave'), ('ù', 'u', 'grave'),
    ('ä', 'a', 'dieresis'), ('ë', 'e', 'dieresis'), ('ï', 'i', 'dieresis'), ('ö', 'o', 'dieresis'), ('ü', 'u', 'dieresis'),
    ('ñ', 'n', 'tilde'),
]:
    compose(ch, base, mark, False)
for ch, base, mark in [
    ('Á', 'A', 'acute'), ('É', 'E', 'acute'), ('Í', 'I', 'acute'), ('Ó', 'O', 'acute'), ('Ú', 'U', 'acute'),
    ('À', 'A', 'grave'), ('È', 'E', 'grave'), ('Ì', 'I', 'grave'), ('Ò', 'O', 'grave'), ('Ù', 'U', 'grave'),
    ('Ä', 'A', 'dieresis'), ('Ë', 'E', 'dieresis'), ('Ï', 'I', 'dieresis'), ('Ö', 'O', 'dieresis'), ('Ü', 'U', 'dieresis'),
    ('Ñ', 'N', 'tilde'),
]:
    compose(ch, base, mark, True)

# cedillas (la cola baja por debajo de la línea base)
glyph('Ç', 0, '.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.', '..#..', '.#...')
glyph('ç', 2, '.####', '#....', '#....', '#....', '.####', '..#..', '.#...')

# --- puntuación y signos ---
glyph(' ', 0, '...')                                    # espacio (se ajusta abajo)
glyph('.', 6, '#')
glyph(',', 5, '.#', '.#', '#.')
glyph(':', 2, '#', '.', '#')                            # centrados en la altura de las cifras (relojes)
glyph(';', 2, '.#', '..', '..', '.#', '.#', '#.')
glyph('!', 0, '#', '#', '#', '#', '#', '.', '#')
glyph('¡', 0, '#', '.', '#', '#', '#', '#', '#')
glyph('?', 0, '.###.', '#...#', '....#', '...#.', '..#..', '.....', '..#..')
glyph('¿', 0, '..#..', '.....', '..#..', '.#...', '#....', '#...#', '.###.')
glyph("'", 0, '#', '#')
glyph('"', 0, '#.#', '#.#')
glyph('‘', 0, '.#', '#.')
glyph('’', 0, '.#', '#.')
glyph('“', 0, '.#.#', '#.#.')
glyph('”', 0, '.#.#', '#.#.')
glyph('«', 2, '..#..#', '.#..#.', '#..#..', '.#..#.', '..#..#')
glyph('»', 2, '#..#..', '.#..#.', '..#..#', '.#..#.', '#..#..')
glyph('-', 3, '###')
glyph('‐', 3, '###')
glyph('–', 3, '#####')
glyph('—', 3, '#######')
glyph('/', 0, '....#', '...#.', '...#.', '..#..', '.#...', '.#...', '#....')
glyph('\\', 0, '#....', '.#...', '.#...', '..#..', '...#.', '...#.', '....#')
glyph('|', 0, '#', '#', '#', '#', '#', '#', '#', '#')
glyph('(', 0, '..#', '.#.', '#..', '#..', '#..', '.#.', '..#')
glyph(')', 0, '#..', '.#.', '..#', '..#', '..#', '.#.', '#..')
glyph('[', 0, '###', '#..', '#..', '#..', '#..', '#..', '###')
glyph(']', 0, '###', '..#', '..#', '..#', '..#', '..#', '###')
glyph('{', 0, '..##', '.#..', '.#..', '#...', '.#..', '.#..', '..##')
glyph('}', 0, '##..', '..#.', '..#.', '...#', '..#.', '..#.', '##..')
glyph('+', 1, '..#..', '..#..', '#####', '..#..', '..#..')
glyph('±', 1, '..#..', '#####', '..#..', '.....', '#####')
glyph('×', 2, '#...#', '.#.#.', '..#..', '.#.#.', '#...#')
glyph('÷', 1, '..#..', '.....', '#####', '.....', '..#..')
glyph('%', 0, '##...', '##..#', '...#.', '..#..', '.#...', '#..##', '...##')
glyph('&', 0, '.##..', '#..#.', '#.#..', '.#...', '#.#.#', '#..#.', '.##.#')
glyph('@', 0, '.###.', '#...#', '....#', '.##.#', '#.#.#', '#.#.#', '.###.')
glyph('#', 0, '.#.#.', '.#.#.', '#####', '.#.#.', '#####', '.#.#.', '.#.#.')
glyph('*', 1, '..#..', '#.#.#', '.###.', '#.#.#', '..#..')
glyph('=', 2, '#####', '.....', '#####')
glyph('<', 0, '...#', '..#.', '.#..', '#...', '.#..', '..#.', '...#')
glyph('>', 0, '#...', '.#..', '..#.', '...#', '..#.', '.#..', '#...')
glyph('_', 8, '#####')
glyph('~', 2, '.##.#', '#..#.')
glyph('^', 0, '..#..', '.#.#.', '#...#')
glyph('`', 0, '#.', '.#')
glyph('´', 0, '.#', '#.')
glyph('¨', 0, '#.#')
glyph('°', 0, '.#.', '#.#', '.#.')
glyph('º', 0, '.#.', '#.#', '.#.', '...', '###')
glyph('ª', 0, '.##', '#.#', '.##', '...', '###')
glyph('·', 3, '#')
glyph('•', 2, '.#.', '###', '.#.')
glyph('…', 6, '#.#.#')
glyph('$', 0, '..#..', '.####', '#.#..', '.###.', '..#.#', '####.', '..#..')
glyph('€', 0, '..###', '.#...', '####.', '.#...', '####.', '.#...', '..###')
glyph('£', 0, '..##.', '.#..#', '.#...', '####.', '.#...', '.#...', '#####')
glyph('→', 1, '..#..', '...#.', '#####', '...#.', '..#..')
glyph('←', 1, '..#..', '.#...', '#####', '.#...', '..#..')
glyph('↑', 0, '..#..', '.###.', '#.#.#', '..#..', '..#..', '..#..', '..#..')
glyph('↓', 0, '..#..', '..#..', '..#..', '..#..', '#.#.#', '.###.', '..#..')
glyph('✓', 1, '....#', '...#.', '#.#..', '.#...', '.....')
glyph('□', 0, '#####', '#...#', '#...#', '#...#', '#...#', '#...#', '#####')   # para las que no hay

TABULAR = set('0123456789')
EXTRA_WIDTH = {' ': 3, ' ': 3}       # columnas del espacio (sin contar la de separación)


def gname(ch):
    if ch == '□':
        return '.notdef'
    cp = ord(ch)
    if cp == 0x20:
        return 'space'
    n = UV2AGL.get(cp)
    return n if n else 'uni%04X' % cp


# ---------------------------------------------------------------------------
# Contornos
# ---------------------------------------------------------------------------
N_OFF = 8                         # puntos de control por círculo (todos fuera de la curva)
R_OFF = R / math.cos(math.pi / N_OFF)


def dot(pen, cx, cy):
    """Un círculo de radio R centrado en (cx, cy): 8 arcos cuadráticos.

    Con todos los puntos de control fuera de la curva, TrueType pone uno sobre la
    curva en el medio de cada par: quedan exactamente sobre el círculo. Sentido
    de las agujas del reloj (ángulo decreciente), que es el de un contorno
    exterior en TrueType."""
    pts = []
    for k in range(N_OFF):
        a = math.pi / 2 - (k + 0.5) * 2 * math.pi / N_OFF
        pts.append((round(cx + R_OFF * math.cos(a)), round(cy + R_OFF * math.sin(a))))
    pen.qCurveTo(*pts, None)
    pen.closePath()


def cell_xy(col, row):
    """Centro del punto en la columna col (desde 0) y la fila row (0 = arriba de las mayúsculas)."""
    return (col + 1) * P, R + (6 - row) * P


def build_glyph(ch):
    top, rows = G[ch]
    pen = TTGlyphPen(None)
    if ch not in (' ',):
        for y, r in enumerate(rows):
            for x, c in enumerate(r):
                if c == '#':
                    dot(pen, *cell_xy(x, top + y))
    w = len(rows[0])
    adv = (EXTRA_WIDTH.get(ch, w) + 1) * P
    return pen.glyph(), adv


# ---------------------------------------------------------------------------
# Interletrado (kerning) automático sobre la rejilla
# ---------------------------------------------------------------------------
def profile(ch):
    """Por fila: (columna del punto más a la izquierda, más a la derecha contando desde el borde derecho)."""
    top, rows = G[ch]
    w = len(rows[0])
    left, right = {}, {}
    for y, r in enumerate(rows):
        if '#' in r:
            left[top + y] = r.index('#')
            right[top + y] = w - 1 - r.rindex('#')
    return left, right


def kern_value(a, b):
    """-P si al juntar los dos glifos una columna sigue quedando al menos una columna
    vacía entre puntos de filas iguales o vecinas (en diagonal tampoco se tocan)."""
    _, ra = profile(a)
    lb, _ = profile(b)
    if not ra or not lb:
        return 0
    worst = 99
    for ya, xa in ra.items():
        for yb, xb in lb.items():
            dy = abs(ya - yb)
            gap = xa + xb + 2              # distancia entre centros, en pasos
            if dy <= 1:
                worst = min(worst, gap)
            elif dy == 2:
                worst = min(worst, gap + 1)   # a dos filas basta con no quedar en la misma columna
    return -P if worst >= 3 else 0


KERN_SET = [c for c in G if (c.isalpha() or c in '.,\'"‘’“”-–…«»)(?!¿¡') and c not in TABULAR and c != '□']


def kern_fea():
    lines = ['languagesystem DFLT dflt;', 'languagesystem latn dflt;', 'feature kern {']
    n = 0
    for a in KERN_SET:
        for b in KERN_SET:
            v = kern_value(a, b)
            if v:
                lines.append('  pos %s %s %d;' % (gname(a), gname(b), v))
                n += 1
    lines.append('} kern;')
    return '\n'.join(lines) + '\n', n


# ---------------------------------------------------------------------------
def panose():
    p = Panose()
    p.bFamilyType = 2          # texto latino
    p.bWeight = 5              # libro
    p.bProportion = 3          # moderna (proporcional)
    return p


def build():
    chars = list(G.keys())
    order = ['.notdef'] + [gname(c) for c in chars if gname(c) != '.notdef']
    glyphs, metrics, cmap = {}, {}, {}
    for c in chars:
        g, adv = build_glyph(c)
        n = gname(c)
        glyphs[n] = g
        metrics[n] = adv
        if n != '.notdef':
            cmap[ord(c)] = n
    # espacio duro = espacio
    cmap[0xA0] = 'space'

    fb = FontBuilder(UPM, isTTF=True)
    fb.setupGlyphOrder(order)
    fb.setupCharacterMap(cmap)
    fb.setupGlyf(glyphs)
    glyf = fb.font['glyf']
    hm = {}
    for n in order:
        g = glyf[n]
        g.recalcBounds(glyf)
        lsb = getattr(g, 'xMin', 0) if g.numberOfContours else 0
        hm[n] = (metrics[n], lsb)
    fb.setupHorizontalMetrics(hm)

    asc, desc = 1000, -250             # caben los acentos de las mayúsculas (hasta 980) y las descendentes (-200)
    fb.setupHorizontalHeader(ascent=asc, descent=desc, lineGap=0)
    fb.setupNameTable({
        'copyright': '© 2026 luckicla',
        'familyName': FAMILY,
        'styleName': 'Regular',
        'uniqueFontIdentifier': '%s;%s;luckicla' % (VERSION, FAMILY),
        'fullName': FAMILY,
        'version': 'Version ' + VERSION,
        'psName': FAMILY + '-Regular',
        'manufacturer': 'luckicla',
        'designer': 'luckicla',
        'description': 'Fuente de matriz de puntos 5×7 de ZenCalendar (diseño Dot).',
        'vendorURL': 'https://github.com/luckicla/zencalendar',
        'designerURL': 'https://github.com/luckicla',
        'licenseDescription': 'This Font Software is licensed under the SIL Open Font License, Version 1.1. '
                              'This license is available with a FAQ at: https://openfontlicense.org',
        'licenseInfoURL': 'https://openfontlicense.org',
        'typographicFamily': FAMILY,
        'typographicSubfamily': 'Regular',
    })
    fb.setupOS2(
        version=4, usWeightClass=400, usWidthClass=5, fsType=0, achVendID='LCKC',
        sTypoAscender=asc, sTypoDescender=desc, sTypoLineGap=0,   # iguales en Mac, Windows y Android
        usWinAscent=asc, usWinDescent=-desc,
        sxHeight=XH, sCapHeight=CAP, usDefaultChar=0, usBreakChar=32,
        fsSelection=0x40 | 0x80,             # REGULAR + USE_TYPO_METRICS
        ySubscriptXSize=650, ySubscriptYSize=600, ySubscriptYOffset=75,
        ySuperscriptXSize=650, ySuperscriptYSize=600, ySuperscriptYOffset=350,
        yStrikeoutSize=2 * R, yStrikeoutPosition=R + 3 * P - R,
        panose=panose(),
    )
    fb.setupPost(italicAngle=0, underlinePosition=-120, underlineThickness=2 * R, isFixedPitch=0)
    # fecha fija: volver a generar la fuente no cambia el archivo si no cambia el diseño
    stamp = timestampFromString('Mon Nov 23 12:00:00 2026')
    fb.setupHead(unitsPerEm=UPM, fontRevision=float(VERSION), created=stamp, modified=stamp)
    font = fb.font
    gasp = newTable('gasp')
    gasp.version = 1
    gasp.gaspRange = {0xFFFF: 0x000A}     # suavizado (simétrico), sin ajuste a la rejilla: no lleva hinting
    font['gasp'] = gasp
    font['OS/2'].recalcCodePageRanges(font)
    if 'ltag' in font:
        del font['ltag']
    fea, npairs = kern_fea()
    addOpenTypeFeaturesFromString(font, fea)
    return font, len(chars), npairs


# ---------------------------------------------------------------------------
# Los mismos dibujos para las matrices de puntos que se pintan con SVG
# (el titular de la app y la pantalla de la portada): se escriben entre las
# marcas «<zendot>» y «</zendot>» de esos archivos, así no hay dos dibujos.
# ---------------------------------------------------------------------------
JS_TARGETS = {
    # app: todo lo que no es minúscula (el titular va siempre en mayúsculas). Formato «fila de arriba|filas».
    os.path.join('web', 'js', 'ui', 'dot.js'): 'all',
    # portada de la web: solo las cifras
    os.path.join('docs', 'js', 'dot.js'): 'digits',
}


def js_block(kind, indent):
    def bits(rows):
        return ' '.join(r.replace('#', '1').replace('.', '0') for r in rows)
    lines = []
    if kind == 'digits':
        lines.append('const DIGITS = {')
        for c in '0123456789':
            top, rows = G[c]
            lines.append("  %s: [%s]," % (c, ', '.join("'%s'" % r.replace('#', '1').replace('.', '0') for r in rows)))
        lines.append('};')
    else:
        chars = [c for c in G if c not in (' ', '□') and not c.islower()]
        lines.append('const F = {')
        row = []
        for c in chars:
            top, rows = G[c]
            row.append("%s: '%d|%s'" % (repr(c), top, bits(rows)))   # repr de Python = cadena válida de JS
            if len(row) == 4:
                lines.append('  ' + ', '.join(row) + ',')
                row = []
        if row:
            lines.append('  ' + ', '.join(row) + ',')
        lines.append('};')
    return '\n'.join(indent + l for l in lines)


def write_js():
    for rel, kind in JS_TARGETS.items():
        path = os.path.join(ROOT, rel)
        with open(path, encoding='utf-8') as f:
            src = f.read()
        a = src.index('// <zendot>')
        b = src.index('// </zendot>')
        line0 = src.rfind('\n', 0, a) + 1
        indent = src[line0:a]
        head = src[:a] + '// <zendot> (lo escribe tools/mkfont.py: no lo cambies a mano)\n'
        new = head + js_block(kind, indent) + '\n' + indent + src[b:]
        if new != src:
            with open(path, 'w', encoding='utf-8') as f:
                f.write(new)
        print('    →', rel, '(dibujos de la matriz)')


def main():
    write_js()
    font, nglyphs, npairs = build()
    out = os.path.join(ROOT, 'assets', 'fonts')
    os.makedirs(out, exist_ok=True)
    ttf = os.path.join(out, 'ZenDot.ttf')
    woff = os.path.join(out, 'ZenDot.woff')
    font.save(ttf)
    w = TTFont(ttf, recalcTimestamp=False)   # si no, la fecha de «modificado» cambia cada vez
    w.flavor = 'woff'
    w.save(woff)
    copies = [
        (woff, os.path.join(ROOT, 'web', 'fonts', 'ZenDot.woff')),
        (woff, os.path.join(ROOT, 'docs', 'fonts', 'ZenDot.woff')),
        (ttf, os.path.join(ROOT, 'android', 'app', 'src', 'main', 'res', 'font', 'zendot.ttf')),
    ]
    for src, dst in copies:
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copyfile(src, dst)
    print('  ✓ ZenDot: %d glifos, %d parejas de interletrado' % (nglyphs, npairs))
    print('    %s (%d bytes), %s (%d bytes)' % (os.path.relpath(ttf, ROOT), os.path.getsize(ttf), os.path.relpath(woff, ROOT), os.path.getsize(woff)))
    for _, dst in copies:
        print('    →', os.path.relpath(dst, ROOT))


if __name__ == '__main__':
    if sys.version_info < (3, 7):
        sys.exit('Hace falta Python 3.7 o más nuevo')
    main()
