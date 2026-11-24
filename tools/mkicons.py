#!/usr/bin/env python3
"""ZenCalendar: todos los iconos a partir de assets/logo.svg.

    python3 tools/mkicons.py

Hace falta rsvg-convert (librsvg) y Pillow. Genera, para cada variante de
color (pastel = el original, sakura, menta, noche, cielo, melocoton):

  web/img/icons/<variante>.png              512 px (para elegir el icono en Ajustes)
  android/app/src/main/res/mipmap-*/ic_zc_<variante>.png              icono «de siempre» (legacy)
  android/app/src/main/res/mipmap-*/ic_zc_<variante>_fg.png / _bg.png / _mono.png  capas del adaptativo
  android/app/src/main/res/mipmap-anydpi-v26/ic_zc_<variante>.xml

y además (del pastel):

  web/img/favicon.png, web/img/icon-192.png, web/img/icon-512.png, web/img/icon-maskable-512.png
  android/app/src/main/res/drawable-*/ic_stat_zc.png    icono pequeño blanco de las notificaciones
  desktop/build/icon.ico                                 16…256 px
  desktop/build/icons/<variante>.ico                     (el icono de la ventana/bandeja en Windows)

y la variante «dot» (diseño Dot), que no sale del logo sino de puntos dibujados
aquí: squircle negro con una hoja de calendario de puntos blancos (contorno,
dos pestañas y cabecera), una «Z» de puntos dentro y un punto rojo #D71921 al
final de la cabecera. Mismos archivos que las demás variantes, y además
android/app/src/main/res/drawable-*/wgrid_tile.png (la rejilla de los widgets Dot).

Más iconos Dot (DOT_ICONS), con los mismos archivos: dot_blanco, dot_rojo, dot_mes,
dot_z, dot_glyph y dot_reloj. Cada uno tiene su versión sencilla para 16…32 px
(en el .ico y en el mipmap de 48 px) y su silueta para los iconos con tema.

    python3 tools/mkicons.py --dot     solo lo del diseño Dot (y la hoja de muestras
                                       /tmp/iconos-dot.png con todos los iconos Dot)
"""
import io
import os
import re
import subprocess
import sys
import xml.etree.ElementTree as ET

from PIL import Image, ImageChops

ROOT = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
SVG = os.path.join(ROOT, 'assets', 'logo.svg')
RES = os.path.join(ROOT, 'android', 'app', 'src', 'main', 'res')
NS = 'http://www.w3.org/2000/svg'
ET.register_namespace('', NS)

# colores del logo original → los de cada variante
#   bg0/bg1: degradado del fondo · ink0/ink1: degradado de la «Z»
#   dot0/dot1: los agujeritos de las pestañas · shadow: color de la sombra · page: la hoja
ORIGINAL = {
    'bg0': '#9F8DFF', 'bg1': '#F0A6CC', 'ink0': '#8E7BFA', 'ink1': '#E58FBF',
    'dot0': '#D9D0FF', 'dot1': '#F6D3E6', 'shadow': '#4B2E8F', 'page': '#ffffff',
}
VARIANTS = {
    'pastel': {},
    'sakura': {'bg0': '#FF8FBF', 'bg1': '#FFC9A8', 'ink0': '#F0679E', 'ink1': '#FF9E8A', 'dot0': '#FFD3E4', 'dot1': '#FFE2D3', 'shadow': '#9C2F5E'},
    'menta': {'bg0': '#5CCFB3', 'bg1': '#A8E6A3', 'ink0': '#2FB393', 'ink1': '#7BCF74', 'dot0': '#C6F0E5', 'dot1': '#DDF5D9', 'shadow': '#1D6B58'},
    'noche': {'bg0': '#2D2A55', 'bg1': '#5B4A8C', 'ink0': '#A894FF', 'ink1': '#FF9ACB', 'dot0': '#D9D0FF', 'dot1': '#F6D3E6', 'shadow': '#05030F', 'page': '#F4F0FF'},
    'cielo': {'bg0': '#6FB6FF', 'bg1': '#B3E1FF', 'ink0': '#4C9BEF', 'ink1': '#7CC7F2', 'dot0': '#CFE6FF', 'dot1': '#DDF2FF', 'shadow': '#1E4E85'},
    'melocoton': {'bg0': '#FF9F7A', 'bg1': '#FFD08A', 'ink0': '#FF8460', 'ink1': '#FFB45E', 'dot0': '#FFDCCD', 'dot1': '#FFEACB', 'shadow': '#9A4422'},
}
DENS = {'mdpi': 1, 'hdpi': 1.5, 'xhdpi': 2, 'xxhdpi': 3, 'xxxhdpi': 4}


