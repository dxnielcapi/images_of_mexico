/**
 * Pipeline compartido entre la app completa (main.ts) y la pantalla de
 * registro (registro.ts): detectar zonas, reconstruirlas desde semillas y
 * colocar los registros dentro de ellas.
 *
 * Todo aqui es independiente de la UI: no toca el DOM ni el estado global.
 */
import { binarize } from './zones/binarize';
import { dilate, distanceToInk, strokeFill } from './zones/morphology';
import { labelRegions, type LabelResult } from './zones/connectedComponents';
import { buildZone, type Zone } from './zones/zoneMask';
import { randomInZone } from './sampling/randomInMask';
import { poissonInZone, suggestMinDist } from './sampling/poissonInMask';
import type { DataRecord, PlacedPoint, PlacementMode, Warning, ZoneMap, ZonesConfig } from './types';

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

export interface DetectParams {
  threshold: number;
  dilate: number;
  minArea: number;
  /**
   * Radio en pixeles para cerrar el trazo cuando el dibujo no encierra
   * regiones todavia (ver `strokeFill`). En 0 —lo normal para un dibujo
   * cerrado— no se toca nada y se delimitan las regiones de siempre.
   */
  close?: number;
}

/** Dibujo ya binarizado, con distancias a la tinta y regiones etiquetadas. */
export interface Analysis {
  /** El trazo tal cual, para mostrarlo al delimitar. */
  ink: Uint8Array;
  /**
   * Distancia de cada pixel pintable al borde de lo pintable. Con `close` se
   * mide contra el relleno del trazo, no contra el trazo: es la misma mascara
   * que se etiqueto, asi el margen interno de las zonas sigue cuadrando.
   */
  dist: Float32Array;
  labeling: LabelResult;
}

export function analyzeDrawing(
  imageData: ImageData,
  width: number,
  height: number,
  p: DetectParams
): Analysis {
  const raw = binarize(imageData, p.threshold);
  const ink = p.dilate > 0 ? dilate(raw, width, height, p.dilate) : raw;

  // Lo que se va a etiquetar. Normalmente es el fondo que el trazo encierra;
  // con `close`, el dibujo no encierra nada todavia y lo pintable es el
  // relleno del propio trazo: todo lo demas pasa a contar como tinta para que
  // el etiquetado devuelva las piezas de ese relleno y nada mas.
  let mask = ink;
  if (p.close && p.close > 0) {
    const fill = strokeFill(ink, width, height, p.close);
    mask = new Uint8Array(fill.length);
    for (let i = 0; i < fill.length; i++) mask[i] = fill[i] ? 0 : 1;
  }

  const dist = distanceToInk(mask, width, height);
  return { ink, dist, labeling: labelRegions(mask, width, height, dist, p.minArea) };
}

/** Reconstruye una zona a partir de los puntos semilla guardados. */
export function zoneFromSeeds(
  name: string,
  seedPoints: [number, number][],
  a: Analysis,
  margin: number,
  hue: number
): Zone | null {
  const { width, height, labels } = a.labeling;
  const found = new Set<number>();
  for (const [x, y] of seedPoints) {
    if (x < 0 || y < 0 || x >= width || y >= height) continue;
    const l = labels[(y | 0) * width + (x | 0)];
    if (l) found.add(l);
  }
  if (found.size === 0) return null;
  return buildZone(name, [...found], a.labeling, a.dist, margin, hue);
}

/** Hue estable para la zona n-esima (angulo aureo). */
export function hueFor(index: number): number {
  return Math.round((index * 137.508) % 360);
}

/**
 * Reconstruye todas las zonas de un `.zones.json`, escalando las semillas si
 * el dibujo actual tiene otra resolucion que la guardada.
 */
