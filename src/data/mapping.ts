/**
 * El mapeo: como una persona se convierte en un registro del mural.
 *
 * Es el unico lugar donde se decide la zona y el valor de alguien. Vive aparte
 * del esquema (`@data/person`) y de la persistencia (`@data/repo/localRepo`)
 * porque es lo que va a cambiar cuando esten delimitados los datos y las zonas
 * definitivas, y el resto del sistema no deberia enterarse.
 *
 * Tres reglas sostienen que ese cambio no genere conflictos:
 *
 * - El ID no dice nada del mapeo: lleva el ambito fijo `REG` (ver
 *   `@core/ids/idCodec`). Remapear a alguien no le cambia la identidad, y por
 *   lo tanto no le mueve la mancha (la posicion sale del hash del id) ni lo
 *   duplica al reimportar una copia (el de-dup tambien es por id).
 * - Lo que se persiste es la persona, no el resultado. `zona` y `valor` se
 *   derivan de ella y se guardan solo como cache, junto a la version del mapeo
 *   que los produjo.
 * - Al cargar, lo guardado con una version vieja se vuelve a mapear con la
 *   regla vigente (`remapAll`). Subir `MAPPING_VERSION` es todo lo que hace
 *   falta para que lo ya registrado se reacomode solo.
 *
 * Regla vigente (version 2): la zona es una region cualquiera del dibujo,
 * sorteada de forma determinista desde el id y en proporcion al espacio que
 * tiene; el valor sale del estado de animo.
 */
import { hashString, mulberry32 } from '@core/sampling/prng';
import type { DataRecord, ZoneMap } from '@core/types';
import {
  PERSON_FIELD_KEYS, personFromExtra, personToExtra, valorForMood, type Person,
} from './person';

/**
 * Version de la regla de mapeo. Subirla al cambiar como se decide la zona o
 * el valor: los registros guardados con una version anterior se remapean al
 * cargarlos.
 */
export const MAPPING_VERSION = 2;

/** Una zona del dibujo y el espacio que tiene para manchas. */
export interface ZonaDisponible {
  nombre: string;
  /** Pixeles donde cabe el centro de una mancha (`Zone.valid`). */
  espacio: number;
}

/** Lo que el mapeo necesita saber del mural para ubicar a alguien. */
export interface MappingContext {
  /**
   * Zonas disponibles en el dibujo. Una lista, no un iterador: el contexto se
   * recorre varias veces por tanda y un `Map.values()` se agotaria en la
   * primera. El orden no influye, se ordena aparte.
   */
  zonas: readonly ZonaDisponible[];
}

/** El contexto que le corresponde al dibujo que esta cargado. */
export function zonasDisponibles(zones: ZoneMap): ZonaDisponible[] {
  return [...zones.values()].map((z) => ({ nombre: z.name, espacio: z.valid.length }));
}

/** Zonas del contexto en orden estable, para que el sorteo no dependa del alta. */
function zonasOrdenadas(ctx: MappingContext): ZonaDisponible[] {
  return [...ctx.zonas].sort((a, b) => (a.nombre < b.nombre ? -1 : a.nombre > b.nombre ? 1 : 0));
}

/**
 * Zona de una persona bajo la regla vigente.
 *
 * Version 2: cualquier region del dibujo, sorteada desde el id con peso
 * proporcional a su espacio. El peso importa porque la plantilla no es un
 * mandala de petalos parejos: el cuerpo de la serpiente es cien veces mas
 * grande que una pluma, y un sorteo uniforme apelmazaria las plumas mientras
 * el cuerpo queda vacio. Repartir por espacio deja la densidad pareja en todo
 * el dibujo, sea cual sea la ilustracion.
 *
 * Es deterministico a proposito —asi la zona se puede recalcular desde lo
 * guardado— y no mira ningun campo de la persona todavia: cuando los datos
 * esten delimitados, este es el cuerpo que cambia.
 */
export function zonaFor(_person: Person, id: string, ctx: MappingContext): string {
  const zonas = zonasOrdenadas(ctx);
  if (zonas.length === 0) return '';
  const rng = mulberry32(hashString(`zona|${id}`));
  const total = zonas.reduce((s, z) => s + Math.max(0, z.espacio), 0);
  // Sin espacio medido (zonas recien creadas, dibujo sin analizar) el sorteo
  // vuelve a ser parejo: siempre hay que devolver una zona.
  if (total <= 0) return zonas[Math.floor(rng() * zonas.length) % zonas.length].nombre;
  let t = rng() * total;
  for (const z of zonas) {
    t -= Math.max(0, z.espacio);
    if (t < 0) return z.nombre;
  }
  return zonas[zonas.length - 1].nombre;
}

/** Valor en [0,1] que pinta la mancha. Version 1: el estado de animo. */
export function valorFor(person: Person, id: string): number {
  return valorForMood(person.estado_animo, id);
}

/**
 * Persona + id -> registro del dataset. Unica puerta de alta.
 * `zona` fuerza una zona (el selector del studio); si falta, la decide el mapeo.
 */
export function mapPerson(person: Person, id: string, ctx: MappingContext, zona?: string): DataRecord {
  return {
    id,
    zona: zona ?? zonaFor(person, id, ctx),
    valor: valorFor(person, id),
    extra: personToExtra(person),
  };
}

/**
 * Vuelve a mapear un registro ya guardado con la regla vigente, conservando su
 * id y sus columnas extra. Si no quedo rastro de la persona en `extra` no hay
 * nada que recalcular y se devuelve igual.
 */
export function remapRecord(rec: DataRecord, ctx: MappingContext): DataRecord {
  const tienePersona = PERSON_FIELD_KEYS.some((k) => rec.extra[k]);
  if (!tienePersona) return rec;
  const person = personFromExtra(rec.extra);
  return {
    id: rec.id,
    zona: zonaFor(person, rec.id, ctx),
    valor: valorFor(person, rec.id),
    extra: rec.extra,
  };
}

/**
 * Pone una tanda guardada al dia con la regla vigente. Remapea en dos casos:
 *
 * - la produjo una version anterior del mapeo, o
 * - su zona ya no existe en el dibujo, porque se re-delimito. Sin esto el
 *   registro se quedaria sin donde pintarse y la persona desapareceria del
 *   mural; asi la regla vigente le busca lugar.
 *
 * `remapped` cuenta los que efectivamente cambiaron, para volver a persistir.
 */
export function remapAll(
  records: DataRecord[],
  mapeo: number,
  ctx: MappingContext
): { records: DataRecord[]; remapped: number } {
  const vigentes = new Set(zonasOrdenadas(ctx).map((z) => z.nombre));
  if (vigentes.size === 0) return { records, remapped: 0 };
  const atrasado = mapeo !== MAPPING_VERSION;
  let remapped = 0;
  const out = records.map((r) => {
    if (!atrasado && vigentes.has(r.zona)) return r;
    const next = remapRecord(r, ctx);
    if (next.zona !== r.zona || next.valor !== r.valor) remapped++;
    return next;
  });
  return { records: out, remapped };
}
