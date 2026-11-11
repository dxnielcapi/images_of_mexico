/**
 * Esquema de los datos de cada registro: una persona.
 *
 * El heatmap sigue necesitando `zona` y `valor` numerico; el `valor` se deriva
 * del estado de animo (ver `MOODS`), asi el color de la mancha es el animo.
 * Todo lo demas son campos descriptivos que se muestran en el tooltip y en la
 * busqueda, en el orden declarado aqui.
 */
import { mulberry32, hashString, type Rng } from '@core/sampling/prng';
import { generateId, parseId, todayCompact } from '@core/ids/idCodec';
import type { DataRecord } from '@core/types';

export const PERSON_FIELDS = [
  { key: 'nombre', label: 'Nombre' },
  { key: 'edad', label: 'Edad' },
  { key: 'ocupacion', label: 'Ocupación' },
  { key: 'lugar_origen', label: 'Lugar de origen' },
  { key: 'estado_animo', label: 'Estado de ánimo' },
  { key: 'mensaje', label: 'Qué te gustaría decir' },
  { key: 'fecha', label: 'Fecha' },
] as const;

export type PersonFieldKey = (typeof PERSON_FIELDS)[number]['key'];
export type Person = Record<PersonFieldKey, string>;

export const PERSON_FIELD_KEYS = PERSON_FIELDS.map((f) => f.key) as PersonFieldKey[];

const LABELS = new Map<string, string>(PERSON_FIELDS.map((f) => [f.key, f.label]));

/** Etiqueta legible de una columna; las desconocidas se muestran tal cual. */
export function fieldLabel(key: string): string {
  return LABELS.get(key) ?? key.replace(/_/g, ' ');
}

/** True si la columna es uno de los campos del esquema de persona. */
export function isPersonField(key: string): boolean {
  return LABELS.has(key);
}

/** Campo de persona que se usa para buscar e identificar. */
export const NAME_KEY: PersonFieldKey = 'nombre';

/** Categoria que llevan los IDs generados para personas. */
export const PERSON_CATEGORY = 'PERSONA';

// ---------------------------------------------------------------- estados de animo

export interface Mood {
  name: string;
  /** Valor base en [0,1] que alimenta el mapa de calor. */
  valor: number;
  /** Frases coherentes con el animo, para el campo "que te gustaria decir". */
  frases: string[];
}

export const MOODS: Mood[] = [
  {
    name: 'radiante',
    valor: 0.96,
    frases: [
      'Hoy todo florecio al mismo tiempo',
      'Que no se acabe este dia',
      'Vengo cantando desde temprano',
      'La cosecha salio mejor de lo que esperaba',
    ],
  },
  {
    name: 'contento',
    valor: 0.82,
    frases: [
      'Gracias por preguntar, estoy bien',
      'Me gusta como quedo el patio',
      'Comi rico y dormi suficiente',
      'Hoy el trabajo rindio',
    ],
  },
  {
    name: 'esperanzado',
    valor: 0.7,
    frases: [
      'Creo que esta vez si se puede',
      'Voy a volver a intentarlo',
      'Algo bueno se esta armando',
      'Sembre algo que todavia no se ve',
    ],
  },
  {
    name: 'tranquilo',
    valor: 0.56,
    frases: [
      'Sin apuro, paso a paso',
      'Me senti a mirar el agua un rato',
      'Nada que reclamar hoy',
      'Prefiero el silencio de la manana',
    ],
  },
  {
    name: 'pensativo',
    valor: 0.45,
    frases: [
      'Le estoy dando vueltas a una decision',
      'No se si quedarme o irme',
      'Hay cosas que todavia no entiendo',
      'Me acorde de algo que tenia guardado',
    ],
  },
  {
    name: 'nostalgico',
    valor: 0.34,
    frases: [
      'Me acuerdo de la casa de mi abuela',
      'Antes el rio llegaba mas arriba',
      'Me gustaria volver aunque sea un dia',
      'Guardo una foto de cuando eramos todos',
    ],
  },
  {
    name: 'cansado',
    valor: 0.24,
    frases: [
      'Fue una semana larga',
      'Necesito dormir tres dias seguidos',
      'El cuerpo me esta pidiendo pausa',
      'Hice lo que pude y alcanzo',
    ],
  },
  {
    name: 'inquieto',
    valor: 0.17,
    frases: [
      'No me puedo quedar quieto',
      'Algo me tiene con el pecho apretado',
      'Estoy esperando una respuesta',
      'Demasiadas cosas al mismo tiempo',
    ],
  },
  {
    name: 'triste',
    valor: 0.08,
    frases: [
      'Hoy preferiria no hablar mucho',
      'Me hace falta alguien',
      'Se me hizo cuesta arriba el dia',
      'Ya va a pasar, siempre pasa',
    ],
  },
];

