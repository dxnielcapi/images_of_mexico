import type { LabelResult } from './connectedComponents';

/** Una zona nombrada: una o varias regiones conexas agrupadas. */
export interface Zone {
  name: string;
  /** Etiquetas de region que la componen. */
  regions: number[];
  /** Semillas (x,y) que reconstruyen la zona al cargar la configuracion. */
  seedPoints: [number, number][];
  minX: number; minY: number; maxX: number; maxY: number;
  area: number;
  /** Mascara recortada al bounding box: 1 = dentro de la zona. */
  mask: Uint8Array;
  maskW: number; maskH: number;
  /** Indices globales de pixeles validos para colocar centros (ya erosionados). */
  valid: Int32Array;
  /** Color pastel estable para el resaltado. */
  hue: number;
}

export function buildZone(
  name: string,
  regionLabels: number[],
  labeling: LabelResult,
  distToInk: Float32Array,
  margin: number,
  hue: number
): Zone {
  const { labels, regions, width } = labeling;
  const set = new Set(regionLabels);
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let area = 0;
  const seedPoints: [number, number][] = [];

  for (const l of regionLabels) {
    const r = regions.get(l);
    if (!r) continue;
    minX = Math.min(minX, r.minX); minY = Math.min(minY, r.minY);
    maxX = Math.max(maxX, r.maxX); maxY = Math.max(maxY, r.maxY);
    area += r.area;
    seedPoints.push([r.seedX, r.seedY]);
  }
  if (!isFinite(minX)) { minX = minY = 0; maxX = maxY = 0; }

  const maskW = maxX - minX + 1;
  const maskH = maxY - minY + 1;
  const mask = new Uint8Array(maskW * maskH);
  const valid: number[] = [];

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const gi = y * width + x;
      if (!set.has(labels[gi])) continue;
      mask[(y - minY) * maskW + (x - minX)] = 1;
      if (distToInk[gi] >= margin) valid.push(gi);
    }
  }

  // Si el margen deja la zona sin pixeles, relajarlo progresivamente.
  if (valid.length === 0) {
    let relaxed = margin;
    while (valid.length === 0 && relaxed > 0) {
      relaxed = Math.max(0, relaxed - 1);
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const gi = y * width + x;
          if (set.has(labels[gi]) && distToInk[gi] >= relaxed) valid.push(gi);
        }
      }
    }
  }

  return {
    name, regions: [...regionLabels], seedPoints,
    minX, minY, maxX, maxY, area,
    mask, maskW, maskH,
    valid: Int32Array.from(valid),
    hue,
  };
}

/** Paleta pastel estable para distinguir zonas al resaltar. */
export function pastelFor(hue: number, alpha = 0.45): string {
  return `hsla(${hue % 360}, 70%, 68%, ${alpha})`;
}
