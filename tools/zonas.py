#!/usr/bin/env python3
"""
Escribe el `.zones.json` del dibujo: con que numeros se binariza y donde
caen las semillas de sus regiones.

El archivo lo escribia el studio, que era donde se delimitaban las regiones a
mano. Desde que el mural es una red de afinidades las zonas ya no deciden
donde se pinta nadie —eso lo deciden las respuestas— y quedo lo que siempre
fueron debajo: los parametros con los que el mural binariza la ilustracion
(de ahi sale el campo que le pone borde a la red) y una etiqueta para el
registro. Pero el archivo tiene que existir y sus semillas tienen que caer en
regiones de *esta* ilustracion: las del boceto anterior apuntan a un dibujo
que ya no esta.

Como se sacan las semillas, igual que `analyzeDrawing` en el navegador:

  1. Se rasteriza el SVG a la resolucion de trabajo del mural y se engorda la
     tinta `dilate` pixeles.
  2. Se rellena el interior del trazo con un cierre de radio `close` (ver
     `strokeFill`): eso es lo pintable mientras el dibujo no encierre
     regiones.
  3. Se etiqueta cada pieza conexa de ese relleno y se descartan las menores
     que `minArea`.
  4. De cada pieza se guarda su pixel mas interior. Son las semillas: al
     cargar, el mural vuelve a etiquetar y las usa para reconocer las mismas
     piezas (ver `zoneFromSeeds`).

Todas las piezas van a una sola zona. El mural no las necesita separadas —la
zona es una etiqueta, no un lugar— y juntas describen exactamente la
superficie pintable del dibujo.

Uso:  python3 tools/zonas.py [dibujo.svg]

Requiere numpy, scipy y Pillow. No corre en el build: su salida esta
versionada. Hay que volver a correrlo solo si cambia la ilustracion.
"""
from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
from scipy import ndimage as ndi

from espina import CLOSE, DILATE, MAX_SIDE, rasterizar

# Los mismos de `analyzeDrawing`. El umbral es el del binarizado en el
# navegador; aqui la rasterizacion ya viene en blanco y negro, pero el numero
# viaja al JSON porque es el mural quien binariza.
UMBRAL = 150
AREA_MINIMA = 180
MARGEN = 3
ZONA = 'zona_01'


def relleno(ink: np.ndarray, close: int = CLOSE) -> np.ndarray:
    """Lo pintable: el interior que el cierre morfologico le gana al trazo."""
    a_tinta = ndi.distance_transform_edt(~ink)
    afuera = (~ink) & (a_tinta > close)
    a_fuera = ndi.distance_transform_edt(~afuera)
    return (~ink) & (a_fuera > close)


def main() -> None:
    svg = Path(sys.argv[1] if len(sys.argv) > 1 else 'public/Mural/Final.svg')
    ink = rasterizar(str(svg), MAX_SIDE)
    ink = ndi.binary_dilation(ink, np.ones((2 * DILATE + 1,) * 2, bool))
    h, w = ink.shape

    pintable = relleno(ink)
    # Distancia de cada pixel pintable al borde de lo pintable: con eso se
    # elige la semilla mas interior de cada pieza, que es la que aguanta que
    # el navegador rasterice un pelo distinto.
    hondo = ndi.distance_transform_edt(pintable)
    etiquetas, n = ndi.label(pintable, np.array([[0, 1, 0], [1, 1, 1], [0, 1, 0]]))
    if n == 0:
        raise SystemExit('el dibujo no dejo nada pintable: revisa close')

    areas = ndi.sum(pintable, etiquetas, range(1, n + 1))
    vivas = [i + 1 for i in range(n) if areas[i] >= AREA_MINIMA]
    picos = ndi.maximum_position(hondo, etiquetas, vivas)

    semillas = [(int(x), int(y)) for y, x in picos]
    # A mano y no con `json.dumps(indent=2)`: asi el archivo se sigue leyendo
    # —son doscientos pares de numeros— en vez de ocupar mil lineas de una
    # coordenada cada una.
    filas = [', '.join(f'[{x}, {y}]' for x, y in semillas[i:i + 6])
             for i in range(0, len(semillas), 6)]
    puntos = ',\n        '.join(filas)
    destino = svg.with_suffix('.zones.json')
    destino.write_text(
        '{\n'
        f'  "drawing": "{svg.name}",\n'
        f'  "width": {w},\n'
        f'  "height": {h},\n'
        f'  "threshold": {UMBRAL},\n'
        f'  "dilate": {DILATE},\n'
        f'  "close": {CLOSE},\n'
        f'  "minArea": {AREA_MINIMA},\n'
        f'  "margin": {MARGEN},\n'
        '  "zones": [\n'
        '    {\n'
        f'      "name": "{ZONA}",\n'
        '      "seedPoints": [\n'
        f'        {puntos}\n'
        '      ]\n'
        '    }\n'
        '  ]\n'
        '}\n'
    )
    print(f'{destino}: {len(semillas)} semillas de {n} piezas, '
          f'{int(sum(a for a in areas if a >= AREA_MINIMA))} px pintables de {w * h}')


if __name__ == '__main__':
    main()
