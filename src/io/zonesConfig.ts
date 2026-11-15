import type { ZonesConfig, ZoneMap } from '@core/types';
import type { DetectParams } from '@core/scene';

/** Los parametros con los que se delimito: deteccion + margen interno. */
export interface ConfigParams extends DetectParams {
  margin: number;
}

export function buildConfig(
  drawing: string,
  width: number,
  height: number,
  p: ConfigParams,
  zones: ZoneMap
): ZonesConfig {
  return {
    drawing,
    width,
    height,
    threshold: p.threshold,
    dilate: p.dilate,
    close: p.close ?? 0,
    minArea: p.minArea,
    margin: p.margin,
    zones: [...zones.values()].map((z) => ({ name: z.name, seedPoints: z.seedPoints })),
  };
}

export function parseConfig(text: string): ZonesConfig {
  const cfg = JSON.parse(text) as ZonesConfig;
  if (!cfg || !Array.isArray(cfg.zones)) throw new Error('JSON de zonas invalido');
  return cfg;
}