def recolor(svg, variant):
    cols = dict(ORIGINAL)
    cols.update(VARIANTS[variant])
    out = svg
    # (con marcas intermedias, por si un color nuevo coincide con uno viejo)
    for k, v in ORIGINAL.items():
        out = re.sub(re.escape(v), '@@' + k + '@@', out, flags=re.I)
    for k, v in cols.items():
        out = out.replace('@@' + k + '@@', v)
    return out


def render(svg, size):
    """SVG (texto) → imagen RGBA de size×size."""
    p = subprocess.run(['rsvg-convert', '-w', str(size), '-h', str(size), '-f', 'png'], input=svg.encode('utf-8'), capture_output=True, check=True)
    return Image.open(io.BytesIO(p.stdout)).convert('RGBA')


def is_background(el):
    return el.tag == '{%s}rect' % NS and el.get('width') == '1024' and el.get('height') == '1024'


def layers(svg):
    """El SVG partido en capas: fondo (cuadrado entero, sin redondear), la hoja
    con la «Z» (para el adaptativo, más pequeña y centrada) y solo la «Z»."""
    root = ET.fromstring(svg)
    kids = list(root)

    def make(keep, transform=None, square=False):
        r = ET.fromstring(svg)
        for el in list(r):
            r.remove(el)
        g = ET.SubElement(r, '{%s}g' % NS)
        if transform:
            g.set('transform', transform)
        for el in kids:
            if el.tag == '{%s}defs' % NS:
                r.insert(0, el)
                continue
            if keep(el):
                e2 = ET.fromstring(ET.tostring(el))
                if square and e2.get('rx'):
                    e2.set('rx', '0')
                g.append(e2)
        return ET.tostring(r, encoding='unicode')

    bg = make(is_background, square=True)
    # el adaptativo de Android: 108 dp, se ven los 72 del centro y la zona segura son 66 → la hoja al 80 %
    fg = make(lambda e: not is_background(e), transform='translate(512 512) scale(0.80) translate(-512 -512)')
    zonly = make(lambda e: e.tag == '{%s}path' % NS, transform='translate(512 512) scale(0.80) translate(-512 -512)')
    return bg, fg, zonly


def maskable_svg(svg):
    """Fondo a sangre y el dibujo dentro de la zona segura (círculo del 80 %)."""
    root = ET.fromstring(svg)
    out = ET.fromstring(svg)
    for el in list(out):
        out.remove(el)
    for el in root:
        if el.tag == '{%s}defs' % NS:
            out.append(el)
    gb = ET.SubElement(out, '{%s}g' % NS)
    gf = ET.SubElement(out, '{%s}g' % NS)
    gf.set('transform', 'translate(512 512) scale(0.78) translate(-512 -512)')
    for el in root:
        if el.tag == '{%s}defs' % NS:
            continue
        e2 = ET.fromstring(ET.tostring(el))
        if is_background(el):
            e2.set('rx', '0')
            gb.append(e2)
        else:
            gf.append(e2)
    return ET.tostring(out, encoding='unicode')


def mono(fg_img, z_img):
    """Silueta blanca (Android 13 «iconos con tema»): la hoja con la Z recortada."""
    a = fg_img.getchannel('A')
    za = z_img.getchannel('A')
    a = ImageChops.subtract(a, za)
    out = Image.new('RGBA', fg_img.size, (255, 255, 255, 0))
    out.putalpha(a)
    return out


def save(img, path, size=None):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if size and img.size != (size, size):
        img = img.resize((size, size), Image.LANCZOS)
    img.save(path, optimize=True)


ADAPTIVE = '''<?xml version="1.0" encoding="utf-8"?>
<!-- generado por tools/mkicons.py -->
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_zc_{v}_bg" />
    <foreground android:drawable="@mipmap/ic_zc_{v}_fg" />
    <monochrome android:drawable="@mipmap/ic_zc_{v}_mono" />
</adaptive-icon>
'''


