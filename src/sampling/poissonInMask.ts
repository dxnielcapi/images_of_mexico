import type { Zone } from '../zones/zoneMask';
import { mulberry32, seedFor, hashString } from './prng';
import { SpatialGrid } from './grid';

export interface Placed { id: string; x: number; y: number }

/**
 * Reparto parejo tipo Poisson disk (dart throwing restringido a la mascara).
 * Los registros se procesan en orden estable (hash del id), y cada uno saca
 * sus candidatos de su propio PRNG: el primer intento de cada punto es el
 * mismo que tendria en modo aleatorio puro, de modo que la imagen solo
 * cambia donde hubo colisiones reales.
 */
export function poissonInZone(
  zone: Zone,
  ids: string[],
  globalSeed: number,
  width: number,
  minDist: number,
  attempts = 30
): Map<string, { x: number; y: number }> {
  const out = new Map<string, { x: number; y: number }>();
  if (zone.valid.length === 0) return out;

  const ordered = [...ids].sort((a, b) => {
    const ha = hashString(a), hb = hashString(b);
    return ha === hb ? a.localeCompare(b) : ha - hb;
  });

  const grid = new SpatialGrid<Placed>(Math.max(2, minDist), zone.maxX + 1, zone.maxY + 1);
  const min2 = minDist * minDist;

  for (const id of ordered) {
    const rng = mulberry32(seedFor(id, globalSeed));
    let best: { x: number; y: number } | null = null;
    let bestScore = -1;

    for (let k = 0; k < attempts; k++) {
      const gi = zone.valid[Math.floor(rng() * zone.valid.length) % zone.valid.length];
      const x = gi % width;
      const y = (gi / width) | 0;

      let nearest = Infinity;
      for (const p of grid.near(x, y, minDist)) {
        const dx = p.x - x, dy = p.y - y;
        const d = dx * dx + dy * dy;
        if (d < nearest) nearest = d;
      }
      if (nearest >= min2) { best = { x, y }; break; }
      if (nearest > bestScore) { bestScore = nearest; best = { x, y }; }
    }

    if (best) {
      out.set(id, best);
      grid.insert({ id, x: best.x, y: best.y });
    }
  }
  return out;
}

/** Distancia minima sugerida para que N puntos quepan parejos en un area. */
export function suggestMinDist(area: number, count: number): number {
  if (count <= 1) return Math.sqrt(area) / 2;
  return Math.sqrt(area / count) * 0.75;
}