export const MOOD_NAMES = MOODS.map((m) => m.name);

export function moodByName(name: string): Mood | null {
  const n = name.trim().toLowerCase();
  return MOODS.find((m) => m.name === n) ?? null;
}

/**
 * Valor numerico de un registro a partir de su animo, con un jitter
 * determinista derivado de la semilla (asi dos "contentos" no pintan igual).
 */
export function valorForMood(mood: string, seed: string): number {
  const m = moodByName(mood);
  if (!m) return 0.5;
  const jitter = (mulberry32(hashString(`animo|${seed}`))() - 0.5) * 0.1;
  return Math.round(Math.min(1, Math.max(0, m.valor + jitter)) * 1000) / 1000;
}

// ---------------------------------------------------------------- catalogos

const NOMBRES = [
  'Ana', 'Lucia', 'Mateo', 'Sofia', 'Ignacio', 'Camila', 'Joaquin', 'Valentina',
  'Tomas', 'Pilar', 'Facundo', 'Rocio', 'Benicio', 'Martina', 'Emilio', 'Renata',
  'Agustin', 'Delfina', 'Ramiro', 'Celeste', 'Bautista', 'Olivia', 'Nicolas',
  'Mirta', 'Horacio', 'Juana', 'Elias', 'Amalia', 'Gaspar', 'Isidora', 'Ruben',
  'Dolores', 'Teo', 'Catalina', 'Simon', 'Antonia', 'Lautaro', 'Mercedes',
];

const APELLIDOS = [
  'Quiroga', 'Alvarez', 'Pereyra', 'Sosa', 'Bustos', 'Ferreyra', 'Ocampo',
  'Zabala', 'Mansilla', 'Carrizo', 'Vera', 'Luna', 'Peralta', 'Ibarra',
  'Moyano', 'Cardozo', 'Barrios', 'Escobar', 'Aguirre', 'Villalba', 'Nunes',
  'Maidana', 'Rolon', 'Cabrera', 'Benitez', 'Solis', 'Arce', 'Gimenez',
];

const OCUPACIONES = [
  'agricultor/a', 'veterinario/a', 'docente rural', 'apicultor/a', 'agronomo/a',
  'tambero/a', 'tractorista', 'enfermero/a', 'almacenero/a', 'tecnico/a en riego',
  'panadero/a', 'carpintero/a', 'viverista', 'camionero/a', 'cocinero/a',
  'estudiante', 'herrero/a', 'contador/a', 'guia de campo', 'modista',
  'jubilado/a', 'mecanico/a', 'bibliotecario/a', 'constructor/a', 'fotografo/a',
  'pescador/a', 'arriero/a', 'radialista',
];

const LUGARES = [
  'Tandil', 'Chivilcoy', 'Villa Dolores', 'Obera', 'San Rafael', 'Cafayate',
  'Esquel', 'Rafaela', 'Gualeguay', 'Chascomus', 'Tilcara', 'Coronel Suarez',
  'Pergamino', 'Cosquin', 'Las Flores', 'Puerto Tirol', 'Trenque Lauquen',
  'Villa Elisa', 'Salsipuedes', 'San Javier', 'Monte Caseros', 'Laborde',
  'Loberia', 'Chepes', 'Dina Huapi', 'Alta Gracia',
];

