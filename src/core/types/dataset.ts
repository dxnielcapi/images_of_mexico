/** Un registro del dataset: una persona ya lista para pintarse. */
export interface DataRecord {
  id: string;
  zona: string;
  valor: number;
  /** Columnas extra del origen, para el tooltip. */
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
