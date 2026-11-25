/**
 * Validación, sanitización y rate limiting del formulario de registro.
 *
 * Centraliza las defensas contra registros basura, ubicaciones fuera de
 * México, envíos automatizados y abuso por volumen:
 *
 * - Validación estricta del esquema (`validarPersona`): longitudes máximas,
 *   caracteres de control, detección de URLs/spam, edad entera válida,
 *   ubicación exclusiva de México y respuestas dentro del catálogo permitido.
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

export type ResultadoValidacion =
  | { ok: true; persona: Person }
  | { ok: false; error: string; campo?: PersonFieldKey };

/**
 * Valida y normaliza una persona completa antes de registrarla en el mural.
 * Garantiza que la ubicación sea de México y que ningún campo contenga basura
 * ni valores fuera de catálogo.
 */
export function validarPersona(entrada: Person): ResultadoValidacion {
  const nombre = limpiarTexto(entrada.nombre ?? '', LIMITES_TEXTO.nombreMax);
  if (!nombre) return { ok: false, campo: 'nombre', error: 'Nos falta tu nombre.' };
  if (nombre.length < LIMITES_TEXTO.nombreMin || !TIENE_LETRA.test(nombre)) {
    return { ok: false, campo: 'nombre', error: 'Escribe un nombre válido (al menos 2 letras).' };
  }
  const spamNombre = detectarSpamTexto(nombre);
  if (spamNombre) return { ok: false, campo: 'nombre', error: spamNombre };

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

  const mensaje = limpiarTexto(entrada.mensaje ?? '', LIMITES_TEXTO.mensajeMax);
  const spamMensaje = detectarSpamTexto(mensaje);
  if (spamMensaje) return { ok: false, campo: 'mensaje', error: spamMensaje };

  const fecha = /^\d{4}-\d{2}-\d{2}$/.test(entrada.fecha ?? '') ? entrada.fecha : '';

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
      mensaje,
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
