/**
 * Validación, sanitización y rate limiting del formulario de registro.
 *
 * Centraliza las defensas contra registros basura, ubicaciones fuera de
 * México, envíos automatizados y abuso por volumen:
 *
 * - Validación estricta del esquema (`validarPersona`): longitudes máximas,
 *   caracteres de control, detección de URLs/spam, edad entera válida,
 *   ubicación exclusiva de México y respuestas dentro del catálogo permitido.
 * - Ventana de fechas aceptables (`LIMITES_FECHA`, `fechaValida`,
 *   `diaDeFecha`): la fecha de un registro no es solo un formato, es el largo
 *   de la película de `/timelapse`, y por eso se acota aquí y no en la página.
 * - Moderación del texto libre (`MODERACION`, `moderarTexto`): lo que se
 *   escribe se lee en una pantalla pública y hoy no hay forma de borrarlo, así
 *   que el filtro corre antes de guardar.
 * - Forma de los campos de caché del mapeo (`zonaSegura`, `valorSeguro`) para
 *   lo que vuelve de una tabla compartida.
 * - Rate limit multi-ventana en el navegador (`verificarRateLimit` /
 *   `registrarEnvio`): enfriamiento entre envíos, límite de ráfaga y tope
 *   diario, persistidos en localStorage + sessionStorage con respaldo en
 *   memoria.
 * - Detección de duplicados recientes (`esDuplicadoReciente`) y tiempo mínimo
 *   de llenado para frenar bots simples.
 *
 * Nota de arquitectura: cuando se conecte una base de datos o endpoint propio,
 * `validarPersona` puede ejecutarse tal cual en el servidor y las constantes
 * de `RATE_LIMIT_CONFIG` sirven como referencia para el rate limit por IP.
 * Nada de este módulo toca el DOM: `/timelapse` importa la ventana de fechas
 * desde aquí en vez de tener su propia idea de qué fecha es creíble.
 */
import { PREGUNTAS, sentirByName, type Person, type PersonFieldKey } from './person';
import { MENSAJE_SOLO_MEXICO, OPCION_EXTERNO, normalizarEstadoMexico } from './mexico';

// ---------------------------------------------------------------- límites y reglas

export const LIMITES_TEXTO = {
  nombreMin: 2,
  nombreMax: 80,
  ocupacionMax: 80,
  mensajeMax: 280,
  edadMin: 1,
  edadMax: 120,
} as const;

/**
 * La ventana de fechas que el mural acepta como fecha de registro.
 *
 * No es una regla de formato: es el largo de la película. `/timelapse` mide de
 * la fecha más vieja a la más nueva, así que un solo registro fechado en 1800
 * convierte la película en dos siglos y aplasta todo lo real en su último
 * tramo. Noventa años atrás cubre a cualquiera que pueda estar escribiendo en
 * el kiosco; un día hacia adelante es el reloj del dispositivo, que puede ir
 * corrido o estar en otra zona horaria.
 */
export const LIMITES_FECHA = {
  anosAtras: 90,
  diasAdelante: 1,
} as const;

export const RATE_LIMIT_CONFIG = {
  /** Espera mínima entre dos registros consecutivos del mismo navegador. */
  cooldownMs: 30_000,
  /** Ventana corta (ráfaga): máximo de registros en 10 minutos. */
  ventanaCortaMs: 10 * 60_000,
  maxVentanaCorta: 3,
  /** Ventana larga: máximo de registros en 24 horas por navegador. */
  ventanaLargaMs: 24 * 60 * 60_000,
  maxVentanaLarga: 10,
  /** Tiempo mínimo razonable para completar las 5 pantallas (anti-bot). */
  tiempoMinimoLlenadoMs: 4_000,
  /** Ventana para bloquear registros idénticos consecutivos. */
  ventanaDuplicadoMs: 30 * 60_000,
} as const;

/**
 * Parámetros de moderación del texto libre.
 *
 * El mensaje, el nombre y la ocupación se leen en una pantalla pública, y hoy
 * lo que entró no se puede quitar desde el navegador (la tabla no permite
 * DELETE), así que el único momento para filtrar es antes de guardar. Es un
 * filtro de cortesía, no una muralla: quien quiera pasarlo lo pasa escribiendo
 * raro, y moderar de verdad sigue necesitando a una persona y una forma de
 * bajar un registro. Lo que sí evita es lo que de verdad pasa en un kiosco:
 * alguien probando groserías porque la caja está ahí.
 *
 * Todo lo de aquí es perilla: subir un número o vaciar una lista no obliga a
 * tocar el formulario ni la validación.
 */
