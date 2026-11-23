/**
 * La rama de una persona: como se dibuja un registro sobre la espiral.
 *
 * Antes cada registro era una mancha con un mechon de filamentos, repartida
 * al azar dentro de una zona. Ahora la visualizacion tiene columna —la espina
 * (`@core/render/espina`)— y cada registro es una rama que sale de ella: una
 * cinta de pigmento que nace pegada al cuerpo, se abre hacia un lado y se
 * adelgaza hasta la punta, como los flujos de una carta geologica pintada a
 * mano.
 *
 * Dos partes, y las dos importan:
 *
 * - **La forma** (`ramaDe`) es geometria pura y determinista: sale del id de
 *   la persona, asi que su rama es siempre la misma y agregar gente no mueve
 *   a nadie. Se calcula una vez por tanda de datos y la usan tanto el pintado
 *   como el raton (la rama es el area sensible de esa persona) y la
 *   animacion, que hace brotar hebras desde ella.
 * - **El pintado** (`pintarRama`) es al oleo, no a linea: la cinta se rellena
 *   varias veces con el contorno temblado distinto en cada pasada, muy
 *   tenue, y la suma es lo que da el cuerpo. Encima van unas cerdas que
 *   corren a lo largo —el peinado del pincel— y la orilla cargada de
 *   pigmento que deja la acuarela al secarse.
 *
 * El valor del registro gobierna el largo y el ancho, como la altura de una
 * barra: el mapa de calor se lee en el color y tambien en el tamano del
 * trazo.
 */
import type { DataRecord, PlacedPoint } from '../types';
import { gaussian, mulberry32, seedFor, type Rng } from '../sampling/prng';
import { enLargo, ladoExterior, type Espina } from './espina';
import type { Rgb } from './palette';

export interface RamaParams {
  /** Largo de la rama mas alta, en px de trabajo. */
  largo: number;
  /** Semiancho de la cinta en la raiz, en px de trabajo. */
  ancho: number;
  /** Cuanto se arquea la rama al alejarse del cuerpo (0-1). */
  curva: number;
  /** Opacidad de cada pasada de pigmento. */
  opacity: number;
  /** Pasadas de relleno: el cuerpo de la cinta lo hace la suma. */
  capas: number;
  /** Fraccion de ramas que salen hacia afuera de la espiral (0-1). */
  afuera: number;
  /** Apertura del abanico respecto de la perpendicular, en radianes. */
  apertura: number;
  /**
   * Fraccion de ramas que corren a lo largo de la espiral en vez de salir de
   * ella (0-1). Es lo que separa un mural de un erizo: si todas salen en
   * perpendicular, la figura se vuelve una estrella de puas. Las que corren
   * a lo largo engrosan el cuerpo y arrastran la vista por el recorrido,
   * como los flujos paralelos de la carta geologica de la referencia.
   */
  hebra: number;
}

/**
 * Afinados contra la plantilla a su tamano nativo (~2000 px de lado). Las
 * medidas en pixeles las recalcula `medidasParaDibujo` segun el dibujo que se
 * cargue; estas son el punto de partida.
 */
export const DEFAULT_RAMA: RamaParams = {
  largo: 240,
  ancho: 15,
  curva: 0.3,
  opacity: 0.085,
  capas: 7,
  afuera: 0.68,
  apertura: 0.5,
  hebra: 0.5,
};

/** Una persona, ya resuelta como trazo sobre la espiral. */
export interface Rama {
  punto: PlacedPoint;
  /** Posicion de la raiz sobre el recorrido, en [0,1]. */
  s: number;
  /** Eje de la cinta, como pares planos `[x,y,x,y,...]`. */
  eje: Float32Array;
  /** Semiancho de la cinta en cada punto del eje. */
  anchos: Float32Array;
  /** +1 si sale hacia afuera de la espiral, -1 si entra al hueco. */
  lado: number;
}

/** Pasos del eje: suficientes para que la cinta curve sin verse quebrada. */
const PASOS = 14;

/**
 * La rama de un registro. `s` es donde nace sobre el recorrido y `rng` la
 * semilla de esa persona: misma persona, misma rama, siempre.
 */
