#!/usr/bin/env python3
"""
Extrae la espina del boceto: la curva de la espiral, de la cabeza al centro.

El mural ya no reparte manchas sueltas dentro de una zona: la visualizacion la
dibuja un trazo principal que recorre la espiral de la serpiente, y cada
persona es una rama que sale de el. Ese recorrido no se puede inventar a mano
—tiene el pulso del dibujo— ni conviene calcularlo en el navegador (es una
esqueletizacion sobre dos millones de pixeles), asi que se hornea aqui una vez
y queda en `public/Mural/<dibujo>.espina.json`.

Como se saca:

  1. Se rasteriza el SVG a la misma resolucion de trabajo que usa el mural
     (lado mayor 2000 px, ver `MAX_SIDE` en `@io/readers/drawing`), rellenando
     los paths tal cual: el export de Concepts son siluetas, no lineas.
  2. Se reconstruye la superficie pintable igual que `analyzeDrawing`: cierre
     morfologico de radio `close` (ver `strokeFill`), que rellena el interior
     de la banda del cuerpo sin tragarse el aire entre dos vueltas.
  3. Tinta + relleno es el cuerpo solido. Su esqueleto es el eje de la banda
     donde el dibujo es una cinta de dos lineas y la linea misma donde la
     espiral interior es un solo trazo.
  4. Del esqueleto se toma el camino mas largo que arranca en la punta mas
     interior: eso descarta las plumas y la cabeza, que son ramas cortas.
  5. Se invierte (queda de la cabeza al centro, o sea antihorario), se suaviza,
     se remuestrea por longitud de arco y se mide el semiancho de la banda en
     cada punto con la transformada de distancia.

Uso:  python3 tools/espina.py [public/Mural/bocetoactualizado.svg]

Requiere numpy, scipy, scikit-image y Pillow. No corre en el build: su salida
esta versionada. Hay que volver a correrlo solo si cambia la ilustracion.
"""
from __future__ import annotations

import json
import re
import sys
from heapq import heappop, heappush
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi
from skimage.morphology import skeletonize

# Las mismas constantes con las que el mural analiza el dibujo.
MAX_SIDE = 2000          # @io/readers/drawing
DILATE = 1               # `dilate` del .zones.json
CLOSE = 24               # `close` del .zones.json
PASO = 10.0              # separacion entre puntos de la espina, en px de trabajo


def rasterizar(svg: str, max_side: int = MAX_SIDE) -> np.ndarray:
    """El SVG a mascara de tinta, en la resolucion de trabajo del mural."""
    texto = Path(svg).read_text()
    vb = re.search(r'viewBox="([-\d.eE ]+)"', texto)
    if not vb:
        raise SystemExit(f'{svg}: sin viewBox')
    vx, vy, vw, vh = (float(t) for t in vb.group(1).split())
    k = max_side / max(vw, vh)
    w, h = max(1, round(vw * k)), max(1, round(vh * k))

    img = Image.new('L', (w, h), 0)
    lapiz = ImageDraw.Draw(img)
    for d in re.findall(r'\sd="([^"]+)"', texto):
        puntos = _flatten(d)
        if len(puntos) >= 3:
            lapiz.polygon([((x - vx) * w / vw, (y - vy) * h / vh) for x, y in puntos], fill=255)
    return np.array(img) > 127


_TOKEN = re.compile(r'([MLQZmlqz])|(-?\d*\.?\d+(?:[eE][-+]?\d+)?)')


def _flatten(d: str, pasos: int = 8) -> list[tuple[float, float]]:
    """Path de Concepts (solo M/L/Q/Z) a polilinea."""
    items = [a or b for a, b in ((m.group(1), m.group(2)) for m in _TOKEN.finditer(d))]
    pts: list[tuple[float, float]] = []
    cur: tuple[float, float] | None = None
    cmd = ''
    i = 0
    while i < len(items):
        t = items[i]
        if t.isalpha():
            cmd = t
            i += 1
            continue
        if cmd in 'Mm':
            cur = (float(items[i]), float(items[i + 1]))
            pts.append(cur)
            cmd = 'L'
            i += 2
        elif cmd in 'Ll':
            cur = (float(items[i]), float(items[i + 1]))
            pts.append(cur)
            i += 2
        elif cmd in 'Qq' and cur is not None:
            x1, y1, x2, y2 = (float(items[i + k]) for k in range(4))
            for s in np.linspace(0, 1, pasos)[1:]:
                pts.append((
                    (1 - s) ** 2 * cur[0] + 2 * (1 - s) * s * x1 + s * s * x2,
                    (1 - s) ** 2 * cur[1] + 2 * (1 - s) * s * y1 + s * s * y2,
                ))
            cur = (x2, y2)
            i += 4
        else:
            i += 1
    return pts