export const MODERACION = {
  /**
   * Insultos y slurs: van dirigidos a alguien y nunca entran al mural.
   *
   * La lista es corta a propósito. No están las palabras que en un mural de
   * comida mexicana son palabra común y no grosería —`panocha` es un dulce,
   * `negro` es el color del mole y del frijol, `puerco` es un animal—, ni los
   * animales que aparecen en un testimonio del campo (`zorra`, `perra`), ni
   * `retrasado`, que casi siempre llega en «voy retrasado». Un filtro que
   * rechaza testimonios sinceros hace más daño que la grosería que ataja.
   */
  insultos: [
    'pendejo', 'pendeja', 'pendejada',
    'culero', 'culera',
    'puto', 'puta',
    'joto', 'maricon', 'marica',
    'naco', 'naca',
    'mamon', 'mamona',
    'imbecil', 'idiota', 'estupido', 'estupida', 'tarado', 'tarada',
    'hijo de puta', 'hija de puta', 'hijo de la chingada',
    'chinga tu madre', 'chinga a tu madre', 'chingue su madre',
    'chingada madre', 'vete a la chingada',
    'muerete', 'matate',
  ],

  /**
   * Groserías de énfasis, no de ataque.
   *
   * Aquí es donde el mural tiene que elegir: «pinche gobierno» y «se perdió un
   * chingo de maíz» son testimonio sincero sobre soberanía alimentaria dicho
   * como se dice en la calle, y `chingón` es incluso un elogio. Con
   * `bloquearVulgares` en true no entran; en false pasan y se siguen filtrando
   * los insultos. Esa es la perilla que conviene mover según dónde esté el
   * kiosco, no la lista de arriba.
   */
  vulgares: [
    'pinche', 'cabron', 'cabrona',
    'chingar', 'chingas', 'chingue', 'chinguen', 'chingado', 'chingada',
    'chingadera', 'chingon', 'chingo',
    'verga', 'culo', 'mierda', 'joder', 'carajo',
  ],

  /** False deja pasar `vulgares` y filtra solo `insultos`. */
  bloquearVulgares: true,

  /** Desde cuántos caracteres se mide el grito, y cuánta mayúscula se tolera. */
  minLargoGrito: 12,
  maxMayusculas: 0.6,

  /**
   * Un grito no se rechaza: se baja a minúsculas.
   *
   * Mucha gente escribe TODO EN MAYÚSCULAS, y en un kiosco suele ser quien más
   * trabajo le costó escribir. Rechazarlo pierde el testimonio; bajarle el
   * volumen lo conserva entero.
   */
  suavizarGrito: true,

  /** Más dígitos seguidos que esto es un teléfono o un folio, no un mensaje. */
  maxDigitosSeguidos: 6,
  /** Signos seguidos: «!!!!!!!» o un muro de símbolos. */
  maxSignosSeguidos: 4,
  /** Proporción mínima de letras sobre lo que no es espacio. */
  minLetras: 0.4,
  /** Desde qué largo se mide esa proporción (abajo de eso, «¡sí!» es válido). */
  minLargoLetras: 12,
  /** Tope de emoji en un mensaje. */
  maxEmoji: 6,
} as const;

/** Caracteres de control, zero-width y bidi override que no pertenecen a texto normal. */
const CTRL_Y_OCULTOS = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;

/** Detecta enlaces o dominios típicos de spam. */
const PATRON_URL = /(?:https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|net|org|mx|io|co|xyz|ru|cn|info|biz|me|ly|gg|tv)\b)/i;

/** Detecta relleno basura con el mismo carácter repetido 6+ veces seguidas. */
const PATRON_REPETICION = /(.)\1{5,}/u;

/** Al menos una letra (incluyendo acentos y ñ). */
const TIENE_LETRA = /\p{L}/u;

/** Prefijos de fórmula que en hojas de cálculo (CSV) pueden interpretarse como comando. */
const PREFIJO_FORMULA = /^[=+\-@\t\r]/;

const OPCIONES_VALIDAS = new Map<PersonFieldKey, Set<string>>(
  PREGUNTAS.map((q) => [q.key, new Set(q.opciones.map((o) => o.valor))])
);

