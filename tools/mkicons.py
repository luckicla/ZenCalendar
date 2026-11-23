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


def main():
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
