import type { Zone } from '../zones/zoneMask';
import { mulberry32, seedFor } from './prng';

/**
 * Posicion aleatoria pura dentro de la mascara de la zona.
 * La semilla deriva del id, asi que la posicion es estable: agregar
 * registros nuevos no mueve a los existentes.
 */
export function randomInZone(
  zone: Zone,
  id: string,
  globalSeed: number,
  width: number
): { x: number; y: number } | null {
  if (zone.valid.length === 0) return null;
  const rng = mulberry32(seedFor(id, globalSeed));
  const gi = zone.valid[Math.floor(rng() * zone.valid.length) % zone.valid.length];
  return { x: gi % width, y: (gi / width) | 0 };
}
