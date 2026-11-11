/**
 * Persistencia local de lo que se registra en la pantalla de registro.
 *
 * No hay servidor: el CSV de `public/samples` es solo de lectura y nunca se
 * modifica. Las personas que se suman en este dispositivo viven en
 * localStorage y, para que no dependan de que el navegador conserve sus datos,
 * se pueden bajar como CSV y volver a cargar desde ahi.
 */
import { parseCsvText } from './loadCsv';
import type { DataRecord } from '../types';

const KEY = 'mural.personas.v1';

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

/** Se queda con lo que tenga forma de registro y descarta el resto. */
function sanitize(data: unknown): DataRecord[] {
  if (!Array.isArray(data)) return [];
  const out: DataRecord[] = [];
  for (const raw of data) {
    if (!raw || typeof raw !== 'object') continue;
    const { id, zona, valor, extra } = raw as Partial<DataRecord>;
    if (typeof id !== 'string' || !id) continue;
    if (typeof zona !== 'string' || !zona) continue;
    if (typeof valor !== 'number' || !isFinite(valor)) continue;
    const safe: Record<string, string> = {};
    if (extra && typeof extra === 'object') {
      for (const [k, v] of Object.entries(extra)) {
        if (typeof v === 'string' && v !== '') safe[k] = v;
      }
    }
    out.push({ id, zona, valor, extra: safe });
  }
  return out;
}

export function loadLocal(): DataRecord[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? sanitize(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

/** Guarda; devuelve false si el navegador no dejo (modo privado o cuota). */
export function saveLocal(records: DataRecord[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(records));
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

/** Lee una copia bajada antes: el CSV del dataset o el JSON interno. */
export function parseBackup(text: string): DataRecord[] {
  const t = text.trim();
  if (!t) return [];
  if (t.startsWith('[') || t.startsWith('{')) {
    try {
      return sanitize(JSON.parse(t));
    } catch {
      return [];
    }
  }
  return parseCsvText(t).records;
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
