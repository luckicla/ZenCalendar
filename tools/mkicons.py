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

    python3 tools/mkicons.py --dot     solo lo del diseño Dot
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


def dot_svg(layer='full', scale=1.0):
    """layer: 'full' (el icono entero, con su squircle negro), 'small' (igual con los puntos
    más gordos, casi tocándose, para 16…24 px, donde los puntos sueltos se emborronan),
    'bg' (fondo a sangre del adaptativo: negro liso), 'fg' (solo los puntos encendidos),
    'mono' (silueta blanca de los encendidos, para los iconos con tema de Android 13).
    scale: el dibujo crece o encoge alrededor del centro."""
    p = DOT_PITCH * scale
    r = (DOT_R if layer != 'small' else 30) * scale
    c = 512
    out = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">']

    def circ(k, m, fill):
        out.append('<circle cx="%.2f" cy="%.2f" r="%.2f" fill="%s"/>' % (c + k * p, c + m * p, r, fill))

    if layer in ('full', 'small'):
        out.append('<defs><radialGradient id="g" cx="0.25" cy="0.08" r="0.9"><stop offset="0" stop-color="#ffffff" stop-opacity="0.09"/>'
                   '<stop offset="0.6" stop-color="#ffffff" stop-opacity="0"/></radialGradient></defs>')
        out.append('<rect width="1024" height="1024" rx="232" fill="#000000"/>')
        # un brillo muy suave arriba a la izquierda, como el vidrio de la trasera del teléfono
        out.append('<rect width="1024" height="1024" rx="232" fill="url(#g)"/>')
    if layer == 'bg':
        out.append('<rect width="1024" height="1024" fill="#000000"/>')
    if layer in ('full', 'small', 'fg', 'mono'):
        for k, m in DOT_ON:
            circ(k, m, '#FFFFFF')
        circ(DOT_RED_AT[0], DOT_RED_AT[1], '#FFFFFF' if layer == 'mono' else DOT_RED)
    out.append('</svg>')
    return '\n'.join(out)


DOT_FULL = 1.0      # escala del icono entero
DOT_ADAPTIVE = 0.74  # en el adaptativo: todo dentro de la zona segura (círculo de 66 dp de 108)


def dot_ico(path):
    """.ico de Windows: de 16 a 32 px con los puntos más gordos (si no, se emborronan)."""
    sizes = [16, 24, 32, 48, 64, 128, 256]
    imgs = [render(dot_svg('small' if s <= 32 else 'full', DOT_FULL), s) for s in sizes]
    imgs[-1].save(path, sizes=[(s, s) for s in sizes], append_images=imgs[:-1])


def make_dot():
    v = 'dot'
    big = render(dot_svg('full', DOT_FULL), 1024)
    save(big, os.path.join(ROOT, 'web', 'img', 'icons', v + '.png'), 512)
    ico = os.path.join(ROOT, 'desktop', 'build', 'icons', v + '.ico')
    os.makedirs(os.path.dirname(ico), exist_ok=True)
    dot_ico(ico)
    # adaptativo: 108 dp con los 66 del centro seguros (la hoja es más alta que ancha: un poco más pequeña que las demás variantes)
    k = DOT_ADAPTIVE
    bg_i, fg_i, mono_i = render(dot_svg('bg', k), 432), render(dot_svg('fg', k), 432), render(dot_svg('mono', k), 432)
    for d, f in DENS.items():
        folder = os.path.join(RES, 'mipmap-' + d)
        save(big, os.path.join(folder, 'ic_zc_%s.png' % v), int(48 * f))
        save(fg_i, os.path.join(folder, 'ic_zc_%s_fg.png' % v), int(108 * f))
        save(bg_i, os.path.join(folder, 'ic_zc_%s_bg.png' % v), int(108 * f))
        save(mono_i, os.path.join(folder, 'ic_zc_%s_mono.png' % v), int(108 * f))
    os.makedirs(os.path.join(RES, 'mipmap-anydpi-v26'), exist_ok=True)
    with open(os.path.join(RES, 'mipmap-anydpi-v26', 'ic_zc_%s.xml' % v), 'w', encoding='utf-8') as f:
        f.write(ADAPTIVE.format(v=v))
    print('  ✓', v)


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
        make_dot()
        make_grid_tile()
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