export function ramaDe(
  punto: PlacedPoint,
  espina: Espina,
  s: number,
  p: RamaParams,
  rng: Rng
): Rama {
  const raiz = enLargo(espina, s * espina.largo);
  const t = punto.t;

  // Hacia afuera de la espiral casi siempre: es lo que abre la figura. El
  // resto entra al hueco entre dos vueltas y lo va llenando.
  const exterior = ladoExterior(espina, raiz);
  const lado = rng() < p.afuera ? exterior : -exterior;

  // Dos maneras de salir, y el mural las necesita a las dos: la hebra corre
  // casi a lo largo del cuerpo —se peina con la espiral y la engrosa— y la
  // pluma sale hacia el lado, abriendo la figura. Entre una y otra hay un
  // abanico continuo, asi que ninguna de las dos se lee como un patron.
  const normal = raiz.ang + lado * Math.PI / 2;
  const aLoLargo = rng() < p.hebra;
  // La hebra arranca a un cuarto de vuelta de la normal (o sea, sobre la
  // tangente) y se va abriendo despacio con el giro.
  const sesgo = aLoLargo
    ? (rng() < 0.5 ? -1 : 1) * (Math.PI / 2) * (0.62 + rng() * 0.3)
    : 0;
  let ang = normal + sesgo + (rng() - 0.5) * p.apertura;

  // El valor estira la rama; el ancho crece con el, pero mucho menos: una
  // rama fuerte es sobre todo mas larga. El azar va al cuadrado: muchas
  // ramas medianas y unas pocas
  // largas que cruzan hacia la vuelta de al lado. Parejas, el mural queda
  // peludo; asi queda de flujos, como la carta geologica de la referencia.
  // Las hebras son mas largas que las plumas: una recorre el cuerpo, la
  // otra solo lo abandona.
  const largo = p.largo * (0.3 + t * 1.0) * (0.42 + rng() * rng() * 2.1) * (aLoLargo ? 1.35 : 1);
  const anchoRaiz = Math.max(1, p.ancho * (0.55 + t * 0.7) * (0.8 + rng() * 0.45));
  const avance = largo / PASOS;
  // Cada rama se arquea para su lado y con su propio radio, pero poco: el
  // flujo tiene que leerse saliendo del cuerpo, no enroscandose sobre si.
  const giro = (rng() < 0.62 ? 1 : -1) * (0.012 + rng() * 0.05) * (0.35 + p.curva);

  const eje = new Float32Array((PASOS + 1) * 2);
  const anchos = new Float32Array(PASOS + 1);
  // Arranca metida en el cuerpo: la raiz no se ve, la rama parece salir de
  // adentro del trazo principal y no pegada por fuera.
  let x = raiz.x - Math.cos(normal) * raiz.w * 0.35;
  let y = raiz.y - Math.sin(normal) * raiz.w * 0.35;

  for (let i = 0; i <= PASOS; i++) {
    const f = i / PASOS;
    eje[i * 2] = x;
    eje[i * 2 + 1] = y;
    // Perfil de pincelada: la cinta mantiene el cuerpo casi hasta el final
    // —apenas adelgaza con el arrastre— y recien ahi cierra en casquete
    // redondo. Es el perfil de un derrame de pintura, no el de una hoja ni
    // el de una pua: si adelgaza desde la raiz, el mural se vuelve un erizo.
    const arrastre = 1 - 0.28 * f;
    const casquete = f < 0.82 ? 1 : Math.sqrt(Math.max(0, 1 - ((f - 0.82) / 0.18) ** 2));
    anchos[i] = anchoRaiz * arrastre * casquete;
    ang += giro + gaussian(rng) * 0.08 * (0.4 + p.curva);
    x += Math.cos(ang) * avance;
    y += Math.sin(ang) * avance;
  }

  return { punto, s, eje, anchos, lado };
}

/** Fraccion del eje que hace de ancla de la rama: su centro visible. */
const ANCLA = 0.45;

export interface RepartoParams {
  globalSeed: number;
  /** Rango de normalizacion del valor. */
  min: number;
  max: number;
}

/**
 * Reparte los registros sobre la espiral y les resuelve la rama.
 *
 * Donde nace cada uno sale de su id, como salia su posicion cuando el mural
 * repartia manchas sueltas: la rama de una persona es siempre la misma y
 * nadie se mueve porque alguien mas se registre. Los extremos del recorrido
 * quedan libres —la cabeza y el ojo de la espiral son dibujo, no datos—.
 *
 * El punto que devuelve cada rama (`punto`) es su ancla: lo que el raton
 * busca y lo que la ficha señala. No es la raiz sino el cuerpo de la rama,
 * que es lo que se ve.
 */
