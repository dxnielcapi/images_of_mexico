import { hashString } from '../sampling/prng';

/**
 * Convencion de IDs: AMBITO-CATEGORIA-YYYYMMDD-RNNN-CC
 * El checksum CC son 2 caracteres base36 derivados de las partes anteriores.
 *
 * El `AMBITO` es opaco: las altas del mural usan la constante `ID_SCOPE`. A
 * proposito no lleva la zona, porque la zona la decide el mapeo y puede
 * cambiar (ver `@data/mapping`), mientras el id tiene que ser estable: de el
 * dependen la posicion de la mancha, el de-dup al importar copias y el jitter
 * del color.
 *
 * Los ids historicos si traian la zona ahi (`ZONA06-PERSONA-...`). Siguen
 * siendo validos y su checksum se verifica igual, porque el ambito entra al
 * checksum tal como viene escrito.
 */

/** Ambito de los ids que genera el mural. No es una zona. */
export const ID_SCOPE = 'REG';

export interface IdParts {
  /** Por defecto `ID_SCOPE`. */
  ambito?: string;
  categoria: string;
  fecha: string; // YYYYMMDD
  registro: number; // N de RNNN
}

export interface ParsedId {
  ambito: string;
  categoria: string;
  fecha: string;
  registro: number;
  raw: string;
  checksum: string;
  checksumOk: boolean;
  wellFormed: boolean;
}

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export function checksumOf(ambito: string, categoria: string, fecha: string, registro: string): string {
  const h = hashString(`${ambito}|${categoria}|${fecha}|${registro}`);
  const a = ALPHABET[h % 36];
  const b = ALPHABET[Math.floor(h / 36) % 36];
  return a + b;
}

/** Deja solo A-Z0-9 sin acentos: sirve para el ambito y para codigos de zona. */
export function normalizeZoneCode(zona: string): string {
  return zona
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '');
}

export function generateId(parts: IdParts): string {
  const ambito = normalizeZoneCode(parts.ambito ?? ID_SCOPE) || ID_SCOPE;
  const categoria = parts.categoria.toUpperCase();
  const fecha = parts.fecha;
  const registro = 'R' + String(parts.registro).padStart(3, '0');
  return `${ambito}-${categoria}-${fecha}-${registro}-${checksumOf(ambito, categoria, fecha, registro)}`;
}

/**
 * True si el ambito de un id es un codigo de zona, como en los ids historicos.
 * Los que genera el mural hoy no lo son, y por eso no se comparan con la zona
 * del registro.
 */
export function scopeIsZone(ambito: string): boolean {
  return ambito !== '' && ambito !== ID_SCOPE;
}

export function parseId(raw: string): ParsedId {
  const m = /^([A-Z0-9]+)-([A-Z0-9]+)-(\d{8})-(R\d+)-([A-Z0-9]{2})$/.exec(raw.trim().toUpperCase());
  if (!m) {
    return {
      raw,
      ambito: '',
      categoria: '',
      fecha: '',
      registro: NaN,
      checksum: '',
      checksumOk: false,
      wellFormed: false,
    };
  }
  const [, ambito, categoria, fecha, registro, checksum] = m;
  return {
    raw,
    ambito,
    categoria,
    fecha,
    registro: Number(registro.slice(1)),
    checksum,
    checksumOk: checksumOf(ambito, categoria, fecha, registro) === checksum,
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