def cuerpo(ink: np.ndarray) -> np.ndarray:
    """Tinta + relleno del trazo: la superficie solida de la serpiente."""
    ink = ndi.binary_dilation(ink, np.ones((2 * DILATE + 1,) * 2, bool))
    a_tinta = ndi.distance_transform_edt(~ink)
    afuera = (~ink) & (a_tinta > CLOSE)
    a_fuera = ndi.distance_transform_edt(~afuera)
    relleno = (~ink) & (a_fuera > CLOSE)

    solido = ndi.binary_fill_holes(ndi.binary_closing(ink | relleno, np.ones((9, 9), bool)))
    etiquetas, n = ndi.label(solido)
    if n == 0:
        raise SystemExit('el dibujo quedo vacio')
    areas = ndi.sum(solido, etiquetas, range(1, n + 1))
    return etiquetas == (int(np.argmax(areas)) + 1)


def camino(sk: np.ndarray) -> np.ndarray:
    """Camino mas largo del esqueleto desde su punta mas interior."""
    ys, xs = np.nonzero(sk)
    indice = {(int(y), int(x)): i for i, (y, x) in enumerate(zip(ys, xs))}
    vecinos = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]
    ady: list[list[tuple[int, float]]] = [[] for _ in indice]
    for (y, x), i in indice.items():
        for dy, dx in vecinos:
            j = indice.get((y + dy, x + dx))
            if j is not None:
                ady[i].append((j, 1.4142 if dy and dx else 1.0))

    puntas = [i for i, a in enumerate(ady) if len(a) == 1]
    if not puntas:
        raise SystemExit('el esqueleto no tiene puntas: el dibujo cierra un anillo')
    cx, cy = xs.mean(), ys.mean()
    # La punta mas interior es la del centro de la espiral: es la unica que
    # cae cerca del centroide del esqueleto, el resto son plumas del borde.
    centro = min(puntas, key=lambda i: (xs[i] - cx) ** 2 + (ys[i] - cy) ** 2)

    dist = np.full(len(ady), np.inf)
    previo = np.full(len(ady), -1, int)
    dist[centro] = 0
    cola = [(0.0, centro)]
    while cola:
        d, u = heappop(cola)
        if d > dist[u]:
            continue
        for v, w in ady[u]:
            if d + w < dist[v] - 1e-9:
                dist[v] = d + w
                previo[v] = u
                heappush(cola, (dist[v], v))

    lejos = max(puntas, key=lambda i: dist[i] if np.isfinite(dist[i]) else -1.0)
    ruta = []
    u = lejos
    while u != -1:
        ruta.append(u)
        u = previo[u]
    # `ruta` va de la punta lejana (la cabeza) al centro: ese es el sentido
    # antihorario que pide el mural, asi que no se invierte.
    return np.array([[xs[i], ys[i]] for i in ruta], float)


def main() -> None:
    svg = sys.argv[1] if len(sys.argv) > 1 else 'public/Mural/bocetoactualizado.svg'
    ink = rasterizar(svg)
    solido = cuerpo(ink)
    h, w = solido.shape
    print(f'{svg}: {w}x{h}, cuerpo {solido.sum()} px')

    pts = camino(skeletonize(solido))
    # Suavizado: el esqueleto viene en escalera de un pixel. Sigma chico para
    # no planchar el pulso del trazo a mano.
    suave = np.stack([ndi.gaussian_filter1d(pts[:, i], 8, mode='nearest') for i in (0, 1)], 1)

    largos = np.hypot(*np.diff(suave, axis=0).T)
    s = np.concatenate([[0.0], np.cumsum(largos)])
    t = np.arange(0, s[-1], PASO)
    x = np.interp(t, s, suave[:, 0])
    y = np.interp(t, s, suave[:, 1])
    # Semiancho de la banda en cada punto: lo que mide el cuerpo ahi.
    ancho = ndi.gaussian_filter1d(
        ndi.map_coordinates(ndi.distance_transform_edt(solido), [y, x], order=1), 6, mode='nearest'
    )

    destino = Path(svg).with_suffix('.espina.json')
    destino.write_text(json.dumps({
        'dibujo': Path(svg).name,
        'width': w,
        'height': h,
        'paso': PASO,
        'sentido': 'de la cabeza al centro (antihorario)',
        'puntos': [[round(float(a), 1), round(float(b), 1), round(float(c), 1)]
                   for a, b, c in zip(x, y, ancho)],
    }, separators=(',', ':')))
    print(f'{destino}: {len(x)} puntos, largo {s[-1]:.0f} px, '
          f'ancho {ancho.min():.0f}-{ancho.max():.0f} px')


if __name__ == '__main__':
    main()
