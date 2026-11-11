import Papa from 'papaparse';
import type { DataRecord, Warning } from '@core/types';
import { generateId, parseId, normalizeZoneCode, todayCompact } from '@core/ids/idCodec';

export interface CsvResult {
  records: DataRecord[];
  warnings: Warning[];
  columns: string[];
  min: number;
  max: number;
}

const ID_KEYS = ['id', 'ID', 'Id'];
const ZONE_KEYS = ['zona', 'zone', 'Zona', 'Zone'];
const VALUE_KEYS = ['valor', 'value', 'Valor', 'Value'];

function pick(row: Record<string, string>, keys: string[]): string | undefined {
  for (const k of keys) if (row[k] !== undefined && row[k] !== '') return row[k];
  return undefined;
}

export function parseCsvText(text: string): CsvResult {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const warnings: Warning[] = [];
  const records: DataRecord[] = [];
  const columns = parsed.meta.fields ?? [];
  const today = todayCompact();
  let counter = 0;

  for (const row of parsed.data) {
    if (!row) continue;
    const zona = (pick(row, ZONE_KEYS) ?? '').trim();
    const rawValor = pick(row, VALUE_KEYS);
    const valor = Number(String(rawValor ?? '').replace(',', '.'));

    if (!zona) continue;

    let id = (pick(row, ID_KEYS) ?? '').trim();
    if (!id) {
      counter++;
      id = generateId({
        zona,
        categoria: (row['categoria'] || row['category'] || 'GEN').toUpperCase().slice(0, 8),
        fecha: (row['fecha'] || '').replace(/-/g, '') || today,
        registro: counter,
      });
      warnings.push({ kind: 'id-generado', id, message: `Sin columna id: se genero ${id}` });
    }

    if (!isFinite(valor)) {
      warnings.push({ kind: 'valor', id, message: `Valor no numerico ("${rawValor ?? ''}")` });
      continue;
    }

    const parsedId = parseId(id);
    if (parsedId.wellFormed && !parsedId.checksumOk) {
      warnings.push({ kind: 'checksum', id, message: `Checksum invalido (${parsedId.checksum})` });
    }
    if (parsedId.wellFormed && parsedId.zona !== normalizeZoneCode(zona)) {
      warnings.push({
        kind: 'zona-id',
        id,
        message: `La zona del id (${parsedId.zona}) no coincide con la columna zona (${zona})`,
      });
    }

    const extra: Record<string, string> = {};
    for (const [k, v] of Object.entries(row)) {
      if (ID_KEYS.includes(k) || ZONE_KEYS.includes(k) || VALUE_KEYS.includes(k)) continue;
      if (v !== undefined && v !== '') extra[k] = String(v);
    }

    records.push({ id, zona, valor, extra });
  }

  let min = Infinity, max = -Infinity;
  for (const r of records) {
    if (r.valor < min) min = r.valor;
    if (r.valor > max) max = r.valor;
  }
  if (!isFinite(min)) { min = 0; max = 1; }

  return { records, warnings, columns, min, max };
}

export async function parseCsvFile(file: File): Promise<CsvResult> {
  return parseCsvText(await file.text());
}