/** Limpia caracteres de control/invisibles, normaliza espacios y recorta al límite. */
export function limpiarTexto(valor: string, maxLen: number): string {
  return valor
    .replace(CTRL_Y_OCULTOS, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

/** Verifica si un texto contiene patrones típicos de spam o basura. */
function detectarSpamTexto(texto: string): string | null {
  if (!texto) return null;
  if (PATRON_URL.test(texto)) return 'No se permiten enlaces ni direcciones web.';
  if (PATRON_REPETICION.test(texto)) return 'El texto parece repetitivo o inválido.';
  if (PREFIJO_FORMULA.test(texto)) return 'El texto no puede empezar con símbolos de fórmula (=, +, -, @).';
  return null;
}

// ---------------------------------------------------------------- fechas

const DIA_MS = 86_400_000;

/**
 * La ventana de días que el mural considera una fecha de registro, en días
 * desde la época (la unidad con la que trabaja el reloj de `/timelapse`).
 */
export function ventanaDias(ahora = new Date()): { min: number; max: number } {
  const a = ahora.getUTCFullYear();
  const m = ahora.getUTCMonth();
  const d = ahora.getUTCDate();
  const hoy = Math.floor(Date.UTC(a, m, d) / DIA_MS);
  const atras = Math.floor(Date.UTC(a - LIMITES_FECHA.anosAtras, m, d) / DIA_MS);
  return { min: atras, max: hoy + LIMITES_FECHA.diasAdelante };
}

/**
 * Un día del calendario en días desde la época, o `null` si el mural no lo
 * acepta: fecha inexistente (31 de febrero), año de dos cifras, fuera de la
 * ventana de `LIMITES_FECHA`.
 *
 * Devolver `null` y no una fecha corregida es a propósito: quien llama sabe
 * qué hacer con un registro sin fecha —`/timelapse` lo mete al principio, el
 * alta lo rechaza— y ninguna de las dos quiere una fecha inventada.
 */
export function diaDeFecha(ano: number, mes: number, dia: number, ahora = new Date()): number | null {
  if (!Number.isInteger(ano) || !Number.isInteger(mes) || !Number.isInteger(dia)) return null;
  if (ano < 100 || mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const ms = Date.UTC(ano, mes - 1, dia);
  if (!Number.isFinite(ms)) return null;
  // El 31 de febrero se desborda a marzo: si la fecha no vuelve igual, no existe.
  const vuelta = new Date(ms);
  if (vuelta.getUTCFullYear() !== ano || vuelta.getUTCMonth() !== mes - 1 || vuelta.getUTCDate() !== dia) {
    return null;
  }
  const dias = ms / DIA_MS;
  const { min, max } = ventanaDias(ahora);
  return dias >= min && dias <= max ? dias : null;
}

/** La fecha `YYYY-MM-DD` si el mural la acepta, o `''` si no. */
export function fechaValida(valor: string, ahora = new Date()): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((valor ?? '').trim());
  if (!m) return '';
  return diaDeFecha(+m[1], +m[2], +m[3], ahora) === null ? '' : `${m[1]}-${m[2]}-${m[3]}`;
}

/** Mensaje único cuando una fecha cae fuera de la ventana. */
export const MENSAJE_FECHA = `La fecha del registro tiene que ser real y de los últimos ${LIMITES_FECHA.anosAtras} años.`;

// ---------------------------------------------------------------- moderación

/** Equivalencias de «escritura rara» más comunes que una lista no debería perderse. */
const LEET: Record<string, string> = {
  '0': 'o', '1': 'i', '!': 'i', '3': 'e', '4': 'a', '@': 'a', '5': 's', '$': 's', '7': 't',
};

/**
 * Texto listo para comparar contra las listas: sin acentos, en minúsculas, con
 * la escritura rara más común deshecha y las letras repetidas colapsadas
 * («peeendejo» y «p3nd3jo» llegan como «pendejo»).
 *
 * Quita acentos antes de comparar, así que la clave es ASCII y `\b` alcanza
 * para marcar palabra completa: nada de lookbehind, que en el Safari de un
 * iPad viejo rompería el módulo al cargarlo.
 */
function claveModeracion(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[01!34@5$7]/g, (c) => LEET[c] ?? c)
    .replace(/([a-z])\1{2,}/g, '$1');
}

/** Arma el patrón de una lista: palabra completa, plural opcional, separadores adentro. */
function patronDe(terminos: readonly string[]): RegExp | null {
  if (terminos.length === 0) return null;
  const partes = terminos.map((t) =>
    t
      .split(/\s+/)
      .map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
      .join('[\\s_.-]*')
  );
  return new RegExp(`\\b(?:${partes.join('|')})(?:e?s)?\\b`);
}

const PATRON_INSULTOS = patronDe(MODERACION.insultos);
const PATRON_VULGARES = patronDe(MODERACION.vulgares);

/** Teléfonos y correos: una caja pública no es el lugar para dejar contacto. */
const PATRON_CORREO = /[\w.+-]+@[a-z0-9-]{2,}/i;
const PATRON_TELEFONO = new RegExp(`\\d(?:[\\s.()\\-]?\\d){${MODERACION.maxDigitosSeguidos},}`);
const PATRON_SIGNOS = new RegExp(`[^\\p{L}\\p{N}\\s]{${MODERACION.maxSignosSeguidos + 1},}`, 'u');
const PATRON_EMOJI = /\p{Extended_Pictographic}/gu;

/** True si el texto trae una palabra de las listas activas. */
function tienePalabraBloqueada(texto: string): boolean {
  const clave = claveModeracion(texto);
  if (PATRON_INSULTOS?.test(clave)) return true;
  return MODERACION.bloquearVulgares && Boolean(PATRON_VULGARES?.test(clave));
}

/** Baja un grito a minúsculas y le devuelve las iniciales: se conserva lo dicho, no el volumen. */
function suavizarGrito(texto: string): string {
  if (!MODERACION.suavizarGrito || texto.length < MODERACION.minLargoGrito) return texto;
  const letras = texto.match(/\p{L}/gu);
  if (!letras || letras.length === 0) return texto;
  const mayusculas = letras.filter((c) => c !== c.toLocaleLowerCase('es-MX')).length;
  if (mayusculas / letras.length <= MODERACION.maxMayusculas) return texto;
  return texto
    .toLocaleLowerCase('es-MX')
    .replace(/(^|[.!?]\s+|[¡¿])(\p{Ll})/gu, (_m, antes: string, letra: string) =>
      antes + letra.toLocaleUpperCase('es-MX')
    );
}

export type ResultadoTexto =
  | { ok: true; texto: string }
  | { ok: false; error: string };

/**
 * Pasa un texto libre por la moderación completa. Devuelve el texto como va a
 * quedar en el mural (puede venir con el grito bajado) o el motivo por el que
 * no entra.
 *
 * Con `estructura` —el caso del mensaje— incluye el anti-spam de
 * `detectarSpamTexto`, así es una sola puerta: el formulario puede revisar el
 * paso del mensaje con esto solo y el aviso sale con el texto todavía a la
 * vista. En false queda solo el filtro de palabras, que es lo que corresponde
 * al nombre y a la ocupación: ahí contar dígitos o emoji no dice nada, y el
 * anti-spam ya corre por su cuenta.
 */
export function moderarTexto(texto: string, estructura = true): ResultadoTexto {
  if (!texto) return { ok: true, texto };

  if (tienePalabraBloqueada(texto)) {
    return { ok: false, error: 'Ese texto no entra al mural: queda a la vista de todos, escríbelo sin groserías.' };
  }

  if (estructura) {
    const spam = detectarSpamTexto(texto);
    if (spam) return { ok: false, error: spam };
    if (PATRON_CORREO.test(texto) || PATRON_TELEFONO.test(texto)) {
      return { ok: false, error: 'No escribas teléfonos, correos ni datos de contacto.' };
    }
    // El emoji va antes que los signos: un muro de emoji también es una tira de
    // caracteres que no son letra, y el aviso tiene que decir lo que pasa.
    if ((texto.match(PATRON_EMOJI) ?? []).length > MODERACION.maxEmoji) {
      return { ok: false, error: `Deja tu mensaje con ${MODERACION.maxEmoji} emoji o menos.` };
    }
    if (PATRON_SIGNOS.test(texto)) {
      return { ok: false, error: 'Quita los signos de más para que se pueda leer.' };
    }
    const cuerpo = texto.replace(/\s/g, '');
    const letras = (texto.match(/\p{L}/gu) ?? []).length;
    if (cuerpo.length >= MODERACION.minLargoLetras && letras / cuerpo.length < MODERACION.minLetras) {
      return { ok: false, error: 'Escribe tu mensaje con palabras.' };
    }
  }

  return { ok: true, texto: suavizarGrito(texto) };
}

// ---------------------------------------------------------------- caché del mapeo

/** Tope de largo de un nombre de zona: «zona_07» y los que declare el dibujo. */
const ZONA_MAX = 64;
const ZONA_FORMA = /^[\p{L}\p{N}][\p{L}\p{N} ._-]*$/u;

/**
 * El nombre de zona si tiene forma de nombre de zona, o `''` si no.
 *
 * `zona` y `valor` son caché del mapeo, no dato de origen: una fila ajena con
 * la zona inventada no mueve a nadie de lugar, porque `remapAll` recalcula
 * todo lo que no pertenezca al dibujo de hoy. Lo que se corta aquí es la forma
 * —largo y caracteres—, no la pertenencia: quién sabe qué zonas existen es el
 * mapeo, y devolver `''` es justamente pedirle que la recalcule.
 */
export function zonaSegura(valor: unknown): string {
  if (typeof valor !== 'string') return '';
  const limpio = valor.replace(CTRL_Y_OCULTOS, '').trim();
  if (!limpio || limpio.length > ZONA_MAX || !ZONA_FORMA.test(limpio)) return '';
  return limpio;
}

/** El valor del mapa de calor acotado a [0,1]; cualquier otra cosa cae al medio. */
export function valorSeguro(valor: unknown): number {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return 0.5;
  return Math.min(1, Math.max(0, valor));
}

export type ResultadoValidacion =
  | { ok: true; persona: Person }
  | { ok: false; error: string; campo?: PersonFieldKey };

/**
 * Valida y normaliza una persona completa antes de registrarla en el mural.
 * Garantiza que la ubicación sea de México, que la fecha sea creíble, que el
 * texto libre pase la moderación y que ningún campo contenga basura ni valores
 * fuera de catálogo.
 */
export function validarPersona(entrada: Person): ResultadoValidacion {
  const nombre = limpiarTexto(entrada.nombre ?? '', LIMITES_TEXTO.nombreMax);
  if (!nombre) return { ok: false, campo: 'nombre', error: 'Nos falta tu nombre.' };
  if (nombre.length < LIMITES_TEXTO.nombreMin || !TIENE_LETRA.test(nombre)) {
    return { ok: false, campo: 'nombre', error: 'Escribe un nombre válido (al menos 2 letras).' };
  }
  const spamNombre = detectarSpamTexto(nombre);
  if (spamNombre) return { ok: false, campo: 'nombre', error: spamNombre };
  const modNombre = moderarTexto(nombre, false);
  if (!modNombre.ok) return { ok: false, campo: 'nombre', error: modNombre.error };

  const edadRaw = (entrada.edad ?? '').trim();
  let edad = '';
  if (edadRaw) {
    if (!/^\d{1,3}$/.test(edadRaw)) {
      return { ok: false, campo: 'edad', error: 'La edad tiene que ser un número entero entre 1 y 120.' };
    }
    const n = Number(edadRaw);
    if (!Number.isInteger(n) || n < LIMITES_TEXTO.edadMin || n > LIMITES_TEXTO.edadMax) {
      return { ok: false, campo: 'edad', error: 'La edad tiene que ser un número entre 1 y 120.' };
    }
    edad = String(n);
  }

  const ocupacion = limpiarTexto(entrada.ocupacion ?? '', LIMITES_TEXTO.ocupacionMax);
  const spamOcupacion = detectarSpamTexto(ocupacion);
  if (spamOcupacion) return { ok: false, campo: 'ocupacion', error: spamOcupacion };
  const modOcupacion = moderarTexto(ocupacion, false);
  if (!modOcupacion.ok) return { ok: false, campo: 'ocupacion', error: modOcupacion.error };

  const origenRaw = (entrada.lugar_origen ?? '').trim();
  if (!origenRaw) {
    return { ok: false, campo: 'lugar_origen', error: 'Elige de qué estado de México eres.' };
  }
  if (origenRaw === OPCION_EXTERNO) {
    return { ok: false, campo: 'lugar_origen', error: MENSAJE_SOLO_MEXICO };
  }
  const estadoMexico = normalizarEstadoMexico(origenRaw);
  if (!estadoMexico) {
    return { ok: false, campo: 'lugar_origen', error: MENSAJE_SOLO_MEXICO };
  }

  const sentir = sentirByName(entrada.alimentacion ?? '');
  if (!sentir) {
    return { ok: false, campo: 'alimentacion', error: 'Elige cómo te sientes con tu alimentación.' };
  }

  const respuestas: Partial<Person> = {};
  for (const q of PREGUNTAS) {
    const val = (entrada[q.key] ?? '').trim();
    const permitidas = OPCIONES_VALIDAS.get(q.key);
    if (!val || !permitidas?.has(val)) {
      return { ok: false, campo: q.key, error: 'Falta contestar alguna de las preguntas de opción.' };
    }
    respuestas[q.key] = val;
  }

  // `moderarTexto` con estructura ya trae adentro el anti-spam del mensaje.
  const mensaje = limpiarTexto(entrada.mensaje ?? '', LIMITES_TEXTO.mensajeMax);
  const modMensaje = moderarTexto(mensaje);
  if (!modMensaje.ok) return { ok: false, campo: 'mensaje', error: modMensaje.error };

  // La fecha se rechaza en vez de vaciarse: el alta siempre manda la de hoy,
  // así que una fuera de la ventana no es un campo flojo sino un registro
  // armado a mano, y el que estira la película de `/timelapse` para todos.
  const fechaRaw = (entrada.fecha ?? '').trim();
  const fecha = fechaValida(fechaRaw);
  if (fechaRaw && !fecha) {
    return { ok: false, campo: 'fecha', error: MENSAJE_FECHA };
  }

  return {
    ok: true,
    persona: {
      nombre,
      edad,
      ocupacion,
      lugar_origen: estadoMexico,
      alimentacion: sentir.name,
      prefiere: respuestas.prefiere ?? '',
      merece_digna: respuestas.merece_digna ?? '',
      oportunidades_justas: respuestas.oportunidades_justas ?? '',
      perdida_soberania: respuestas.perdida_soberania ?? '',
      mensaje: modMensaje.texto,
      fecha,
    },
  };
}

// ---------------------------------------------------------------- rate limit

const RL_STORAGE_KEY = 'mural.rl.v1';

interface EstadoRateLimit {
  /** Timestamps (ms) de envíos recientes. */
  envios: number[];
  /** Huellas de registros recientes para evitar duplicados inmediatos. */
  huellas: { hash: string; ts: number }[];
}

/** Respaldo en memoria por si localStorage/sessionStorage no están disponibles. */
let memoriaRl: EstadoRateLimit = { envios: [], huellas: [] };

function leerStorage(storage: Storage | undefined): EstadoRateLimit | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(RL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<EstadoRateLimit>;
    const envios = Array.isArray(parsed.envios)
      ? parsed.envios.filter((t): t is number => typeof t === 'number' && Number.isFinite(t))
      : [];
    const huellas = Array.isArray(parsed.huellas)
      ? parsed.huellas.filter(
          (h): h is { hash: string; ts: number } =>
            Boolean(h) && typeof h.hash === 'string' && typeof h.ts === 'number' && Number.isFinite(h.ts)
        )
      : [];
    return { envios, huellas };
  } catch {
    return null;
  }
}

