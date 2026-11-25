import type { DataRecord } from '@core/types';

/**
 * Neutraliza posibles formulas de hoja de calculo (CSV Formula Injection)
 * prefijando con apostrofo los textos que inician con `=`, `+`, `-`, `@`,
 * tabulador o retorno de carro, sin tocar numeros puros.
 */
function safeCsvCell(value: string | number): string {
  const s = String(value);
  const neutralized =
    typeof value === 'string' && /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)
      ? `'${s}`
      : s;
  return /[",\n\r]/.test(neutralized)
    ? `"${neutralized.replace(/"/g, '""')}"`
    : neutralized;
}

/** Una fila de CSV, con comillas solo donde hacen falta. */
function csvRow(values: (string | number)[]): string {
  return values.map(safeCsvCell).join(',');
}

/**
 * CSV con el mismo formato que el dataset de entrada, para que lo que se baje
 * se pueda volver a cargar (o pegar en `datos_ejemplo.csv`) sin tocar nada.
 * `columns` fija el orden de las columnas extra; si falta, se toman las que
 * aparezcan en los registros.
 */
export function recordsToCsv(records: DataRecord[], columns?: readonly string[]): string {
  const extras = columns ?? [...new Set(records.flatMap((r) => Object.keys(r.extra)))];
  const body = records.map((r) =>
    csvRow([r.id, r.zona, r.valor, ...extras.map((c) => r.extra[c] ?? '')])
  );
  return [csvRow(['id', 'zona', 'valor', ...extras]), ...body].join('\n');
}