# ---------------------------------------------------------------------------
# Variante «dot»
# ---------------------------------------------------------------------------
DOT_RED = '#D71921'
DOT_PITCH = 64          # paso de la rejilla (en el lienzo de 1024)
DOT_R = 24              # radio de cada punto
# encendidos: (columna, fila) con el (0, 0) en el centro del icono.
# Una hoja de calendario de puntos (sin las cuatro esquinas, para que se vea redondeada),
# con sus dos pestañas arriba, la fila de cabecera y una «Z» de 5×5 dentro, separada
# una fila de la cabecera y otra del borde de abajo.
DOT_PAGE = ([(k, -3) for k in range(-3, 4)] + [(k, 5) for k in range(-3, 4)]
            + [(-4, m) for m in range(-2, 5)] + [(4, m) for m in range(-2, 5)])
DOT_TABS = [(-2, -5), (-2, -4), (2, -5), (2, -4)]
DOT_Z = [(k, -1) for k in range(-2, 3)] + [(1, 0), (0, 1), (-1, 2)] + [(k, 3) for k in range(-2, 3)]
DOT_RED_AT = (3, -3)    # el punto rojo («hoy»): el final de la cabecera, arriba a la derecha
DOT_ON = [p for p in DOT_PAGE + DOT_TABS + DOT_Z if p != DOT_RED_AT]


DOT_FULL = 1.0      # escala del icono entero
DOT_ADAPTIVE = 0.74  # en el adaptativo: todo dentro de la zona segura (círculo de 66 dp de 108)


# ---------------------------------------------------------------------------
# Más iconos Dot: todos de puntos redondos (o tiras de luz, en «glyph»),
# monocromos y con, como mucho, un toque de rojo.
#   dot_blanco  el de «dot» en negativo: papel blanco, puntos negros
#   dot_rojo    el de «dot» sobre rojo, con el punto de «hoy» en negro
#   dot_mes     un mes de 7×5 puntos: lo pasado en gris, la semana encendida, hoy en rojo
#   dot_z       una «Z» grande en una pantalla de 7×7 puntos, el primero en rojo
#   dot_glyph   un panel gris translúcido con tiras de luz que forman una hoja
#   dot_reloj   «24» en cifras de ZenDot (5×7) bajo una cabecera roja con sus pestañas
# Los ids van con «_» (no «-»): son nombres de recursos de Android.
# ---------------------------------------------------------------------------
# patrones 5×7 de las cifras de ZenDot (los mismos que tools/mkfont.py)
ZD_DIGITS = {
    '2': ('.###.', '#...#', '....#', '...#.', '..#..', '.#...', '#####'),
    '4': ('...#.', '..##.', '.#.#.', '#..#.', '#####', '...#.', '...#.'),
}
SHEEN = ('<radialGradient id="g" cx="0.25" cy="0.08" r="0.9"><stop offset="0" stop-color="#ffffff" stop-opacity="0.09"/>'
         '<stop offset="0.6" stop-color="#ffffff" stop-opacity="0"/></radialGradient>')


class Pic:
    """Un dibujo en el lienzo de 1024 con el (0, 0) en el centro. Los colores van por papel
    («on», «mid», «dim», «red»…) y cada icono dice cuál es cuál; en la capa «mono» todo es
    blanco y lo apagado se vuelve semitransparente (o desaparece)."""

    def __init__(self, scale, pal, mono=False):
        self.k, self.pal, self.mono = scale, pal, mono
        self.o, self.reach = [], 0.0

    def _fill(self, role):
        if self.mono:
            op = {'dim': 0.0, 'mid': 0.45, 'past': 0.45, 'dim2': 0.22}.get(role, 1.0)
            return '#FFFFFF', op
        c = self.pal[role]
        return (c if isinstance(c, tuple) else (c, 1.0))

    def dot(self, x, y, r, role='on'):
        col, op = self._fill(role)
        if role != 'dim':
            self.reach = max(self.reach, (x * x + y * y) ** 0.5 + r)
        if op <= 0:
            return
        self.o.append('<circle cx="%.2f" cy="%.2f" r="%.2f" fill="%s"%s/>' % (512 + x * self.k, 512 + y * self.k, r * self.k, col, '' if op >= 1 else ' fill-opacity="%.2f"' % op))

    def strip(self, pts, w, role='on', glow=True, corner=0):
        """Una tira de luz por los puntos pts (con las esquinas redondeadas con radio corner)."""
        col, op = self._fill(role)
        for x, y in pts:
            self.reach = max(self.reach, (x * x + y * y) ** 0.5 + w / 2)
        P = [(512 + x * self.k, 512 + y * self.k) for x, y in pts]
        d = 'M%.2f %.2f' % P[0]
        cr = corner * self.k
        for i in range(1, len(P)):
            if cr and 0 < i < len(P) - 1:
                (ax, ay), (bx, by), (cx, cy) = P[i - 1], P[i], P[i + 1]
                def toward(px, py, qx, qy, dist):
                    L = ((qx - px) ** 2 + (qy - py) ** 2) ** 0.5
                    return px + (qx - px) * dist / L, py + (qy - py) * dist / L
                p1, p2 = toward(bx, by, ax, ay, cr), toward(bx, by, cx, cy, cr)
                d += ' L%.2f %.2f Q%.2f %.2f %.2f %.2f' % (p1[0], p1[1], bx, by, p2[0], p2[1])
            else:
                d += ' L%.2f %.2f' % P[i]
        f = ' filter="url(#glow)"' if glow and not self.mono else ''
        self.o.append('<path d="%s" fill="none" stroke="%s" stroke-opacity="%.2f" stroke-width="%.2f" stroke-linecap="round" stroke-linejoin="round"%s/>' % (d, col, op, w * self.k, f))


