import type { Zone } from '../zones/zoneMask';

export type ZoneMap = Map<string, Zone>;

/**
 * Las zonas de un dibujo, serializadas. Guarda semillas y no mascaras: pesa
 * menos de 1 KB y sobrevive a cambios de umbral o de resolucion.
 */
export interface ZonesConfig {
  drawing: string;
  width: number;
  height: number;
  threshold: number;
  dilate: number;
  /** Radio para cerrar el trazo; ausente o 0 = dibujo ya cerrado. */
  close?: number;
  minArea?: number;
  margin?: number;
  zones: { name: string; seedPoints: [number, number][] }[];
}
