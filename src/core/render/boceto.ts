/**
 * Las lineas del boceto, convertidas en recorridos para pintar encima.
 *
 * El mural no muestra el dibujo: lo dibuja la gente. Cada persona que se
 * registra es una pincelada, y las pinceladas van sobre las lineas del
 * boceto, asi que la figura aparece porque alguien la trazo. Para eso hace
 * falta saber por donde pasa cada linea negra del dibujo como recorrido —"de
 * aqui hasta aca, con este grosor"— y no como mancha de pixeles.
 *
 * Ese recorrido no se calcula aqui: es el esqueleto de la tinta, horneado una
 * vez por `tools/trazos.py` y versionado junto al dibujo
 * (`<dibujo>.trazos.json`). Este modulo lo carga, lo escala al dibujo que
 * tenga el mural cargado y lo reparte:
 *
 * - **Las trazas** son las lineas del dibujo, cada una consultable por
 *   longitud de arco (ver `puntoEn`).
 * - **Los tramos** son esas lineas cortadas en pedazos del largo de una
 *   pincelada: el reparto de obra, un pedazo por persona.
 * - **El orden** es en que sucesion se van ocupando esos pedazos. No es el
 *   del dibujo sino uno disperso: cada pincelada nueva cae lo mas lejos
 *   posible de las que ya estan, asi con veinte personas se adivina la figura
 *   entera en vez de un solo rincon muy pintado.
 *
 * La diferencia con `@core/render/espina` —que sigue ahi, y la usan los
 * testimonios— es que aquella es *una* curva, el eje de la banda del cuerpo,
 * y esto son *todas* las lineas del dibujo.
 */

export interface BocetoJson {
  dibujo: string;
  width: number;
  height: number;
  /** Separacion entre puntos consecutivos, en px del espacio en que se midio. */
  paso: number;
  /** Una linea del dibujo por entrada; `[x, y, semiancho]` por punto. */
  trazos: [number, number, number][][];
}

/** Una linea del dibujo, consultable por longitud de arco. */
export interface Traza {
  xs: Float32Array;
  ys: Float32Array;
  /** Semiancho de la linea negra en cada punto. */
  ws: Float32Array;
  /** Longitud de arco acumulada hasta cada punto. */
  acum: Float32Array;
  largo: number;
}

/** El pedazo de linea que le toca a una persona. */
export interface Tramo {
  /** Indice de la traza en la que cae. */
  traza: number;
  /** Arco donde empieza y donde termina, en coordenadas de trabajo. */
  desde: number;
  hasta: number;
  /** Punto medio, que es con lo que se ordena el reparto. */
  x: number;
  y: number;
}

export interface Boceto {
  trazas: Traza[];
  /** Suma de todas las lineas del dibujo, en coordenadas de trabajo. */
  largo: number;
  tramos: Tramo[];
  /** Los tramos, en el orden en que conviene ocuparlos (ver `ordenDisperso`). */
  orden: Int32Array;
}

/** Un punto de una linea, ya resuelto. */
export interface PuntoTraza {
  x: number;
  y: number;
  /** Direccion de avance de la linea ahi, en radianes. */
  ang: number;
  /** Semiancho de la linea negra ahi. */
  w: number;
}

export function parseBocetoJson(text: string): BocetoJson {
  const raw = JSON.parse(text) as Partial<BocetoJson>;
  if (!Array.isArray(raw.trazos) || raw.trazos.length === 0) {
    throw new Error('El boceto no trae trazos');
  }
  return {
    dibujo: raw.dibujo ?? '',
    width: raw.width || 1,
    height: raw.height || 1,
    paso: raw.paso || 1,
    trazos: raw.trazos,
  };
}

/**
 * Lleva las lineas horneadas al dibujo que esta cargado y arma el reparto.
 *
 * `largoTramo` es cuanto abarca una pincelada: de ahi sale en cuantos pedazos
 * se corta el dibujo y, por lo tanto, con cuanta gente queda completo. Con el
 * valor de `medidasParaDibujo` y esta ilustracion son unos doscientos y pico
 * de pedazos, mas o menos la gente que hay en el banco de ejemplo.
 */