def squircle_bg(fill, extra='', sheen=True, defs='', bleed_sheen=True):
    """Capas del fondo: (full, bg). full lleva el squircle; bg, a sangre para el adaptativo."""
    def mk(rx):
        s = '<rect width="1024" height="1024"%s fill="%s"/>' % (' rx="%d"' % rx if rx else '', fill)
        if sheen and (rx or bleed_sheen):
            s += '<rect width="1024" height="1024"%s fill="url(#g)"/>' % (' rx="%d"' % rx if rx else '')
        return s + extra.replace('RX', str(rx))
    return defs + (SHEEN if sheen else ''), mk(232), mk(0)


class DotIcon:
    """Un icono Dot: name (para el usuario), bg() → (defs, fondo con squircle, fondo a sangre),
    draw(pic, small) → los puntos. adaptive: la escala del dibujo en el adaptativo (None → la que
    cabe en la zona segura)."""

    def __init__(self, name, pal, bg, draw, adaptive=None, defs=''):
        self.name, self.pal, self.bg, self.draw, self.adaptive, self.defs = name, pal, bg, draw, adaptive, defs

    def svg(self, layer='full', scale=1.0):
        out = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">']
        bdefs, bfull, bbleed = self.bg()
        out.append('<defs>%s%s</defs>' % (bdefs, self.defs if layer != 'mono' else ''))
        if layer in ('full', 'small'):
            out.append(bfull)
        if layer == 'bg':
            out.append(bbleed)
        if layer != 'bg':
            pic = Pic(scale, self.pal, mono=(layer == 'mono'))
            self.draw(pic, layer == 'small')
            out.extend(pic.o)
        out.append('</svg>')
        return '\n'.join(out)

    def reach(self):
        pic = Pic(1.0, self.pal)
        self.draw(pic, False)
        return pic.reach

    def adaptive_scale(self):
        # 108 dp de lienzo, 66 dp de zona segura: radio 313 en el lienzo de 1024 (se deja un poco de aire)
        return self.adaptive or min(0.80, 312.0 / self.reach())


# --- dot (y sus negativos): la hoja de calendario con la «Z» ---
def draw_sheet(pic, small):
    p, r = DOT_PITCH, (30 if small else DOT_R)
    for k, m in DOT_ON:
        pic.dot(k * p, m * p, r, 'on')
    pic.dot(DOT_RED_AT[0] * p, DOT_RED_AT[1] * p, r, 'red')


# --- dot_mes ---
def draw_month(pic, small):
    p = 106
    r = 47 if small else 33
    y0 = -160 if not small else -212
    if not small:
        # la fila de los días de la semana: puntitos grises
        for c in range(7):
            pic.dot((c - 3) * p, -280, 14, 'mid')
    day = 0
    for row in range(5):
        for c in range(7):
            if row == 0 and c < 2:
                continue        # el mes empieza en miércoles…
            day += 1
            if day > 30:
                continue        # …y tiene 30 días
            role = 'red' if day == 24 else 'on' if row == 3 else 'past' if day < 24 else 'dim2'
            pic.dot((c - 3) * p, y0 + row * p, r, role)


