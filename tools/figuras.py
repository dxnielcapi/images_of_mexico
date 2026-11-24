#!/usr/bin/env python3
"""
Separa del dibujo la figura que no pinta la gente: el tlacuilo.

El mural es un codice y quien lo relata es el pintor del centro. Esa figura no
puede aparecer de a poco como el resto: es la mano que dibuja, tiene que estar
desde la primera visita y con su trazo tal cual lo hizo el autor. Todo lo
demas —la espiral, los nopales, el maiz, los ornamentos— si lo trazan los
datos, y de ahi sale la red.

Para sostener esa division hace falta partir el SVG en dos, y partirlo por
geometria y no a ojo: el export de Concepts trae capas, pero el tlacuilo
comparte la suya con las mazorcas. Lo que si lo distingue es que es una figura
*sola*: sus trazos se tocan entre ellos y no tocan nada mas. Eso es lo que se
busca aqui.

Como se saca:

  1. Se leen los paths de la capa indicada y se aplanan a polilineas.
  2. Se agrupan los que se tocan: dos paths quedan en el mismo grupo si sus
     puntos caen en celdas vecinas de una rejilla de `CELDA` unidades.
  3. El grupo mas grande es la figura; los sueltos que caen dentro de su caja
     (una coma, un punto que no llego a tocar nada) se le suman.
  4. Se escribe un SVG con esos paths y el viewBox ajustado a la figura, para
     que el mural pueda rasterizarla aparte y a su propia resolucion: es la
     unica parte del dibujo que se mira de cerca con la lupa.

Uso:  python3 tools/figuras.py [public/Mural/Final.svg]

Salida: `public/Mural/<dibujo>.tlacuilo.svg`. Lo que queda del dibujo no se
escribe en ningun lado: los horneados de `espina.py` y `trazos.py` le restan
esta figura con `--sin`, y la pagina carga el SVG entero como fondo.
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

import numpy as np

from espina import _flatten

# La capa donde el export dejo al pintor. Comparte capa con las mazorcas; de
# eso se encarga el agrupado.
CAPA = 'New_Layer_10'
# Dos trazos se tocan si sus puntos caen a esta distancia, en unidades del
# SVG (el dibujo mide unas 2650 de lado). Mas chico parte la figura por donde
# el pulso levanto el lapiz; mas grande se la pega a lo que pase cerca.
CELDA = 8.0
# Aire alrededor de la figura en el SVG recortado, en unidades del SVG.
MARGEN = 12.0


def paths_de_capa(texto: str, capa: str) -> list[str]:
    """Los `d` de los paths de una capa, en orden de dibujo."""
    g = re.search(rf'<g id="{re.escape(capa)}"[^>]*>(.*?)</g>', texto, re.S)
    if not g:
        raise SystemExit(f'el dibujo no tiene la capa {capa}')
    return re.findall(r'\sd="([^"]+)"', g.group(1))


def agrupar(trazos: list[np.ndarray], celda: float = CELDA) -> list[list[int]]:
    """Junta los trazos que se tocan. Devuelve los grupos, de mayor a menor."""
    padre = list(range(len(trazos)))

    def raiz(a: int) -> int:
        while padre[a] != a:
            padre[a] = padre[padre[a]]
            a = padre[a]
        return a

    def unir(a: int, b: int) -> None:
        ra, rb = raiz(a), raiz(b)
        if ra != rb:
            padre[ra] = rb

    dueno: dict[tuple[int, int], int] = {}
    for i, p in enumerate(trazos):
        celdas = set(zip(np.floor(p[:, 0] / celda).astype(int),
                         np.floor(p[:, 1] / celda).astype(int)))
        for cx, cy in celdas:
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    vecina = dueno.get((cx + dx, cy + dy))
                    if vecina is not None:
                        unir(i, vecina)
            dueno.setdefault((cx, cy), i)

    grupos: dict[int, list[int]] = {}
    for i in range(len(trazos)):
        grupos.setdefault(raiz(i), []).append(i)
    return sorted(grupos.values(), key=len, reverse=True)


def main() -> None:
    svg = Path(sys.argv[1] if len(sys.argv) > 1 else 'public/Mural/Final.svg')
    texto = svg.read_text()

    ds = paths_de_capa(texto, CAPA)
    trazos = [np.array(_flatten(d, 4)) for d in ds]
    vivos = [i for i, p in enumerate(trazos) if len(p) >= 2]
    grupos = agrupar([trazos[i] for i in vivos])
    if not grupos:
        raise SystemExit(f'la capa {CAPA} no tiene trazos')

    figura = [vivos[k] for k in grupos[0]]
    pts = np.concatenate([trazos[i] for i in figura])
    x0, x1 = pts[:, 0].min(), pts[:, 0].max()
    y0, y1 = pts[:, 1].min(), pts[:, 1].max()

    # Los sueltos de adentro son de la figura: un punto, una coma, el trazo
    # que no llego a tocar al de al lado.
    for i in vivos:
        if i in figura:
            continue
        p = trazos[i]
        if x0 <= p[:, 0].min() and p[:, 0].max() <= x1 and y0 <= p[:, 1].min() and p[:, 1].max() <= y1:
            figura.append(i)
    figura.sort()

    vx, vy = x0 - MARGEN, y0 - MARGEN
    vw, vh = (x1 - x0) + 2 * MARGEN, (y1 - y0) + 2 * MARGEN

    cuerpo = '\n'.join(
        f'  <path fill="#000000" stroke="none" d="{ds[i]}"></path>' for i in figura
    )
    destino = svg.with_suffix('.tlacuilo.svg')
    destino.write_text(
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{vw:.3f}pt" height="{vh:.3f}pt"'
        f' version="1.1" viewBox="{vx:.3f} {vy:.3f} {vw:.3f} {vh:.3f}">\n'
        f'  <title>Tlacuilo</title>\n'
        f'  <desc>La figura central de {svg.name}, separada con tools/figuras.py</desc>\n'
        f'{cuerpo}\n</svg>\n'
    )
    print(f'{destino}: {len(figura)} paths de {len(ds)} en {CAPA}, '
          f'caja x[{x0:.0f},{x1:.0f}] y[{y0:.0f},{y1:.0f}], '
          f'{destino.stat().st_size / 1024:.0f} KB')
    print(f'  grupos en la capa: {[len(g) for g in grupos]}')


if __name__ == '__main__':
    main()
