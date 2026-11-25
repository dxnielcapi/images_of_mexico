/**
 * Persistencia local de lo que se registra en la pantalla de registro.
 *
 * No hay servidor: el CSV de `public/samples` es solo de lectura y nunca se
 * modifica. Las personas que se suman en este dispositivo viven en
 * localStorage y, para que no dependan de que el navegador conserve sus datos,
 * se pueden bajar como CSV y volver a cargar desde ahi.
 *
 * Lo guardado va con la version del mapeo que lo produjo. Los campos `zona` y
 * `valor` de cada registro son cache de esa regla, no dato de origen: el dato
 * de origen son las columnas de la persona, y de ahi se puede recalcular todo
 * (ver `@data/mapping`). Por eso cambiar el mapeo no obliga a migrar nada a
 * mano ni deja registros viejos con una regla mezclada.
 */
import { parseCsvText } from '@io/readers/csv';
import type { DataRecord } from '@core/types';
import { MAPPING_VERSION } from '@data/mapping';

const KEY = 'mural.personas.v1';

/** Version del formato guardado (no del mapeo). */
const FORMAT = 2;

/**
 * Version del mapeo que se le atribuye a lo que no la declara: lo guardado por
 * el formato 1 y las copias que llegan como CSV. La regla 1 es "cualquier
 * petalo", y una zona ya sorteada la cumple, asi que se respeta tal como esta
 * y recien se remapea cuando `MAPPING_VERSION` avance.
 */
const LEGACY_MAPPING = 1;

/** Una tanda de registros con la version del mapeo que los produjo. */
export interface StoredBatch {
  records: DataRecord[];
  mapeo: number;
}

/** True si el navegador deja escribir (en modo privado puede fallar). */
export function storageAvailable(): boolean {
  const probe = `${KEY}.probe`;
  try {
    localStorage.setItem(probe, '1');
    localStorage.removeItem(probe);
    return true;
  } catch {
    return false;
  }
}

const CLAVES_PROHIBIDAS = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_RECORDS_LOCAL = 20_000;
const MAX_EXTRA_KEYS = 32;
const MAX_EXTRA_LEN = 500;
const CTRL_CHARS = /[\u0000-\u001F\u007F]/g;

/** Se queda con lo que tenga forma de registro y descarta el resto. */
function sanitize(data: unknown): DataRecord[] {
  if (!Array.isArray(data)) return [];
  const out: DataRecord[] = [];
  const limite = Math.min(data.length, MAX_RECORDS_LOCAL);
  for (let i = 0; i < limite; i++) {
    const raw = data[i];
    if (!raw || typeof raw !== 'object') continue;
    const { id, zona, valor, extra } = raw as Partial<DataRecord>;
    if (typeof id !== 'string' || !id || id.length > 120) continue;
    if (typeof zona !== 'string' || !zona || zona.length > 120) continue;
    if (typeof valor !== 'number' || !isFinite(valor)) continue;
    const safe: Record<string, string> = {};
    if (extra && typeof extra === 'object' && !Array.isArray(extra)) {
      let count = 0;
      for (const [k, v] of Object.entries(extra)) {
        if (count >= MAX_EXTRA_KEYS) break;
        if (CLAVES_PROHIBIDAS.has(k) || k.length > 80) continue;
        if (typeof v === 'string') {
          const clean = v.replace(CTRL_CHARS, '').trim().slice(0, MAX_EXTRA_LEN);
          if (clean !== '') {
            safe[k] = clean;
            count++;
          }
        }
      }
    }
    out.push({ id: id.replace(CTRL_CHARS, ''), zona: zona.replace(CTRL_CHARS, ''), valor, extra: safe });
  }
  return out;
}

/** Lee una tanda guardada, venga del formato 1 (lista pelada) o del 2. */
function readBatch(data: unknown): StoredBatch {
  if (Array.isArray(data)) return { records: sanitize(data), mapeo: LEGACY_MAPPING };
  if (data && typeof data === 'object') {
    const { personas, mapeo } = data as { personas?: unknown; mapeo?: unknown };
    return {
      records: sanitize(personas),
      mapeo: typeof mapeo === 'number' && isFinite(mapeo) ? mapeo : LEGACY_MAPPING,
    };
  }
  return { records: [], mapeo: MAPPING_VERSION };
}

export function loadLocal(): StoredBatch {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? readBatch(JSON.parse(raw)) : { records: [], mapeo: MAPPING_VERSION };
  } catch {
    return { records: [], mapeo: MAPPING_VERSION };
  }
}

/**
 * Guarda junto a la version del mapeo vigente; devuelve false si el navegador
 * no dejo (modo privado o cuota).
 */
export function saveLocal(records: DataRecord[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify({ v: FORMAT, mapeo: MAPPING_VERSION, personas: records }));
    return true;
  } catch {
    return false;
  }
}

export function clearLocal(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nada que borrar si tampoco se pudo escribir.
  }
}

/**
 * Lee una copia bajada antes: el CSV del dataset o el JSON interno. El JSON
 * dice con que mapeo se guardo; el CSV no, y se asume el heredado.
 */
export function parseBackup(text: string): StoredBatch {
  const t = text.trim();
  if (!t) return { records: [], mapeo: MAPPING_VERSION };
  if (t.startsWith('[') || t.startsWith('{')) {
    try {
      return readBatch(JSON.parse(t));
    } catch {
      return { records: [], mapeo: MAPPING_VERSION };
    }
  }
  return { records: parseCsvText(t).records, mapeo: LEGACY_MAPPING };
}

/** Une dos listas sin repetir ids; devuelve la lista y cuantos entraron. */
export function mergeById(current: DataRecord[], incoming: DataRecord[]): { records: DataRecord[]; added: number } {
  const seen = new Set(current.map((r) => r.id));
  const merged = [...current];
  let added = 0;
  for (const r of incoming) {
    if (seen.has(r.id)) continue;
    seen.add(r.id);
    merged.push(r);
    added++;
  }
  return { records: merged, added };
}
