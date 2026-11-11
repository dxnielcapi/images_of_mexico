import { hashString } from '../sampling/prng';

/**
 * Convencion de IDs: ZONA-CATEGORIA-YYYYMMDD-RNNN-CC
 * El checksum CC son 2 caracteres base36 derivados de las partes anteriores.
 */
export interface IdParts {
  zona: string;
  categoria: string;
  fecha: string; // YYYYMMDD
  registro: number; // N de RNNN
}

export interface ParsedId extends IdParts {
  raw: string;
  checksum: string;
  checksumOk: boolean;
  wellFormed: boolean;
}

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function checksumOf(zona: string, categoria: string, fecha: string, registro: string): string {
  const h = hashString(`${zona}|${categoria}|${fecha}|${registro}`);
  const a = ALPHABET[h % 36];
  const b = ALPHABET[Math.floor(h / 36) % 36];
  return a + b;
}

export function normalizeZoneCode(zona: string): string {
  return zona
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '');
}

export function generateId(parts: IdParts): string {
  const zona = normalizeZoneCode(parts.zona);
  const categoria = parts.categoria.toUpperCase();
  const fecha = parts.fecha;
  const registro = 'R' + String(parts.registro).padStart(3, '0');
  return `${zona}-${categoria}-${fecha}-${registro}-${checksumOf(zona, categoria, fecha, registro)}`;
}

export function parseId(raw: string): ParsedId {
  const m = /^([A-Z0-9]+)-([A-Z0-9]+)-(\d{8})-(R\d+)-([A-Z0-9]{2})$/.exec(raw.trim().toUpperCase());
  if (!m) {
    return {
      raw,
      zona: '',
      categoria: '',
      fecha: '',
      registro: NaN,
      checksum: '',
      checksumOk: false,
      wellFormed: false,
    };
  }
  const [, zona, categoria, fecha, registro, checksum] = m;
  return {
    raw,
    zona,
    categoria,
    fecha,
    registro: Number(registro.slice(1)),
    checksum,
    checksumOk: checksumOf(zona, categoria, fecha, registro) === checksum,
    wellFormed: true,
  };
}

/** Formatea YYYYMMDD -> YYYY-MM-DD para mostrar. */
export function formatIdDate(fecha: string): string {
  if (!/^\d{8}$/.test(fecha)) return fecha;
  return `${fecha.slice(0, 4)}-${fecha.slice(4, 6)}-${fecha.slice(6, 8)}`;
}

export function todayCompact(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}
