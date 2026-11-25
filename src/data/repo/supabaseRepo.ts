/**
 * Persistencia remota del mural en Supabase (PostgreSQL + Realtime).
 *
 * El sitio es 100% estatico: el navegador lee e inserta directamente contra la
 * Data API de Supabase usando la llave publica (`PUBLIC_SUPABASE_ANON_KEY`),
 * protegido por RLS, constraints CHECK y un rate limit en trigger. Todo eso
 * vive en `supabase/schema.sql`, que es la unica defensa real: la llave viaja
 * en el bundle y lo de `@data/seguridad` corre en el navegador, asi que no
 * aplica a quien llame la API por su cuenta.
 *
 * Si las variables de entorno no estan configuradas, todas las operaciones son
 * no-op seguras y el mural cae automaticamente a `localStorage` (`localRepo`).
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { DataRecord } from '@core/types';
import { MAPPING_VERSION } from '@data/mapping';
import { PERSON_FIELD_KEYS } from '@data/person';

const SUPABASE_URL = (import.meta.env.PUBLIC_SUPABASE_URL ?? '').trim();
const SUPABASE_ANON_KEY = (import.meta.env.PUBLIC_SUPABASE_ANON_KEY ?? '').trim();

const TABLE = 'registros';
const PAGE_SIZE = 1000;

/** Fila tal como vive en `public.registros`. */
interface RegistroRow {
  seq?: number;
  id: string;
  zona: string;
  valor: number;
  mapeo_version: number;
  nombre: string;
  edad: string;
  ocupacion: string;
  lugar_origen: string;
  alimentacion: string;
  prefiere: string;
  merece_digna: string;
  oportunidades_justas: string;
  perdida_soberania: string;
  mensaje: string;
  fecha: string;
}

/** Registro leido de Supabase junto a la version de mapeo con la que se guardo. */
export interface RemoteItem {
  record: DataRecord;
  mapeo: number;
}

export interface RemoteLoadResult {
  ok: boolean;
  items: RemoteItem[];
  error?: string;
}

export type RemoteInsertResult =
  | { ok: true }
  | { ok: false; conflict: boolean; error: string };

let cachedClient: SupabaseClient | null = null;

/** True si estan presentes la URL y la llave publica de Supabase. */
export function supabaseConfigured(): boolean {
  return SUPABASE_URL.length > 0 && SUPABASE_ANON_KEY.length > 0;
}

function getClient(): SupabaseClient | null {
  if (!supabaseConfigured()) return null;
  if (!cachedClient) {
    cachedClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }
  return cachedClient;
}

function rowToItem(row: Partial<RegistroRow>): RemoteItem | null {
  if (typeof row.id !== 'string' || !row.id) return null;
  const valor = typeof row.valor === 'number' && Number.isFinite(row.valor) ? row.valor : 0.5;
  const zona = typeof row.zona === 'string' ? row.zona : '';
  const mapeo =
    typeof row.mapeo_version === 'number' && Number.isFinite(row.mapeo_version)
      ? row.mapeo_version
      : 1;

  const extra: Record<string, string> = {};
  const raw = row as Record<string, unknown>;
  for (const key of PERSON_FIELD_KEYS) {
    const v = raw[key];
    if (typeof v === 'string' && v !== '') extra[key] = v;
  }

  return {
    record: { id: row.id, zona, valor, extra },
    mapeo,
  };
}

function recordToRow(record: DataRecord): RegistroRow {
  const e = record.extra;
  return {
    id: record.id,
    zona: record.zona,
    valor: record.valor,
    mapeo_version: MAPPING_VERSION,
    nombre: e['nombre'] ?? '',
    edad: e['edad'] ?? '',
    ocupacion: e['ocupacion'] ?? '',
    lugar_origen: e['lugar_origen'] ?? '',
    alimentacion: e['alimentacion'] ?? '',
    prefiere: e['prefiere'] ?? '',
    merece_digna: e['merece_digna'] ?? '',
    oportunidades_justas: e['oportunidades_justas'] ?? '',
    perdida_soberania: e['perdida_soberania'] ?? '',
    mensaje: e['mensaje'] ?? '',
    fecha: e['fecha'] ?? '',
  };
}