function leerEstado(ahora: number): EstadoRateLimit {
  const desde = ahora - RATE_LIMIT_CONFIG.ventanaLargaMs;
  const desdeDup = ahora - RATE_LIMIT_CONFIG.ventanaDuplicadoMs;

  const fuentes = [
    memoriaRl,
    leerStorage(typeof localStorage !== 'undefined' ? localStorage : undefined),
    leerStorage(typeof sessionStorage !== 'undefined' ? sessionStorage : undefined),
  ].filter((x): x is EstadoRateLimit => x !== null);

  // Combina todas las fuentes (local + session + memoria) para que limpiar una
  // sola no reinicie el contador en la misma sesión.
  const enviosSet = new Set<number>();
  const huellasMap = new Map<string, number>();

  for (const f of fuentes) {
    for (const ts of f.envios) {
      if (ts >= desde && ts <= ahora + 60_000) enviosSet.add(ts);
    }
    for (const h of f.huellas) {
      if (h.ts >= desdeDup && h.ts <= ahora + 60_000) {
        const prev = huellasMap.get(h.hash) ?? 0;
        if (h.ts > prev) huellasMap.set(h.hash, h.ts);
      }
    }
  }

  const envios = [...enviosSet].sort((a, b) => a - b);
  const huellas = [...huellasMap.entries()].map(([hash, ts]) => ({ hash, ts }));
  memoriaRl = { envios, huellas };
  return memoriaRl;
}