# --- dot_z ---
def draw_bigz(pic, small):
    p, n = 92, 7
    r = 44 if small else 33
    h = (n - 1) / 2
    z = set()
    for c in range(n):
        z.add((c, 0)); z.add((c, n - 1))
    for i in range(1, n - 1):
        z.add((n - 1 - i, i))
    for c in range(n):
        for m in range(n):
            x, y = (c - h) * p, (m - h) * p
            if (c, m) == (n - 1, 0):
                pic.dot(x, y, r, 'red')
            elif (c, m) in z:
                pic.dot(x, y, r, 'on')
            elif not small:
                pic.dot(x, y, r * 0.55, 'dim')


# --- dot_glyph ---
# (en el espacio del lienzo: con el de la caja de cada tira, las rectas, que no tienen alto, desaparecían)
GLOW = ('<filter id="glow" filterUnits="userSpaceOnUse" x="0" y="0" width="1024" height="1024">'
        '<feGaussianBlur in="SourceGraphic" stdDeviation="16" result="b"/>'
        '<feColorMatrix in="b" type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 0.9 0" result="b2"/>'
        '<feMerge><feMergeNode in="b2"/><feMergeNode in="SourceGraphic"/></feMerge></filter>')


def glyph_bg():
    defs = ('<linearGradient id="gp" x1="0" y1="0" x2="0.35" y2="1"><stop offset="0" stop-color="#3A3A3E"/>'
            '<stop offset="1" stop-color="#161618"/></linearGradient>'
            '<linearGradient id="gs" x1="0" y1="0" x2="1" y2="1"><stop offset="0.28" stop-color="#ffffff" stop-opacity="0"/>'
            '<stop offset="0.42" stop-color="#ffffff" stop-opacity="0.07"/><stop offset="0.52" stop-color="#ffffff" stop-opacity="0"/></linearGradient>')
    # «por dentro» de la trasera transparente: unas líneas finas y cuatro tornillitos, muy flojos
    inner = ''.join('<circle cx="%d" cy="%d" r="11" fill="none" stroke="#ffffff" stroke-opacity="0.13" stroke-width="4"/>' % (x, y)
                    for x, y in ((150, 150), (874, 150), (150, 874), (874, 874)))
    inner += ('<path d="M150 512 H250 M774 512 H874 M512 874 V930" stroke="#ffffff" stroke-opacity="0.08" stroke-width="4" fill="none"/>'
              '<rect x="96" y="96" width="832" height="832" rx="150" fill="none" stroke="#ffffff" stroke-opacity="0.06" stroke-width="4"/>')
    d, full, bleed = squircle_bg('url(#gp)', inner + '<rect width="1024" height="1024" rx="RX" fill="url(#gs)"/>', sheen=True, defs=defs)
    return d, full, bleed


def draw_glyph(pic, small):
    w = 58 if small else 36
    g = not small
    # las pestañas
    for x in (-125, 125):
        pic.strip([(x, -318), (x, -246)], w, 'on', g)
    # la cabecera
    pic.strip([(-235, -172), (235, -172)], w, 'on', g)
    # la hoja: una U con las esquinas redondeadas
    pic.strip([(-250, -88), (-250, 285), (250, 285), (250, -88)], w, 'on', g, corner=70)
    # dentro: un evento (una tira corta y más floja) y hoy, en rojo
    if not small:
        pic.strip([(-150, 30), (20, 30)], 26, 'mid', g)
        pic.strip([(-150, 132), (-60, 132)], 26, 'mid', g)
    pic.dot(130 if not small else 0, 30 if not small else 60, 30 if not small else 46, 'red')


# --- dot_reloj ---
def draw_clock(pic, small):
    p = 54
    r = 25 if small else 20.5
    oy = 1  # filas de -6 a 4: el centro en la -1
    # las pestañas (dos puntos de alto) y la cabecera roja
    for c in (-3, 3):
        for m in (-6, -5):
            pic.dot(c * p, (m + oy) * p, r, 'on')
    for c in range(-5, 6):
        pic.dot(c * p, (-4 + oy) * p, r, 'red')
    for ch, c0 in (('2', -5), ('4', 1)):
        for m, line in enumerate(ZD_DIGITS[ch]):
            for i, b in enumerate(line):
                x, y = (c0 + i) * p, (m - 2 + oy) * p
                if b == '#':
                    pic.dot(x, y, r, 'on')