export function ramasDe(
  records: readonly DataRecord[],
  espina: Espina,
  p: RamaParams,
  reparto: RepartoParams
): Rama[] {
  const span = reparto.max - reparto.min || 1;
  const ramas: Rama[] = [];

  for (const record of records) {
    const rng = mulberry32((seedFor(record.id, reparto.globalSeed) ^ 0x7f4a7c15) >>> 0);
    const s = 0.035 + rng() * 0.93;
    const t = Math.max(0, Math.min(1, (record.valor - reparto.min) / span));
    const punto: PlacedPoint = { record, x: 0, y: 0, t };
    const rama = ramaDe(punto, espina, s, p, rng);
    const ancla = enRama(rama, ANCLA);
    punto.x = ancla.x;
    punto.y = ancla.y;
    ramas.push(rama);
  }

  return ramas;
}

/**
 * La misma rama cortada donde va el pincel: lo que lleva pintado cuando se
 * esta dibujando a la vista (ver `mural/pintado.ts`).
 *
 * El corte no es tijera: el ultimo punto se interpola dentro del tramo y se
 * afina, asi la pincelada a medio hacer termina en punta de pincel y no en
 * canto de cuchillo. Los puntos de atras no se tocan, que es lo que deja que
 * el trazo crezca sin redibujarse: pintada con la misma semilla, la parte ya
 * hecha sale igual en cada fotograma.
 */
export function recortarRama(r: Rama, f: number): Rama {
  const ultimo = r.anchos.length - 1;
  if (ultimo < 1) return r;
  const d = Math.max(0, Math.min(1, f)) * ultimo;
  const i = Math.min(ultimo - 1, Math.floor(d));
  const k = d - i;
  const n = i + 2;   // los puntos enteros mas la punta

  const eje = new Float32Array(n * 2);
  const anchos = new Float32Array(n);
  for (let j = 0; j <= i; j++) {
    eje[j * 2] = r.eje[j * 2];
    eje[j * 2 + 1] = r.eje[j * 2 + 1];
    anchos[j] = r.anchos[j];
  }
  eje[n * 2 - 2] = r.eje[i * 2] + (r.eje[i * 2 + 2] - r.eje[i * 2]) * k;
  eje[n * 2 - 1] = r.eje[i * 2 + 1] + (r.eje[i * 2 + 3] - r.eje[i * 2 + 1]) * k;
  anchos[n - 1] = (r.anchos[i] + (r.anchos[i + 1] - r.anchos[i]) * k) * 0.5;

  return { ...r, eje, anchos };
}

/** Largo del eje de una rama, en px de trabajo. */
export function largoRama(r: Rama): number {
  let largo = 0;
  for (let i = 2; i < r.eje.length; i += 2) {
    largo += Math.hypot(r.eje[i] - r.eje[i - 2], r.eje[i + 1] - r.eje[i - 1]);
  }
  return largo;
}

/** Punto del eje a una fraccion del largo, para colgar cosas de la rama. */
export function enRama(r: Rama, f: number): { x: number; y: number; ang: number } {
  const n = r.anchos.length - 1;
  const i = Math.max(0, Math.min(n - 1, Math.floor(f * n)));
  const k = f * n - i;
  const x0 = r.eje[i * 2], y0 = r.eje[i * 2 + 1];
  const x1 = r.eje[i * 2 + 2], y1 = r.eje[i * 2 + 3];
  return {
    x: x0 + (x1 - x0) * k,
    y: y0 + (y1 - y0) * k,
    ang: Math.atan2(y1 - y0, x1 - x0),
  };
}

/**
 * Contorno de la cinta: una vuelta por un lado del eje y la vuelta por el
 * otro, con el ancho temblado. `temblor` es cuanto se despeina esta pasada
 * respecto del eje; con 0 sale la cinta exacta.
 */