export function bocetoDesde(
  json: BocetoJson,
  width: number,
  height: number,
  largoTramo: number
): Boceto {
  const kx = width / (json.width || width);
  const ky = height / (json.height || height);
  // El ancho es una medida de area, no de eje: se escala con el promedio.
  const kw = (kx + ky) / 2;

  const trazas: Traza[] = [];
  let largo = 0;

  for (const puntos of json.trazos) {
    const n = puntos.length;
    if (n < 2) continue;
    const xs = new Float32Array(n);
    const ys = new Float32Array(n);
    const ws = new Float32Array(n);
    const acum = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const [x, y, w] = puntos[i];
      xs[i] = x * kx;
      ys[i] = y * ky;
      ws[i] = w * kw;
      if (i > 0) acum[i] = acum[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]);
    }
    trazas.push({ xs, ys, ws, acum, largo: acum[n - 1] });
    largo += acum[n - 1];
  }

  if (trazas.length === 0) throw new Error('El boceto no trae trazos con largo');

  const tramos = tramosDe(trazas, largoTramo);
  return { trazas, largo, tramos, orden: ordenDisperso(tramos) };
}

/**
 * Corta las lineas en pedazos del largo de una pincelada.
 *
 * Cada linea se reparte en pedazos iguales —el que sobra se reparte entre
 * todos en vez de dejar un cabo suelto— y una linea mas corta que una
 * pincelada es un pedazo solo.
 */
function tramosDe(trazas: readonly Traza[], largoTramo: number): Tramo[] {
  const paso = Math.max(1, largoTramo);
  const tramos: Tramo[] = [];

  for (let i = 0; i < trazas.length; i++) {
    const t = trazas[i];
    const n = Math.max(1, Math.round(t.largo / paso));
    const trozo = t.largo / n;
    for (let k = 0; k < n; k++) {
      const desde = k * trozo;
      const hasta = desde + trozo;
      const medio = puntoEn(t, (desde + hasta) / 2);
      tramos.push({ traza: i, desde, hasta, x: medio.x, y: medio.y });
    }
  }

  return tramos;
}

/**
 * En que orden se ocupan los tramos: siempre el mas lejos de lo ya pintado.
 *
 * Es el reparto lo que hace que el mural se lea desde la primera persona. Por
 * el orden del dibujo, los primeros cien registros pintarian la espiral
 * entera y ni una pluma; asi, cada uno cae en el hueco mas grande que haya
 * quedado y la figura entera va apareciendo a la vez, de a poco mas densa.
 *
 * Es el vecino mas lejano, calculado de una sola vez al cargar el dibujo:
 * doscientos y pico de tramos son unas decenas de miles de distancias.
 */
function ordenDisperso(tramos: readonly Tramo[]): Int32Array {
  const n = tramos.length;
  const orden = new Int32Array(n);
  if (n === 0) return orden;

  const tomado = new Uint8Array(n);
  // Arranca por la linea mas larga del dibujo, que es la que mas figura hace:
  // el horneado deja las trazas ordenadas de mayor a menor.
  const cerca = new Float32Array(n).fill(Infinity);
  let actual = 0;

  for (let k = 0; k < n; k++) {
    orden[k] = actual;
    tomado[actual] = 1;
    const ax = tramos[actual].x;
    const ay = tramos[actual].y;

    let mejor = -1;
    let mejorDist = -1;
    for (let i = 0; i < n; i++) {
      if (tomado[i]) continue;
      const d = (tramos[i].x - ax) ** 2 + (tramos[i].y - ay) ** 2;
      if (d < cerca[i]) cerca[i] = d;
      if (cerca[i] > mejorDist) {
        mejorDist = cerca[i];
        mejor = i;
      }
    }
    if (mejor < 0) break;
    actual = mejor;
  }

  return orden;
}

/** Indice del ultimo punto que esta antes de `dist` (busqueda binaria). */
function indiceEn(t: Traza, dist: number): number {
  let lo = 0;
  let hi = t.acum.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (t.acum[mid] <= dist) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** La linea a `dist` pixeles de su principio. */
export function puntoEn(t: Traza, dist: number): PuntoTraza {
  const d = Math.max(0, Math.min(t.largo, dist));
  const i = indiceEn(t, d);
  const j = Math.min(t.xs.length - 1, i + 1);
  const tramo = t.acum[j] - t.acum[i] || 1;
  const f = (d - t.acum[i]) / tramo;
  return {
    x: t.xs[i] + (t.xs[j] - t.xs[i]) * f,
    y: t.ys[i] + (t.ys[j] - t.ys[i]) * f,
    w: t.ws[i] + (t.ws[j] - t.ws[i]) * f,
    ang: Math.atan2(t.ys[j] - t.ys[i], t.xs[j] - t.xs[i]),
  };
}