function guardarEstado(estado: EstadoRateLimit): void {
  memoriaRl = estado;
  const serialized = JSON.stringify(estado);
  try {
    localStorage.setItem(RL_STORAGE_KEY, serialized);
  } catch {
    // Modo privado o cuota llena: queda el respaldo en sessionStorage y memoria.
  }
  try {
    sessionStorage.setItem(RL_STORAGE_KEY, serialized);
  } catch {
    // Ignorar si sessionStorage no está disponible.
  }
}

function huellaDe(p: Person): string {
  return [
    p.nombre.toLowerCase().trim(),
    p.lugar_origen.toLowerCase().trim(),
    p.alimentacion.toLowerCase().trim(),
    p.mensaje.toLowerCase().trim(),
  ].join('|');
}

/** Formatea una espera en milisegundos en texto legible en español. */
export function formatearEspera(ms: number): string {
  const seg = Math.max(1, Math.ceil(ms / 1000));
  if (seg < 60) return `${seg} ${seg === 1 ? 'segundo' : 'segundos'}`;
  const min = Math.ceil(seg / 60);
  if (min < 60) return `${min} ${min === 1 ? 'minuto' : 'minutos'}`;
  const hrs = Math.ceil(min / 60);
  return `${hrs} ${hrs === 1 ? 'hora' : 'horas'}`;
}

