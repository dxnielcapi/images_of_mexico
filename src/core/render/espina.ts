/**
 * La espina del mural: la espiral del boceto, convertida en recorrido.
 *
 * El dibujo dejo de ser solo un campo que peina marcas sueltas. La
 * visualizacion tiene ahora una columna: el trazo que recorre la espiral de
 * la serpiente, de la cabeza al centro y en contra de las manecillas del
 * reloj. De el salen las ramas —una por persona— y sobre el se escriben los
 * testimonios.
 *
 * El recorrido no se calcula aqui: es el esqueleto de la banda del cuerpo,
 * horneado una vez por `tools/espina.py` y versionado junto al dibujo
 * (`<dibujo>.espina.json`). Este modulo solo lo carga, lo escala al dibujo que
 * tenga el mural cargado y lo deja consultar por longitud de arco, que es como
 * lo necesitan el trazo y el texto: "a tantos pixeles de la cabeza, donde
 * estoy, hacia donde voy y cuanto mide el cuerpo".
 *
 * `s` siempre es la posicion normalizada en [0,1]: 0 la cabeza, 1 el centro de
 * la espiral.
 */

export interface EspinaJson {
  dibujo: string;
  width: number;
  height: number;
  /** Separacion entre puntos consecutivos, en px del espacio en que se midio. */
  paso: number;
  /** `[x, y, semiancho]` por punto. */
  puntos: [number, number, number][];
}

export interface Espina {
  xs: Float32Array;
  ys: Float32Array;
  /** Semiancho del cuerpo en cada punto: cuanto mide la banda ahi. */
  ws: Float32Array;
  /** Longitud de arco acumulada hasta cada punto. */
  acum: Float32Array;
  /** Longitud total del recorrido, en coordenadas de trabajo. */
  largo: number;
  /** El centro de la espiral: el ultimo punto, donde muere el trazo. */
  centro: { x: number; y: number };
}

/** Un punto del recorrido, ya resuelto. */
export interface PuntoEspina {
  x: number;
  y: number;
  /** Direccion de avance (hacia el centro), en radianes. */
  ang: number;
  /** Semiancho del cuerpo ahi. */
  w: number;
}

export function parseEspinaJson(text: string): EspinaJson {
  const raw = JSON.parse(text) as Partial<EspinaJson>;
  if (!Array.isArray(raw.puntos) || raw.puntos.length < 2) {
    throw new Error('La espina no trae puntos');
  }
  return {
    dibujo: raw.dibujo ?? '',
    width: raw.width || 1,
    height: raw.height || 1,
    paso: raw.paso || 1,
    puntos: raw.puntos,
  };
}

/**
 * Lleva la espina horneada al dibujo que esta cargado.
 *
 * El JSON se midio sobre una rasterizacion concreta (hoy 1970x2000); si el
 * mural carga el mismo SVG a otro tamano, las coordenadas se escalan igual
 * que las semillas de las zonas. Un dibujo de otra proporcion no se puede
 * reescalar sin deformar el recorrido: ahi conviene volver a hornear.
 */
export function espinaDesde(json: EspinaJson, width: number, height: number): Espina {
  const kx = width / (json.width || width);
  const ky = height / (json.height || height);
  // El ancho es una medida de area, no de eje: se escala con el promedio.
  const kw = (kx + ky) / 2;

  const n = json.puntos.length;
  const xs = new Float32Array(n);
  const ys = new Float32Array(n);
  const ws = new Float32Array(n);
  const acum = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    const [x, y, w] = json.puntos[i];
    xs[i] = x * kx;
    ys[i] = y * ky;
    ws[i] = w * kw;
    if (i > 0) acum[i] = acum[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]);
  }

  return {
    xs, ys, ws, acum,
    largo: acum[n - 1],
    centro: { x: xs[n - 1], y: ys[n - 1] },
  };
}

/** Indice del ultimo punto que esta antes de `dist` (busqueda binaria). */
function indiceEn(e: Espina, dist: number): number {
  let lo = 0;
  let hi = e.acum.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (e.acum[mid] <= dist) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** El recorrido a `dist` pixeles de la cabeza. */
export function enLargo(e: Espina, dist: number): PuntoEspina {
  const d = Math.max(0, Math.min(e.largo, dist));
  const i = indiceEn(e, d);
  const j = Math.min(e.xs.length - 1, i + 1);
  const tramo = e.acum[j] - e.acum[i] || 1;
  const f = (d - e.acum[i]) / tramo;
  return {
    x: e.xs[i] + (e.xs[j] - e.xs[i]) * f,
    y: e.ys[i] + (e.ys[j] - e.ys[i]) * f,
    w: e.ws[i] + (e.ws[j] - e.ws[i]) * f,
    ang: anguloEn(e, i),
  };
}

/** El recorrido en `s` (0 cabeza, 1 centro). */
export function enS(e: Espina, s: number): PuntoEspina {
  return enLargo(e, s * e.largo);
}

/**
 * Direccion de avance alrededor del punto `i`. Se mide con una ventana de
 * varios puntos y no entre vecinos: a 10 px de paso, dos puntos seguidos
 * llevan el temblor del trazo a mano y las ramas saldrian desalineadas.
 */
function anguloEn(e: Espina, i: number): number {
  const n = e.xs.length;
  const a = Math.max(0, i - 3);
  const b = Math.min(n - 1, i + 3);
  return Math.atan2(e.ys[b] - e.ys[a], e.xs[b] - e.xs[a]);
}

/**
 * Hacia que lado cae "afuera" en un punto del recorrido: +1 o -1 segun que
 * signo de la normal apunta en contra del centro de la espiral.
 *
 * Las ramas que salen hacia afuera son las que abren la figura; las de
 * adentro rellenan el hueco entre dos vueltas. Saber cual es cual deja
 * repartirlas a proposito en vez de al azar.
 */
export function ladoExterior(e: Espina, p: PuntoEspina): number {
  const nx = -Math.sin(p.ang);
  const ny = Math.cos(p.ang);
  const dot = nx * (p.x - e.centro.x) + ny * (p.y - e.centro.y);
  return dot >= 0 ? 1 : -1;
}