function contorno(
  eje: Float32Array,
  anchos: Float32Array,
  rng: Rng,
  temblor: number,
  escala: number,
  k: number
): Path2D {
  const n = anchos.length;
  const izq: number[] = [];
  const der: number[] = [];

  for (let i = 0; i < n; i++) {
    const x = eje[i * 2], y = eje[i * 2 + 1];
    const j = i < n - 1 ? i + 1 : i - 1;
    const dx = eje[j * 2] - x, dy = eje[j * 2 + 1] - y;
    const len = Math.hypot(dx, dy) || 1;
    const s = i < n - 1 ? 1 : -1;
    const nx = (-dy / len) * s, ny = (dx / len) * s;
    const w = anchos[i] * escala * (1 + gaussian(rng) * temblor);
    const ox = gaussian(rng) * temblor * anchos[i] * escala * 0.5;
    const oy = gaussian(rng) * temblor * anchos[i] * escala * 0.5;
    izq.push((x * k + ox) + nx * w, (y * k + oy) + ny * w);
    der.push((x * k + ox) - nx * w, (y * k + oy) - ny * w);
  }

  const path = new Path2D();
  path.moveTo(izq[0], izq[1]);
  // Cuadraticas con los puntos medios de ancla: el borde queda de pincel y
  // no de poligono, que a este tamano se nota.
  for (let i = 1; i < n - 1; i++) {
    path.quadraticCurveTo(izq[i * 2], izq[i * 2 + 1],
      (izq[i * 2] + izq[i * 2 + 2]) / 2, (izq[i * 2 + 1] + izq[i * 2 + 3]) / 2);
  }
  path.lineTo(izq[(n - 1) * 2], izq[(n - 1) * 2 + 1]);
  path.lineTo(der[(n - 1) * 2], der[(n - 1) * 2 + 1]);
  for (let i = n - 2; i > 0; i--) {
    path.quadraticCurveTo(der[i * 2], der[i * 2 + 1],
      (der[i * 2] + der[i * 2 - 2]) / 2, (der[i * 2 + 1] + der[i * 2 - 1]) / 2);
  }
  path.closePath();
  return path;
}

/** El eje como curva suave, para las cerdas que corren por dentro. */
function ejeSuave(eje: Float32Array, rng: Rng, desvio: number, k: number): Path2D {
  const n = eje.length / 2;
  const path = new Path2D();
  path.moveTo(eje[0] * k + gaussian(rng) * desvio, eje[1] * k + gaussian(rng) * desvio);
  for (let i = 1; i < n - 1; i++) {
    const x0 = eje[i * 2] * k + gaussian(rng) * desvio;
    const y0 = eje[i * 2 + 1] * k + gaussian(rng) * desvio;
    const x1 = eje[i * 2 + 2] * k, y1 = eje[i * 2 + 3] * k;
    path.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
  }
  path.lineTo(eje[(n - 1) * 2] * k, eje[(n - 1) * 2 + 1] * k);
  return path;
}

/**
 * Pinta la rama en el lienzo. `k` lleva de coordenadas de trabajo a las del
 * lienzo. Asume `globalCompositeOperation = 'multiply'` ya puesto.
 */
export function pintarRama(
  ctx: CanvasRenderingContext2D,
  rama: Rama,
  color: Rgb,
  p: RamaParams,
  rng: Rng,
  k = 1
): void {
  const { r, g, b } = { r: color.r | 0, g: color.g | 0, b: color.b | 0 };
  const t = rama.punto.t;
  const capas = Math.max(1, Math.round(p.capas));

  // El cuerpo: varias pasadas del mismo trazo, cada una con el contorno
  // temblado distinto. Ninguna tapa a la anterior y la suma queda aguada.
  for (let i = 0; i < capas; i++) {
    const f = i / Math.max(1, capas - 1);
    // Las primeras pasadas anchas y lavadas, las ultimas angostas y cargadas:
    // asi el centro de la cinta queda mas oscuro que sus orillas, como el
    // pigmento que se junta donde paso mas veces el pincel.
    const escala = 1.1 - f * 0.45;
    const peso = 0.6 + f * 0.9;
    ctx.fillStyle = `rgba(${r},${g},${b},${p.opacity * peso})`;
    ctx.fill(contorno(rama.eje, rama.anchos, rng, 0.1 + f * 0.22, escala, k));
  }

  // Las cerdas: el peinado del pincel dentro de la cinta.
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const cerdas = 2 + Math.round(t * 3);
  for (let i = 0; i < cerdas; i++) {
    const w = rama.anchos[0] * k * (0.1 + rng() * 0.2);
    ctx.strokeStyle = `rgba(${r},${g},${b},${p.opacity * (0.5 + rng() * 0.7)})`;
    ctx.lineWidth = Math.max(0.5, w);
    ctx.stroke(ejeSuave(rama.eje, rng, rama.anchos[0] * k * 0.45, k));
  }

  // La orilla: el reborde que deja la acuarela al secarse. Va tenue y
  // temblado; marcada, le dibujaba un filo de vector a cada rama.
  ctx.strokeStyle = `rgba(${r},${g},${b},${p.opacity * 0.45})`;
  ctx.lineWidth = Math.max(0.4, rama.anchos[0] * k * 0.1);
  ctx.stroke(contorno(rama.eje, rama.anchos, rng, 0.14, 1, k));
}