function pickFrom<T>(rng: Rng, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

/** Fecha aleatoria de los ultimos `dias`, en formato YYYY-MM-DD. */
function randomDate(rng: Rng, ref: Date, dias: number): string {
  const d = new Date(ref.getTime() - Math.floor(rng() * dias) * 86400000);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function todayIso(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export interface RandomPersonOpts {
  /** Fecha fija; si falta, se sortea dentro de los ultimos 30 dias. */
  fecha?: string;
  ref?: Date;
}

/** Genera una persona completa al azar con el Rng dado. */
export function randomPerson(rng: Rng, opts: RandomPersonOpts = {}): Person {
  const mood = pickFrom(rng, MOODS);
  return {
    nombre: `${pickFrom(rng, NOMBRES)} ${pickFrom(rng, APELLIDOS)}`,
    edad: String(16 + Math.floor(rng() * 70)),
    ocupacion: pickFrom(rng, OCUPACIONES),
    lugar_origen: pickFrom(rng, LUGARES),
    estado_animo: mood.name,
    mensaje: pickFrom(rng, mood.frases),
    fecha: opts.fecha ?? randomDate(rng, opts.ref ?? new Date(), 30),
  };
}

/** Persona vacia, para inicializar el formulario de registro. */
export function emptyPerson(): Person {
  return {
    nombre: '', edad: '', ocupacion: '', lugar_origen: '',
    estado_animo: MOODS[3].name, mensaje: '', fecha: todayIso(),
  };
}

// ---------------------------------------------------------------- registros

/**
 * Lleva el contador de `RNNN` de los IDs para que cada persona nueva reciba
 * uno libre, sin pisar los que ya estan en el dataset.
 */
export class PersonIds {
  private seq = 0;
  private taken = new Set<string>();

  /** Recalcula el contador a partir de los registros actuales. */
  sync(records: DataRecord[]): void {
    this.seq = 0;
    this.taken = new Set();
    for (const r of records) {
      this.taken.add(r.id);
      const p = parseId(r.id);
      if (p.wellFormed && isFinite(p.registro)) this.seq = Math.max(this.seq, p.registro);
    }
  }

  next(zona: string, fecha: string): string {
    const f = fecha.replace(/-/g, '') || todayCompact();
    let id: string;
    do {
      this.seq++;
      id = generateId({ zona, categoria: PERSON_CATEGORY, fecha: f, registro: this.seq });
    } while (this.taken.has(id));
    this.taken.add(id);
    return id;
  }
}

/** Convierte una persona en registro del dataset: el animo fija el valor. */
export function personToRecord(p: Person, zona: string, id: string): DataRecord {
  const extra: Record<string, string> = {};
  for (const k of PERSON_FIELD_KEYS) if (p[k]) extra[k] = p[k];
  return { id, zona, valor: valorForMood(p.estado_animo, id), extra };
}

/** Normaliza un nombre para comparar: sin acentos, en minusculas. */
export function normalizeName(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

/**
 * Registros cuyo nombre contiene la consulta, con los que empiezan con ella
 * primero y el resto alfabetico.
 */
export function searchByName(records: DataRecord[], query: string): DataRecord[] {
  const q = normalizeName(query);
  if (!q) return [];
  const nameOf = (r: DataRecord) => normalizeName(r.extra[NAME_KEY] ?? '');
  return records
    .filter((r) => nameOf(r).includes(q))
    .sort((a, b) => {
      const na = nameOf(a), nb = nameOf(b);
      return (na.startsWith(q) ? 0 : 1) - (nb.startsWith(q) ? 0 : 1) || na.localeCompare(nb);
    });
}