def black_bg():
    return squircle_bg('#000000')


DOT_ICONS = {
    # (el fondo del adaptativo de «dot», negro liso como siempre)
    'dot': DotIcon('Dot', {'on': '#FFFFFF', 'red': DOT_RED}, lambda: squircle_bg('#000000', bleed_sheen=False), draw_sheet, adaptive=DOT_ADAPTIVE),
    'dot_blanco': DotIcon('Dot blanco', {'on': '#0B0B0B', 'red': DOT_RED},
                          lambda: squircle_bg('url(#pw)', sheen=False, defs='<linearGradient id="pw" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FBFBF9"/><stop offset="1" stop-color="#E4E4E0"/></linearGradient>'),
                          draw_sheet, adaptive=DOT_ADAPTIVE),
    'dot_rojo': DotIcon('Dot rojo', {'on': '#FFFFFF', 'red': '#000000'},
                        lambda: squircle_bg('url(#pr)', sheen=True, defs='<linearGradient id="pr" x1="0" y1="0" x2="0.4" y2="1"><stop offset="0" stop-color="#E52A2F"/><stop offset="1" stop-color="#C3121A"/></linearGradient>'),
                        draw_sheet, adaptive=DOT_ADAPTIVE),
    'dot_mes': DotIcon('Dot mes', {'on': '#FFFFFF', 'red': DOT_RED, 'mid': '#6E6E6E', 'past': '#5C5C5C', 'dim2': '#262626'}, black_bg, draw_month),
    'dot_z': DotIcon('Dot Z', {'on': '#FFFFFF', 'red': DOT_RED, 'dim': '#232323'}, black_bg, draw_bigz),
    'dot_glyph': DotIcon('Glyph', {'on': '#F7F7F7', 'red': DOT_RED, 'mid': ('#FFFFFF', 0.55)}, glyph_bg, draw_glyph, defs=GLOW),
    'dot_reloj': DotIcon('Dot reloj', {'on': '#FFFFFF', 'red': DOT_RED}, black_bg, draw_clock, adaptive=0.76),
}


def dot_ico(path, ic=None):
    """.ico de Windows: de 16 a 32 px, la versión sencilla (puntos más gordos, sin los apagados)."""
    ic = ic or DOT_ICONS['dot']
    sizes = [16, 24, 32, 48, 64, 128, 256]
    imgs = [render(ic.svg('small' if s <= 32 else 'full', DOT_FULL), s) for s in sizes]
    imgs[-1].save(path, sizes=[(s, s) for s in sizes], append_images=imgs[:-1])


def make_dot_icon(v):
    ic = DOT_ICONS[v]
    big = render(ic.svg('full', DOT_FULL), 1024)
    save(big, os.path.join(ROOT, 'web', 'img', 'icons', v + '.png'), 512)
    ico = os.path.join(ROOT, 'desktop', 'build', 'icons', v + '.ico')
    os.makedirs(os.path.dirname(ico), exist_ok=True)
    dot_ico(ico, ic)
    # adaptativo: 108 dp con los 66 del centro seguros
    k = ic.adaptive_scale()
    bg_i, fg_i, mono_i = render(ic.svg('bg', k), 432), render(ic.svg('fg', k), 432), render(ic.svg('mono', k), 432)
    small = render(ic.svg('small', DOT_FULL), 1024)
    for d, f in DENS.items():
        folder = os.path.join(RES, 'mipmap-' + d)
        # el legacy de 48 dp: en mdpi (48 px) la versión sencilla, que a ese tamaño se lee mejor
        save(small if f < 1.5 and v != 'dot' else big, os.path.join(folder, 'ic_zc_%s.png' % v), int(48 * f))
        save(fg_i, os.path.join(folder, 'ic_zc_%s_fg.png' % v), int(108 * f))
        save(bg_i, os.path.join(folder, 'ic_zc_%s_bg.png' % v), int(108 * f))
        save(mono_i, os.path.join(folder, 'ic_zc_%s_mono.png' % v), int(108 * f))
    os.makedirs(os.path.join(RES, 'mipmap-anydpi-v26'), exist_ok=True)
    with open(os.path.join(RES, 'mipmap-anydpi-v26', 'ic_zc_%s.xml' % v), 'w', encoding='utf-8') as f:
        f.write(ADAPTIVE.format(v=v))
    print('  ✓ %s (adaptativo al %d %%)' % (v, round(k * 100)))
    return big, small, bg_i, fg_i, mono_i


