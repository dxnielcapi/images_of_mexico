import type { ZonesConfig, ZoneMap } from '@core/types';

export function buildConfig(
  drawing: string,
  width: number,
  height: number,
  threshold: number,
  dilateRadius: number,
  minArea: number,
  margin: number,
  zones: ZoneMap
): ZonesConfig {
  return {
    drawing,
    width,
    height,
    threshold,
    dilate: dilateRadius,
    minArea,
    margin,
    zones: [...zones.values()].map((z) => ({ name: z.name, seedPoints: z.seedPoints })),
  };
}

export function parseConfig(text: string): ZonesConfig {
  const cfg = JSON.parse(text) as ZonesConfig;
  if (!cfg || !Array.isArray(cfg.zones)) throw new Error('JSON de zonas invalido');
  return cfg;
}
