import type { LabelResult } from './connectedComponents';
import { dilate } from './morphology';

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

/**
 * Canvas de recorte de la zona (alfa 255 dentro), opcionalmente con sangrado.
 * El canvas cubre el bbox expandido por `bleed`, escalado por `scale`.
 */
export function zoneClipCanvas(zone: Zone, bleed: number, scale: number): {
  canvas: HTMLCanvasElement; offsetX: number; offsetY: number;
} {
  const b = Math.max(0, Math.round(bleed));
  const w = zone.maskW + b * 2;
  const h = zone.maskH + b * 2;
  const padded = new Uint8Array(w * h);
  for (let y = 0; y < zone.maskH; y++) {
    for (let x = 0; x < zone.maskW; x++) {
      if (zone.mask[y * zone.maskW + x]) padded[(y + b) * w + (x + b)] = 1;
    }
  }
  const grown = b > 0 ? dilate(padded, w, h, b) : padded;

  const base = document.createElement('canvas');
  base.width = w; base.height = h;
  const bctx = base.getContext('2d')!;
  const img = bctx.createImageData(w, h);
  for (let i = 0; i < grown.length; i++) {
    if (grown[i]) {
      img.data[i * 4] = 255; img.data[i * 4 + 1] = 255;
      img.data[i * 4 + 2] = 255; img.data[i * 4 + 3] = 255;
    }
  }
  bctx.putImageData(img, 0, 0);

  if (scale === 1) {
    return { canvas: base, offsetX: zone.minX - b, offsetY: zone.minY - b };
  }
  const up = document.createElement('canvas');
  up.width = Math.round(w * scale);
  up.height = Math.round(h * scale);
  const uctx = up.getContext('2d')!;
  uctx.imageSmoothingEnabled = true;
  uctx.drawImage(base, 0, 0, up.width, up.height);
  return { canvas: up, offsetX: (zone.minX - b) * scale, offsetY: (zone.minY - b) * scale };
}

/** Paleta pastel estable para distinguir zonas al resaltar. */
export function pastelFor(hue: number, alpha = 0.45): string {
  return `hsla(${hue % 360}, 70%, 68%, ${alpha})`;
}