def make_dot():
    out = {}
    for v in DOT_ICONS:
        out[v] = make_dot_icon(v)
    return out


def dot_sheet(made, path='/tmp/iconos-dot.png'):
    """Hoja de muestras: cada icono Dot a varios tamaños, con las máscaras redonda y squircle
    del adaptativo, la zona segura y el monocromo de Android 13."""
    from PIL import ImageDraw, ImageFont
    try:
        font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf', 15)
        bold = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', 17)
    except OSError:
        font = bold = ImageFont.load_default()
    cols = [('192', 192), ('96', 96), ('48', 48), ('32 (ico)', 32), ('16 (ico)', 16), ('redondo', 112), ('squircle', 112),
            ('zona segura', 112), ('monocromo', 112), ('fondo oscuro', 112)]
    pad, rowh, lab = 24, 230, 150
    W = lab + sum(max(s, 70) + pad for _, s in cols) + pad
    H = 60 + rowh * len(made) + pad
    sheet = Image.new('RGBA', (W, H), (236, 236, 234, 255))
    dr = ImageDraw.Draw(sheet)
    dr.text((pad, 18), 'ZenCalendar · iconos Dot', fill=(20, 20, 20), font=bold)
    x = lab
    for name, s in cols:
        dr.text((x, 44), name, fill=(110, 110, 110), font=font)
        x += max(s, 70) + pad

    def mask(kind, n):
        m = Image.new('L', (n * 4, n * 4), 0)
        d = ImageDraw.Draw(m)
        if kind == 'round':
            d.ellipse([0, 0, n * 4 - 1, n * 4 - 1], fill=255)
        else:
            d.rounded_rectangle([0, 0, n * 4 - 1, n * 4 - 1], radius=int(n * 4 * 0.30), fill=255)
        return m.resize((n, n), Image.LANCZOS)

    def adaptive(bg_i, fg_i, n, kind):
        comp = Image.alpha_composite(bg_i, fg_i)
        o = comp.crop((72, 72, 360, 360)).resize((n, n), Image.LANCZOS)   # se ven los 72 dp del centro
        out = Image.new('RGBA', (n, n), (0, 0, 0, 0))
        out.paste(o, (0, 0), mask(kind, n))
        return out

    for i, (v, (big, small, bg_i, fg_i, mono_i)) in enumerate(made.items()):
        y = 66 + i * rowh
        dr.text((pad, y + 80), DOT_ICONS[v].name, fill=(20, 20, 20), font=bold)
        dr.text((pad, y + 104), v, fill=(120, 120, 120), font=font)
        x = lab
        for name, s in cols:
            if name in ('192', '96', '48'):
                im = big.resize((s, s), Image.LANCZOS)
            elif 'ico' in name:
                im = render(DOT_ICONS[v].svg('small', DOT_FULL), s)
            elif name == 'redondo':
                im = adaptive(bg_i, fg_i, s, 'round')
            elif name == 'squircle':
                im = adaptive(bg_i, fg_i, s, 'sq')
            elif name == 'zona segura':
                comp = Image.alpha_composite(bg_i, fg_i).copy()
                d = ImageDraw.Draw(comp)
                c, r1, r2 = 216, 216 * 66 / 108, 216 * 72 / 108
                d.ellipse([c - r2, c - r2, c + r2, c + r2], outline=(0, 160, 255, 255), width=2)
                d.ellipse([c - r1, c - r1, c + r1, c + r1], outline=(0, 255, 120, 255), width=2)
                im = comp.resize((s, s), Image.LANCZOS)
            elif name == 'monocromo':
                tint = Image.new('RGBA', mono_i.size, (60, 52, 90, 255))
                tint.putalpha(mono_i.getchannel('A'))
                base = Image.new('RGBA', mono_i.size, (232, 222, 248, 255))
                im = adaptive(base, tint, s, 'round')
            else:
                im = big.resize((s, s), Image.LANCZOS)
                bgk = Image.new('RGBA', (s + 24, s + 24), (18, 18, 20, 255))
                bgk.alpha_composite(im, (12, 12))
                im = bgk
            if name == 'fondo oscuro':
                sheet.alpha_composite(im, (x - 12, y + 40 + (112 - s) // 2 - 12))
            else:
                sheet.alpha_composite(im, (x, y + 40 + (112 - s) // 2 if s <= 112 else y))
            x += max(s, 70) + pad
    sheet.save(path)
    print('  ✓ hoja de muestras:', path)


def make_grid_tile():
    """El punto de la rejilla del fondo de los widgets Dot (drawable/wgrid.xml lo repite):
    paso de 8 dp y punto de 2 dp, blanco (el color y la opacidad los pone Widgets.java)."""
    from PIL import ImageDraw
    for d, k in DENS.items():
        n = int(round(8 * k))
        big = 8
        img = Image.new('RGBA', (n * big, n * big), (255, 255, 255, 0))
        ImageDraw.Draw(img).ellipse([(n * big) / 2 - k * big, (n * big) / 2 - k * big, (n * big) / 2 + k * big, (n * big) / 2 + k * big], fill=(255, 255, 255, 255))
        save(img.resize((n, n), Image.LANCZOS), os.path.join(RES, 'drawable-' + d, 'wgrid_tile.png'))
    print('  ✓ rejilla de los widgets Dot')


def main():
    if '--dot' in sys.argv:          # solo lo del diseño Dot (más rápido)
        made = make_dot()
        make_grid_tile()
        dot_sheet(made)
        return
    base = open(SVG, encoding='utf-8').read()
    for v in VARIANTS:
        svg = recolor(base, v)
        big = render(svg, 1024)
        save(big, os.path.join(ROOT, 'web', 'img', 'icons', v + '.png'), 512)
        # Windows: un .ico por variante (ventana y bandeja)
        ico = os.path.join(ROOT, 'desktop', 'build', 'icons', v + '.ico')
        os.makedirs(os.path.dirname(ico), exist_ok=True)
        render(svg, 256).save(ico, sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
        # Android
        bg, fg, zonly = layers(svg)
        bg_i, fg_i, z_i = render(bg, 432), render(fg, 432), render(zonly, 432)
        mono_i = mono(fg_i, z_i)
        for d, k in DENS.items():
            folder = os.path.join(RES, 'mipmap-' + d)
            save(big, os.path.join(folder, 'ic_zc_%s.png' % v), int(48 * k))
            save(fg_i, os.path.join(folder, 'ic_zc_%s_fg.png' % v), int(108 * k))
            save(bg_i, os.path.join(folder, 'ic_zc_%s_bg.png' % v), int(108 * k))
            save(mono_i, os.path.join(folder, 'ic_zc_%s_mono.png' % v), int(108 * k))
        os.makedirs(os.path.join(RES, 'mipmap-anydpi-v26'), exist_ok=True)
        with open(os.path.join(RES, 'mipmap-anydpi-v26', 'ic_zc_%s.xml' % v), 'w', encoding='utf-8') as f:
            f.write(ADAPTIVE.format(v=v))
        print('  ✓', v)
    make_dot()
    make_grid_tile()

    # web (del pastel)
    pastel = render(base, 1024)
    save(pastel, os.path.join(ROOT, 'web', 'img', 'favicon.png'), 64)
    save(pastel, os.path.join(ROOT, 'web', 'img', 'icon-192.png'), 192)
    save(pastel, os.path.join(ROOT, 'web', 'img', 'icon-512.png'), 512)
    save(render(maskable_svg(base), 512), os.path.join(ROOT, 'web', 'img', 'icon-maskable-512.png'))

    # icono pequeño de las notificaciones de Android: silueta blanca
    _, fg, zonly = layers(base)
    st = mono(render(fg.replace('scale(0.80)', 'scale(0.98)'), 384), render(zonly.replace('scale(0.80)', 'scale(0.98)'), 384))
    for d, k in DENS.items():
        save(st, os.path.join(RES, 'drawable-' + d, 'ic_stat_zc.png'), int(24 * k))

    # Windows
    ico = os.path.join(ROOT, 'desktop', 'build', 'icon.ico')
    render(base, 256).save(ico, sizes=[(16, 16), (24, 24), (32, 32), (48, 48), (64, 64), (128, 128), (256, 256)])
    print('  ✓ web/img, desktop/build/icon.ico y el icono de las notificaciones')


if __name__ == '__main__':
    try:
        main()
    except FileNotFoundError as e:
        sys.exit('Falta rsvg-convert (librsvg): ' + str(e))