export type ResultadoRateLimit =
  | { permitido: true }
  | { permitido: false; esperarMs: number; motivo: string };

/** Evalúa si el navegador puede enviar un nuevo registro en este momento. */
export function verificarRateLimit(ahora = Date.now()): ResultadoRateLimit {
  const { envios } = leerEstado(ahora);
  if (envios.length === 0) return { permitido: true };

  // 1. Cooldown entre registros consecutivos.
  const ultimo = envios[envios.length - 1];
  const faltaCooldown = RATE_LIMIT_CONFIG.cooldownMs - (ahora - ultimo);
  if (faltaCooldown > 0) {
    return {
      permitido: false,
      esperarMs: faltaCooldown,
      motivo: `Espera ${formatearEspera(faltaCooldown)} antes de enviar otro registro.`,
    };
  }

  // 2. Ventana corta (ráfaga).
  const recientes = envios.filter((ts) => ahora - ts < RATE_LIMIT_CONFIG.ventanaCortaMs);
  if (recientes.length >= RATE_LIMIT_CONFIG.maxVentanaCorta) {
    const esperarMs = RATE_LIMIT_CONFIG.ventanaCortaMs - (ahora - recientes[0]);
    return {
      permitido: false,
      esperarMs,
      motivo: `Límite temporal de registros alcanzado. Intenta de nuevo en ${formatearEspera(esperarMs)}.`,
    };
  }

  // 3. Ventana larga (tope diario).
  if (envios.length >= RATE_LIMIT_CONFIG.maxVentanaLarga) {
    const esperarMs = RATE_LIMIT_CONFIG.ventanaLargaMs - (ahora - envios[0]);
    return {
      permitido: false,
      esperarMs,
      motivo: `Has alcanzado el máximo de registros diarios desde este navegador. Vuelve en ${formatearEspera(esperarMs)}.`,
    };
  }

  return { permitido: true };
}

/** True si ya se registró exactamente la misma persona en la ventana reciente. */
export function esDuplicadoReciente(persona: Person, ahora = Date.now()): boolean {
  const { huellas } = leerEstado(ahora);
  const hash = huellaDe(persona);
  return huellas.some((h) => h.hash === hash && ahora - h.ts < RATE_LIMIT_CONFIG.ventanaDuplicadoMs);
}

/** Registra un envío exitoso en las ventanas de rate limit y deduplicación. */
export function registrarEnvio(persona: Person, ahora = Date.now()): void {
  const estado = leerEstado(ahora);
  const hash = huellaDe(persona);
  const envios = [...estado.envios, ahora];
  const huellas = [...estado.huellas.filter((h) => h.hash !== hash), { hash, ts: ahora }];
  guardarEstado({ envios, huellas });
}
