/** Etiquetado de componentes conexos (4-conectividad) sobre los pixeles de fondo. */

export interface Region {
  label: number;
  area: number;
  minX: number; minY: number; maxX: number; maxY: number;
  touchesBorder: boolean;
  /** Pixel mas interior de la region (mayor distancia a la tinta): semilla estable. */
  seedX: number; seedY: number;
  seedDist: number;
}

export interface LabelResult {
  /** Etiqueta por pixel; 0 = tinta o region descartada. */
  labels: Int32Array;
  regions: Map<number, Region>;
  width: number;
  height: number;
}

/**
 * Flood fill iterativo por scanline sobre el fondo (ink === 0).
 * `distToInk` se usa para elegir la semilla mas interior de cada region.
 */
export function labelRegions(
  ink: Uint8Array,
  width: number,
  height: number,
  distToInk: Float32Array,
  minArea: number
): LabelResult {
  const labels = new Int32Array(width * height);
  const regions = new Map<number, Region>();
  const stack: number[] = [];
  let next = 1;

  for (let sy = 0; sy < height; sy++) {
    for (let sx = 0; sx < width; sx++) {
      const start = sy * width + sx;
      if (ink[start] || labels[start]) continue;

      const label = next++;
      const region: Region = {
        label, area: 0,
        minX: sx, minY: sy, maxX: sx, maxY: sy,
        touchesBorder: false,
        seedX: sx, seedY: sy, seedDist: -1,
      };

      stack.length = 0;
      stack.push(start);
      labels[start] = label;

      while (stack.length) {
        const idx = stack.pop()!;
        const y = (idx / width) | 0;
        let xl = idx - y * width;
        let xr = xl;
        // Extender a izquierda y derecha en la fila.
        while (xl > 0 && !ink[y * width + xl - 1] && !labels[y * width + xl - 1]) {
          xl--;
          labels[y * width + xl] = label;
        }
        while (xr < width - 1 && !ink[y * width + xr + 1] && !labels[y * width + xr + 1]) {
          xr++;
          labels[y * width + xr] = label;
        }

        region.area += xr - xl + 1;
        if (xl < region.minX) region.minX = xl;
        if (xr > region.maxX) region.maxX = xr;
        if (y < region.minY) region.minY = y;
        if (y > region.maxY) region.maxY = y;
        if (y === 0 || y === height - 1 || xl === 0 || xr === width - 1) region.touchesBorder = true;

        for (let x = xl; x <= xr; x++) {
          const i = y * width + x;
          const dist = distToInk[i];
          if (dist > region.seedDist) {
            region.seedDist = dist;
            region.seedX = x;
            region.seedY = y;
          }
          if (y > 0) {
            const up = i - width;
            if (!ink[up] && !labels[up]) { labels[up] = label; stack.push(up); }
          }
          if (y < height - 1) {
            const dn = i + width;
            if (!ink[dn] && !labels[dn]) { labels[dn] = label; stack.push(dn); }
          }
        }
      }

      regions.set(label, region);
    }
  }

  // Descartar el exterior (toca el borde) y las regiones muy pequenas.
  const drop = new Set<number>();
  for (const r of regions.values()) {
    if (r.touchesBorder || r.area < minArea) drop.add(r.label);
  }
  if (drop.size) {
    for (let i = 0; i < labels.length; i++) if (drop.has(labels[i])) labels[i] = 0;
    for (const l of drop) regions.delete(l);
  }

  return { labels, regions, width, height };
}