export function zonesFromConfig(
  cfg: ZonesConfig,
  a: Analysis,
  margin: number
): { zones: ZoneMap; missing: string[] } {
  const scaleX = a.labeling.width / (cfg.width || a.labeling.width);
  const scaleY = a.labeling.height / (cfg.height || a.labeling.height);
  const zones: ZoneMap = new Map();
  const missing: string[] = [];
  cfg.zones.forEach((z, i) => {
    const seeds = z.seedPoints.map(
      ([x, y]) => [Math.round(x * scaleX), Math.round(y * scaleY)] as [number, number]
    );
    const zone = zoneFromSeeds(z.name, seeds, a, margin, hueFor(i));
    if (zone) zones.set(z.name, zone);
    else missing.push(z.name);
  });
  return { zones, missing };
}

/**
 * Profundidad tipica del espacio pintable: la mediana de la distancia al borde
 * entre todos los pixeles donde puede caer una mancha. Dicho de otro modo, la
 * mitad del ancho que tiene el hueco donde hay que pintar, medida donde esta
 * el hueco (los pixeles pesan, no las zonas: una pluma de 5000 px no cuenta lo
 * mismo que el cuerpo entero).
 *
 * Sirve para elegir el tamano de la mancha: en una banda ancha caben manchas
 * grandes, y en el relleno de un trazo de 14 px no. Va por histograma de un
 * pixel de ancho porque son cientos de miles de valores y solo hace falta la
 * mediana al pixel.
 */
export function typicalDepth(zones: ZoneMap, dist: Float32Array): number {
  const MAX = 512;
  const hist = new Int32Array(MAX + 1);
  let n = 0;
  for (const zone of zones.values()) {
    for (const i of zone.valid) {
      const d = dist[i];
      hist[Math.min(MAX, Math.max(0, Math.round(d)))]++;
      n++;
    }
  }
  if (n === 0) return 0;
  let acc = 0;
  for (let d = 0; d <= MAX; d++) {
    acc += hist[d];
    if (acc * 2 >= n) return d;
  }
  return MAX;
}

export interface PlaceParams {
  mode: PlacementMode;
  minDistFactor: number;
  globalSeed: number;
  /** Ancho del lienzo de trabajo (para pasar de indice a x,y). */
  width: number;
  /** Rango de normalizacion del valor. */
  min: number;
  max: number;
}

/**
 * Coloca cada registro dentro de su zona. La posicion depende del hash del id
 * y de la semilla global, no del orden: agregar registros no mueve los demas.
 */
export function placeRecords(
  records: DataRecord[],
  zones: ZoneMap,
  p: PlaceParams
): { placed: PlacedPoint[]; warnings: Warning[] } {
  const placed: PlacedPoint[] = [];
  const warnings: Warning[] = [];
  const span = p.max - p.min || 1;

  const byZone = new Map<string, DataRecord[]>();
  for (const r of records) {
    const zone = zones.get(r.zona);
    if (!zone) {
      warnings.push({ kind: 'zona-inexistente', id: r.id, message: `La zona "${r.zona}" no existe en el dibujo` });
      continue;
    }
    const list = byZone.get(r.zona);
    if (list) list.push(r);
    else byZone.set(r.zona, [r]);
  }

  for (const [zoneName, recs] of byZone) {
    const zone = zones.get(zoneName)!;
    if (zone.valid.length === 0) {
      for (const r of recs) {
        warnings.push({ kind: 'sin-lugar', id: r.id, message: `La zona "${zoneName}" no tiene espacio util (sube el umbral o baja el margen)` });
      }
      continue;
    }

    if (p.mode === 'poisson') {
      const minDist = suggestMinDist(zone.valid.length, recs.length) * p.minDistFactor;
      const pos = poissonInZone(zone, recs.map((r) => r.id), p.globalSeed, p.width, minDist);
      for (const r of recs) {
        const pt = pos.get(r.id);
        if (pt) placed.push({ record: r, x: pt.x, y: pt.y, t: clamp01((r.valor - p.min) / span) });
      }
    } else {
      for (const r of recs) {
        const pt = randomInZone(zone, r.id, p.globalSeed, p.width);
        if (pt) placed.push({ record: r, x: pt.x, y: pt.y, t: clamp01((r.valor - p.min) / span) });
      }
    }
  }

  return { placed, warnings };
}
