import type { Zone } from './zones/zoneMask';
import type { WatercolorParams } from './render/watercolor';

/** Un registro del CSV. */
export interface DataRecord {
  id: string;
  zona: string;
  valor: number;
  /** Columnas extra del CSV, para el tooltip. */
  extra: Record<string, string>;
}

/** Un registro ya colocado en el lienzo. */
export interface PlacedPoint {
  record: DataRecord;
  x: number;
  y: number;
  /** valor normalizado a [0,1]. */
  t: number;
}

export type PlacementMode = 'random' | 'poisson';

export interface RenderOptions {
  width: number;
  height: number;
  watercolor: WatercolorParams;
  bleed: number;
  grain: number;
  paletteId: string;
  globalSeed: number;
  showLines: boolean;
  lineAlpha: number;
}

export interface Warning {
  kind: 'zona-inexistente' | 'checksum' | 'zona-id' | 'valor' | 'id-generado' | 'sin-lugar';
  id: string;
  message: string;
}

export interface ZonesConfig {
  drawing: string;
  width: number;
  height: number;
  threshold: number;
  dilate: number;
  minArea?: number;
  margin?: number;
  zones: { name: string; seedPoints: [number, number][] }[];
}

export type ZoneMap = Map<string, Zone>;
