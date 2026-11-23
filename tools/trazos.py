#!/usr/bin/env python3
"""
Extrae las lineas del boceto: el eje de cada trazo negro del dibujo.

El mural lo dibujan los datos. No hay boceto de fondo que mirar: cada persona
que se registra pinta una pincelada, y esas pinceladas van *sobre* las lineas
del dibujo, de modo que la figura aparece porque la gente la traza. Para eso
hace falta saber por donde pasan esas lineas, y saberlo como recorrido —"de
aqui hasta aca, con este grosor"—, no como mancha de pixeles.

El export de Concepts no sirve tal cual: cada `<path>` es la *silueta* de una
pincelada (contorno de ida y vuelta relleno de negro), no su eje, y una linea
del dibujo suele ser varios paths encimados. El eje hay que sacarlo de la
tinta, y es una esqueletizacion sobre cuatro millones de pixeles: se hornea
aqui una vez y queda en `public/Mural/<dibujo>.trazos.json`.

Como se saca:

  1. Se rasteriza el SVG a la resolucion de trabajo del mural (lado mayor
     2000 px, ver `MAX_SIDE` en `@io/readers/drawing`), rellenando los paths:
     eso es la tinta.
  2. Se esqueletiza la tinta. Ojo: la tinta, no el cuerpo relleno que arma
     `tools/espina.py`. Aquel busca el eje de la *banda* del cuerpo —una sola
     curva, la espiral—; aqui se quiere el eje de cada *linea dibujada*, que
     es justo lo que hay debajo del pincel.
  3. El esqueleto se parte en ramas (tramos entre bifurcaciones o puntas) y
     las ramas se vuelven a encadenar en los cruces siguiendo la direccion:
     donde dos lineas se cruzan, cada una sigue derecho en vez de partirse en
     cuatro cabos. Asi un trazo del JSON es, casi siempre, una linea que la
     mano dibujo de un tiron.
  4. Se podan los pelos (ramas cortas que mueren en una punta: son el ruido
     que deja la esqueletizacion en las puntas anchas), se suaviza la escalera
     de un pixel, se remuestrea por longitud de arco y se mide el semiancho de
     la linea en cada punto con la transformada de distancia.

Uso:  python3 tools/trazos.py [public/Mural/bocetoactualizado.svg]

Requiere numpy, scipy, scikit-image y Pillow. No corre en el build: su salida
esta versionada. Hay que volver a correrlo solo si cambia la ilustracion.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from scipy import ndimage as ndi
from skimage.morphology import skeletonize

from espina import MAX_SIDE, rasterizar

# Separacion entre puntos de un trazo, en px de trabajo. Mas fino no agrega
# dibujo: la linea ya viene suavizada y el pincel la vuelve a temblar.
PASO = 6.0
# Pelo: rama que muere en una punta y mide menos que esto. Son los cabos que
# deja la esqueletizacion donde la linea se ensancha, no lineas del dibujo.
PELO = 14.0
# Trazo suelto mas corto que esto: no alcanza ni para una pincelada.
MINIMO = 10.0
# Cuanto tiene que seguir derecho un cruce para encadenarse (coseno del
# angulo entre las dos salidas; -1 es seguir recto, 0 es doblar en escuadra).
RECTO = -0.35

VECINOS = [(-1, -1), (-1, 0), (-1, 1), (0, -1), (0, 1), (1, -1), (1, 0), (1, 1)]


def ramas(sk: np.ndarray) -> list[np.ndarray]:
    """Parte el esqueleto en tramos entre nodos (puntas y bifurcaciones)."""
    ys, xs = np.nonzero(sk)
    indice = {(int(y), int(x)): i for i, (y, x) in enumerate(zip(ys, xs))}
    ady: list[list[int]] = [[] for _ in indice]
    for (y, x), i in indice.items():
        for dy, dx in VECINOS:
            j = indice.get((y + dy, x + dx))
            if j is not None:
                ady[i].append(j)

    grado = np.array([len(a) for a in ady])
    nodo = (grado != 2)
    visitado = [[False] * len(a) for a in ady]
    tramos: list[list[int]] = []

    def caminar(desde: int, hacia: int) -> list[int]:
        """Sigue la cadena de grado 2 hasta el proximo nodo."""
        ruta = [desde, hacia]
        previo, actual = desde, hacia
        while not nodo[actual]:
            siguiente = next((v for v in ady[actual] if v != previo), None)
            if siguiente is None or siguiente == ruta[0]:
                break
            previo, actual = actual, siguiente
            ruta.append(actual)
        return ruta

    def marcar(ruta: list[int]) -> None:
        for a, b in zip(ruta, ruta[1:]):
            visitado[a][ady[a].index(b)] = True
            visitado[b][ady[b].index(a)] = True

    for i in np.nonzero(nodo)[0]:
        for k, v in enumerate(ady[i]):
            if visitado[i][k]:
                continue
            ruta = caminar(int(i), v)
            marcar(ruta)
            tramos.append(ruta)

    # Lo que quedo sin visitar son anillos: cadenas de grado 2 sin ningun
    # nodo donde empezar (un rulo cerrado del dibujo).
    for i in range(len(ady)):
        for k, v in enumerate(ady[i]):
            if visitado[i][k] or nodo[i]:
                continue
            ruta = caminar(i, v)
            marcar(ruta)
            tramos.append(ruta)

    puntos = np.stack([xs, ys], 1).astype(float)
    return [puntos[r] for r in tramos]


def _direccion(tramo: np.ndarray, desde_el_final: bool) -> np.ndarray:
    """Hacia donde sale el tramo por una de sus puntas (unitario)."""
    p = tramo[::-1] if desde_el_final else tramo
    q = p[min(len(p) - 1, 6)]
    d = q - p[0]
    n = np.hypot(*d)
    return d / n if n > 1e-9 else np.array([0.0, 0.0])


def encadenar(tramos: list[np.ndarray]) -> list[np.ndarray]:
    """
    Vuelve a unir los tramos que en un cruce siguen derecho.

    La esqueletizacion corta una linea cada vez que otra la toca. Sin esto, el
    dibujo quedaria hecho de cabos de veinte pixeles y las pinceladas no
    tendrian por donde correr.
    """
    # Cada punta es (tramo, 0 = principio | 1 = final); se agrupan por el
    # pixel donde caen, que es el nodo del esqueleto.
    bocas: dict[tuple[int, int], list[tuple[int, int]]] = {}
    for i, t in enumerate(tramos):
        for lado, p in ((0, t[0]), (1, t[-1])):
            bocas.setdefault((int(p[0]), int(p[1])), []).append((i, lado))

    pareja: dict[tuple[int, int], tuple[int, int]] = {}
    for puntas in bocas.values():
        if len(puntas) < 2:
            continue
        dirs = {p: _direccion(tramos[p[0]], p[1] == 1) for p in puntas}
        # Mejor primero: el par que sigue mas derecho se queda con el cruce.
        pares = sorted(
            ((float(dirs[a] @ dirs[b]), a, b)
             for k, a in enumerate(puntas) for b in puntas[k + 1:]
             if a[0] != b[0]),
            key=lambda p: p[0],
        )
        for coseno, a, b in pares:
            if coseno > RECTO or a in pareja or b in pareja:
                continue
            pareja[a] = b
            pareja[b] = a

    usado = [False] * len(tramos)
    cadenas: list[np.ndarray] = []
    for i in range(len(tramos)):
        if usado[i]:
            continue
        # Se retrocede hasta el principio de la cadena y despues se avanza.
        inicio, lado = i, 0
        visto = {i}
        while (vecino := pareja.get((inicio, lado))) and vecino[0] not in visto:
            inicio, lado = vecino[0], 1 - vecino[1]
            visto.add(inicio)

        piezas: list[np.ndarray] = []
        actual, entrada = inicio, lado
        while True:
            usado[actual] = True
            # `entrada` es la punta por la que se entra: el tramo se recorre
            # desde ahi.
            piezas.append(tramos[actual] if entrada == 0 else tramos[actual][::-1])
            salida = (actual, 1 - entrada)
            siguiente = pareja.get(salida)
            if siguiente is None or usado[siguiente[0]]:
                break
            actual, entrada = siguiente
        cadenas.append(np.concatenate(piezas))

    return cadenas


def largo(p: np.ndarray) -> float:
    return float(np.hypot(*np.diff(p, axis=0).T).sum()) if len(p) > 1 else 0.0


def podar(cadenas: list[np.ndarray], sk: np.ndarray) -> list[np.ndarray]:
    """Saca los pelos: cabos cortos que mueren en una punta del esqueleto."""
    ys, xs = np.nonzero(sk)
    grado: dict[tuple[int, int], int] = {}
    pixeles = set(zip(ys.tolist(), xs.tolist()))
    for y, x in pixeles:
        grado[(y, x)] = sum((y + dy, x + dx) in pixeles for dy, dx in VECINOS)

    vivas = []
    for c in cadenas:
        l = largo(c)
        if l < MINIMO:
            continue
        suelta = (grado.get((int(c[0][1]), int(c[0][0])), 0) == 1
                  or grado.get((int(c[-1][1]), int(c[-1][0])), 0) == 1)
        if suelta and l < PELO:
            continue
        vivas.append(c)
    return vivas


def remuestrear(c: np.ndarray, dist: np.ndarray) -> list[list[float]]:
    """Suaviza la escalera del esqueleto, reparte por arco y mide el ancho."""
    sigma = 2.0 if len(c) > 8 else 0.6
    suave = np.stack([ndi.gaussian_filter1d(c[:, i], sigma, mode='nearest') for i in (0, 1)], 1)
    pasos = np.hypot(*np.diff(suave, axis=0).T)
    s = np.concatenate([[0.0], np.cumsum(pasos)])
    if s[-1] < MINIMO:
        return []
    t = np.append(np.arange(0, s[-1], PASO), s[-1])
    x = np.interp(t, s, suave[:, 0])
    y = np.interp(t, s, suave[:, 1])
    w = ndi.map_coordinates(dist, [y, x], order=1)
    return [[round(float(a), 1), round(float(b), 1), round(float(max(0.5, c_)), 1)]
            for a, b, c_ in zip(x, y, w)]


def main() -> None:
    svg = sys.argv[1] if len(sys.argv) > 1 else 'public/Mural/bocetoactualizado.svg'
    ink = rasterizar(svg, MAX_SIDE)
    h, w = ink.shape
    print(f'{svg}: {w}x{h}, tinta {ink.sum()} px')

    sk = skeletonize(ink)
    dist = ndi.distance_transform_edt(ink)
    crudas = ramas(sk)
    cadenas = podar(encadenar(crudas), sk)
    print(f'esqueleto {sk.sum()} px -> {len(crudas)} ramas -> {len(cadenas)} trazos')

    trazos = [p for p in (remuestrear(c, dist) for c in sorted(cadenas, key=largo, reverse=True)) if p]
    total = sum(
        float(np.hypot(*np.diff(np.array(t, float)[:, :2], axis=0).T).sum())
        for t in trazos if len(t) > 1
    )

    destino = Path(svg).with_suffix('.trazos.json')
    destino.write_text(json.dumps({
        'dibujo': Path(svg).name,
        'width': w,
        'height': h,
        'paso': PASO,
        'trazos': trazos,
    }, separators=(',', ':')))
    largos = sorted(largo(np.array(t, float)[:, :2]) for t in trazos)
    print(f'{destino}: {len(trazos)} trazos, {sum(len(t) for t in trazos)} puntos, '
          f'largo total {total:.0f} px (mediana {largos[len(largos) // 2]:.0f}, '
          f'maximo {largos[-1]:.0f}), {destino.stat().st_size / 1024:.0f} KB')


if __name__ == '__main__':
    main()
