/**
 * Los tipos del nucleo, en un solo punto de entrada: `@core/types`.
 *
 * Se parten por tema para que agregar el mapeo declarativo (`MappingSpec`) y
 * el preset del mural sea sumar un archivo, no editar uno compartido.
 */
export type { DataRecord, PlacedPoint } from './dataset';
export type { ZoneMap, ZonesConfig } from './zone';
export type { PlacementMode } from './placement';
export type { RenderOptions } from './render';
export type { Warning } from './warning';