/**
 * Carga todos los registros de `public.registros`, paginando en bloques de
 * 1000 filas (el limite por defecto de PostgREST) para no cortar el mural.
 */
export async function loadRemote(): Promise<RemoteLoadResult> {
  const client = getClient();
  if (!client) return { ok: true, items: [] };

  const items: RemoteItem[] = [];
  let from = 0;

  try {
    while (true) {
      const { data, error } = await client
        .from(TABLE)
        .select(
          'id,zona,valor,mapeo_version,nombre,edad,ocupacion,lugar_origen,alimentacion,prefiere,merece_digna,oportunidades_justas,perdida_soberania,mensaje,fecha'
        )
        .order('seq', { ascending: true })
        .range(from, from + PAGE_SIZE - 1);

      if (error) {
        console.warn('No se pudieron cargar los registros de Supabase:', error.message);
        return { ok: false, items, error: error.message };
      }

      const rows = (data ?? []) as Partial<RegistroRow>[];
      for (const row of rows) {
        const item = rowToItem(row);
        if (item) items.push(item);
      }

      if (rows.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }

    return { ok: true, items };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('Error de red al cargar Supabase:', msg);
    return { ok: false, items, error: msg };
  }
}

/**
 * Inserta un registro en `public.registros`.
 * Si dos personas generan el mismo ID secuencial a la vez, Postgres devuelve
 * codigo `23505` (`conflict: true`) para que el cliente genere el siguiente ID.
 */
export async function insertRemote(record: DataRecord): Promise<RemoteInsertResult> {
  const client = getClient();
  if (!client) {
    return { ok: false, conflict: false, error: 'Supabase no está configurado.' };
  }

  try {
    const { error } = await client.from(TABLE).insert(recordToRow(record));
    if (!error) return { ok: true };

    if (error.code === '23505') {
      return { ok: false, conflict: true, error: 'ID en conflicto.' };
    }
    if (error.code === '23514') {
      return {
        ok: false,
        conflict: false,
        error: 'Alguno de los datos no pasó la validación del servidor.',
      };
    }
    // El trigger de `supabase/schema.sql` levanta estos dos con un SQLSTATE
    // propio. El rate limit del navegador (`@data/seguridad`) deberia haber
    // frenado antes a quien usa el formulario, asi que llegar aqui significa
    // casi siempre que la red entera lleva muchas altas: el mensaje habla de
    // la red y no de la persona, que no hizo nada raro.
    if (error.code === 'PT429') {
      return {
        ok: false,
        conflict: false,
        error: 'El mural está recibiendo muchos registros desde esta red. Intenta en un momento.',
      };
    }
    if (error.code === 'PT422') {
      return {
        ok: false,
        conflict: false,
        error: 'La fecha de tu dispositivo no coincide con la del servidor. Revísala e intenta de nuevo.',
      };
    }

    console.warn('Error al guardar en Supabase:', error.code, error.message);
    return {
      ok: false,
      conflict: false,
      error: 'No se pudo guardar tu registro en el mural. Intenta de nuevo en un momento.',
    };
  } catch (err) {
    console.warn('Error de red al guardar en Supabase:', err);
    return {
      ok: false,
      conflict: false,
      error: 'No hay conexión con el servidor. Revisa tu internet e intenta de nuevo.',
    };
  }
}

/**
 * Suscripcion Realtime a nuevos `INSERT` en `public.registros`.
 * Devuelve una funcion para cerrar el canal al salir de la pagina.
 */
export function subscribeRemote(onInsert: (item: RemoteItem) => void): () => void {
  const client = getClient();
  if (!client) return () => {};

  const channel = client
    .channel('mural-registros-live')
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: TABLE },
      (payload) => {
        const item = rowToItem((payload.new ?? {}) as Partial<RegistroRow>);
        if (item) onInsert(item);
      }
    )
    .subscribe();

  return () => {
    void client.removeChannel(channel);
  };
}
