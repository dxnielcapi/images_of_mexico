/**
 * Esquema de los datos de cada registro: una persona.
 *
 * Aqui viven los campos, la escala de como se siente cada quien con su
 * alimentacion, las preguntas de opcion y la generacion al azar. Quien decide
 * la zona y el valor de alguien es el mapeo (`@data/mapping`), no este
 * archivo: asi cambiar la regla no obliga a tocar el esquema, y cambiar el
 * esquema no obliga a tocar la regla.
 *
 * El mural nacio preguntando por el estado de animo y hoy pregunta por la
 * alimentacion: el campo se llama `alimentacion` y la escala `SENTIRES`. Lo
 * guardado con el nombre anterior (`estado_animo`) se sigue leyendo —ver
 * `personFromExtra` y `ALIAS_HEREDADOS`— porque el dato de origen de un
 * registro ya dado de alta no se puede recuperar de ningun otro lado.
 */
import { mulberry32, hashString } from '@core/sampling/prng';
import { generateId, parseId, todayCompact } from '@core/ids/idCodec';
import type { DataRecord } from '@core/types';

export const PERSON_FIELDS = [
  { key: 'nombre', label: 'Nombre' },
  { key: 'edad', label: 'Edad' },
  { key: 'ocupacion', label: 'Ocupación' },
  { key: 'lugar_origen', label: 'Lugar de origen' },
  { key: 'alimentacion', label: 'Cómo se siente con su alimentación' },
  { key: 'prefiere', label: 'Qué prefiere comer' },
  { key: 'merece_digna', label: 'Merece una alimentación digna' },
  { key: 'oportunidades_justas', label: 'Las oportunidades son justas' },
  { key: 'perdida_soberania', label: 'Por qué se perdieron los alimentos soberanos' },
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

// ------------------------------------------------- como te sientes con tu alimentacion

/** Un punto de la escala: como se siente alguien con lo que come. */
export interface Sentir {
  /** La respuesta tal como se guarda y se muestra. */
  name: string;
  /** Valor base en [0,1] que alimenta el mapa de calor. */
  valor: number;
  /** Frases coherentes con ese sentir, para el campo "que te gustaria decir". */
  frases: string[];
}

/**
 * La escala, de "nada bien" a "muy bien", en nueve pasos.
 *
 * Son nueve y no cinco porque la rampa de pigmentos los distingue: con cinco,
 * el mural pierde la mitad de sus tonos. Van de mayor a menor valor —el orden
 * en que se pintan los botones del alta y la leyenda de la pagina— y los
 * valores son los mismos nueve de la escala de animos que habia antes, asi
 * que lo ya registrado no cambia de color al pasar al nuevo esquema.
 */
export const SENTIRES: Sentir[] = [
  {
    name: 'muy bien',
    valor: 0.96,
    frases: [
      'Como de la milpa y me cae bien',
      'Hoy comí completo y con gusto',
      'En mi casa se cocina todos los días',
      'Lo que como lo sembró alguien que conozco',
    ],
  },
  {
    name: 'bien',
    valor: 0.82,
    frases: [
      'Me alcanza para comer bien',
      'Casi siempre hay verdura en la mesa',
      'Cocino yo y eso ya es ganancia',
      'No me falta lo básico',
    ],
  },
  {
    name: 'casi bien',
    valor: 0.7,
    frases: [
      'Podría comer mejor, pero no me quejo',
      'Unos días sí, otros de prisa',
      'Me gustaría tener más tiempo para cocinar',
      'Trato de que haya algo fresco',
    ],
  },
  {
    name: 'más o menos',
    valor: 0.56,
    frases: [
      'Como lo que se puede',
      'A veces me salto una comida',
      'Depende de cómo venga la semana',
      'Lleno el estómago, no sé si me alimento',
    ],
  },
  {
    name: 'ni bien ni mal',
    valor: 0.45,
    frases: [
      'No me fijo mucho en lo que como',
      'Es lo de siempre',
      'Ni bueno ni malo, solo comida',
      'Como para aguantar el día',
    ],
  },
  {
    name: 'algo mal',
    valor: 0.34,
    frases: [
      'Casi todo viene en paquete',
      'La verdura está cara',
      'Como rápido y de pie',
      'Me falta algo y no sé qué',
    ],
  },
  {
    name: 'mal',
    valor: 0.24,
    frases: [
      'Casi no comemos nada fresco',
      'Lo barato es lo procesado',
      'Un día sí y otro no',
      'Me duele el estómago seguido',
    ],
  },
  {
    name: 'muy mal',
    valor: 0.17,
    frases: [
      'No siempre hay para la comida',
      'Comemos lo que haya',
      'Mis hijos comen antes que yo',
      'Hace mucho que no veo fruta en la mesa',
    ],
  },
  {
    name: 'nada bien',
    valor: 0.08,
    frases: [
      'Hay días en que no como',
      'No alcanza y no hay de dónde',
      'Lo que llega es lo que regalan',
      'Nadie debería comer así',
    ],
  },
];

/**
 * La escala de animos anterior, punto por punto. Los nueve animos tenian los
 * mismos nueve valores, asi que la equivalencia es exacta: un registro viejo
 * se lee con la escala nueva y pinta igual que siempre.
 */
const ALIAS_HEREDADOS: Record<string, string> = {
  radiante: 'muy bien',
  contento: 'bien',
  esperanzado: 'casi bien',
  tranquilo: 'más o menos',
  pensativo: 'ni bien ni mal',
  nostalgico: 'algo mal',
  nostálgico: 'algo mal',
  cansado: 'mal',
  inquieto: 'muy mal',
  triste: 'nada bien',
};

/** Para comparar respuestas: sin acentos, en minusculas, sin espacios de mas. */
function clave(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

const POR_CLAVE = new Map<string, Sentir>(SENTIRES.map((s) => [clave(s.name), s]));

/**
 * El punto de la escala que le corresponde a una respuesta. Acepta los nombres
 * de la escala vigente, los de la anterior, y cualquiera de los dos escrito
 * sin acentos (un CSV editado a mano).
 */
export function sentirByName(name: string): Sentir | null {
  const k = clave(name);
  return POR_CLAVE.get(k) ?? POR_CLAVE.get(clave(ALIAS_HEREDADOS[k] ?? '')) ?? null;
}

/**
 * Valor numerico de un registro a partir de como se siente con su
 * alimentacion, con un jitter determinista derivado de la semilla (asi dos
 * "bien" no pintan igual).
 *
 * El prefijo `animo|` de la semilla se queda como esta a proposito: no es una
 * etiqueta que se lea en ningun lado, es lo que hace que el jitter de cada
 * registro sea el mismo de siempre. Cambiarlo repintaria el mural entero sin
 * que ningun dato hubiera cambiado.
 */
export function valorForSentir(sentir: string, seed: string): number {
  const s = sentirByName(sentir);
  if (!s) return 0.5;
  const jitter = (mulberry32(hashString(`animo|${seed}`))() - 0.5) * 0.1;
  return Math.round(Math.min(1, Math.max(0, s.valor + jitter)) * 1000) / 1000;
}

// ---------------------------------------------------------------- preguntas de opcion

/** Una pregunta de opcion del alta: un toque y queda respondida. */
export interface Pregunta {
  key: PersonFieldKey;
  /** La pregunta como se le muestra a la persona. */
  pregunta: string;
  /** Las opciones: `valor` es lo que se guarda, `etiqueta` lo que se lee. */
  opciones: { valor: string; etiqueta: string }[];
}

const SI_NO = [
  { valor: 'sí', etiqueta: 'Sí' },
  { valor: 'no', etiqueta: 'No' },
];

/**
 * Las cuatro preguntas que acompanan a la escala.
 *
 * No son relleno de formulario: son las dimensiones con las que va a trabajar
 * el mapeo cuando deje de repartir por zonas. Por eso lo que se guarda es un
 * token corto y estable (`superprocesado`, `cadenas grandes`) y no la etiqueta
 * larga: la etiqueta se puede reescribir sin invalidar lo ya registrado.
 */
export const PREGUNTAS: Pregunta[] = [
  {
    key: 'prefiere',
    pregunta: '¿Qué prefieres comer?',
    opciones: [
      { valor: 'comida mexicana', etiqueta: 'Comida completamente mexicana' },
      { valor: 'superprocesado', etiqueta: 'Algún producto superprocesado' },
    ],
  },
  {
    key: 'merece_digna',
    pregunta: '¿Crees que mereces una alimentación digna?',
    opciones: SI_NO,
  },
  {
    key: 'oportunidades_justas',
    pregunta: '¿Crees que son justas las oportunidades alimenticias para los mexicanos?',
    opciones: SI_NO,
  },
  {
    key: 'perdida_soberania',
    pregunta: '¿Por qué crees que se han perdido los alimentos soberanos de México?',
    opciones: [
      { valor: 'gobernantes', etiqueta: 'Por los gobernantes' },
      { valor: 'cadenas grandes', etiqueta: 'Por las cadenas grandes' },
      { valor: 'al pueblo ya no le interesa', etiqueta: 'Al pueblo ya no le interesa' },
    ],
  },
];


/** La fecha de hoy en YYYY-MM-DD, que es como la guarda el registro. */
export function todayIso(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Persona vacia, para inicializar el formulario de registro. */
export function emptyPerson(): Person {
  return {
    nombre: '', edad: '', ocupacion: '', lugar_origen: '',
    alimentacion: SENTIRES[3].name,
    prefiere: '', merece_digna: '', oportunidades_justas: '', perdida_soberania: '',
    mensaje: '', fecha: todayIso(),
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

  next(fecha: string): string {
    const f = fecha.replace(/-/g, '') || todayCompact();
    let id: string;
    do {
      this.seq++;
      id = generateId({ categoria: PERSON_CATEGORY, fecha: f, registro: this.seq });
    } while (this.taken.has(id));
    this.taken.add(id);
    return id;
  }
}

/** Campos de la persona como columnas, para guardar y para el tooltip. */
export function personToExtra(p: Person): Record<string, string> {
  const extra: Record<string, string> = {};
  for (const k of PERSON_FIELD_KEYS) if (p[k]) extra[k] = p[k];
  return extra;
}

/**
 * Reconstruye la persona desde las columnas de un registro. Es lo que permite
 * remapear algo ya guardado: el dato de origen nunca se pierde en el camino.
 */
export function personFromExtra(extra: Record<string, string>): Person {
  const p = emptyPerson();
  for (const k of PERSON_FIELD_KEYS) {
    const v = extra[k];
    if (v) p[k] = v;
  }
  // Lo registrado antes del cambio de pregunta guarda la respuesta en
  // `estado_animo`. Se pregunta por el `extra` y no por `p.alimentacion`,
  // porque `emptyPerson` ya dejo un punto de la escala puesto para el
  // formulario: mirando la persona, la respuesta heredada nunca entraria y el
  // registro se repintaria con el valor del medio en vez del suyo.
  if (!extra['alimentacion'] && extra['estado_animo']) p.alimentacion = extra['estado_animo'];
  return p;
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
