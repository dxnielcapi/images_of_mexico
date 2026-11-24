/**
 * La silueta: el cartel, medido tramo a tramo y con la tinta que le dio la gente.
 *
 * El mural tenia el dibujo apagado. La figura la armaban los nodos y nada
 * mas, y eso dejaba fuera la mitad del cartel: entre vuelta y vuelta de la
 * espiral hay nopales, mazorcas y ornamentos que la red no alcanza a sugerir
 * —un nopal son cuatro pencas de cincuenta pixeles, no una nube de puntos—,
 * asi que el dibujo se leia como un remolino rojo sin codice debajo.
 *
 * Aqui el dibujo vuelve, pero nunca como lamina: el SVG no se muestra. Lo que
 * hay es el cartel partido en tramos —cada pedacito de cada linea, con su
 * grosor y con la opacidad que le dieron los datos— y alguien que los va
 * pintando. En el mural los pinta un lapiz que no para (ver `mural/trazado`),
 * asi que el cartel se ve de a pedazos y siempre en movimiento; donde no hay
 * animacion que valga —movimiento reducido, el fondo del Hero— se pintan
 * todos de una vez y queda el dibujo quieto.
 *
 * La tinta de cada tramo sale de los datos:
 *
 * - **En fantasma** la linea que todavia no toco nadie. Se adivina que el
 *   cartel sigue, y nada mas: es el lapiz antes de la tinta.
 * - **Entintada** la que tiene gente encima. Donde la red se junto, la linea
 *   del dibujo sale firme, y el nopal o la mazorca de ahi se leen como
 *   objetos y no como manchas.
 *
 * Y es por punto, no por linea entera: una pluma puede estar entintada en su
 * arranque y seguir en fantasma en la punta, que es exactamente lo que esta
 * pasando con los datos.
 *
 * Lo que no pasa por aqui es el tlacuilo: esa figura se dibuja entera y desde
 * el principio (ver `@core/render/figura`). El resto del cartel lo entinta
 * quien se registra.
 */
import { SpatialGrid } from '../sampling/grid';
import type { Boceto } from './boceto';

export interface SiluetaParams {
  /** Opacidad de una linea que todavia no toco nadie. */
  fantasma: number;
  /** Opacidad de una linea con gente encima. */
  tinta: number;
  /** Hasta donde cuenta un nodo, en px de trabajo. */
  cerca: number;
  /** Cuantos nodos cerca entintan del todo. */
  cuantos: number;
  /** Grosor minimo de una linea, en px de trabajo. */
  grosorMin: number;
  /** El negro del dibujo, en `r g b` para componerle el alfa. */
  negro: string;
}

/**
 * Afinados contra la plantilla a su tamano nativo (~2000 px de lado). Las
 * medidas en pixeles las recalcula `medidasParaDibujo`.
 *
 * Las dos opacidades son bajas porque el cartel no esta quieto: cada tramo se
 * pinta al pasar el lapiz y se apaga detras de el, asi que lo que se ve en un
 * momento dado es un pedazo del dibujo y no el dibujo. Subirlas devuelve la
 * lamina.
 */
export const DEFAULT_SILUETA: SiluetaParams = {
  fantasma: 0.09,
  tinta: 0.45,
  cerca: 26,
  cuantos: 2,
  grosorMin: 1.1,
  negro: '32 27 22',
};

/** Cuanto se promedia la ocupacion con sus vecinos, en puntos de la traza. */
const SUAVIZADO = 3;

/**
 * Cuanta gente hay sobre cada punto de cada linea del dibujo, en [0,1].
 *
 * Se mide una vez por tanda, no por fotograma: la ocupacion depende de donde
 * descansan los nodos, y eso solo cambia cuando alguien se registra.
 *
 * El conteo se suaviza a lo largo de la linea para que la tinta no vaya a
 * parches de un punto si y otro no: un nodo entinta su pedazo de linea, no un
 * pixel.
 */
export function ocupacionDe(
  boceto: Boceto,
  nodos: readonly { x: number; y: number }[],
  p: SiluetaParams,
  width: number,
  height: number
): Float32Array[] {
  const grid = new SpatialGrid<{ x: number; y: number }>(Math.max(8, p.cerca), width, height);
  for (const n of nodos) grid.insert(n);

  const r2 = p.cerca * p.cerca;
  return boceto.trazas.map((t) => {
    const crudo = new Float32Array(t.xs.length);
    for (let i = 0; i < t.xs.length; i++) {
      const x = t.xs[i];
      const y = t.ys[i];
      let n = 0;
      for (const nodo of grid.near(x, y, p.cerca)) {
        const dx = nodo.x - x;
        const dy = nodo.y - y;
        if (dx * dx + dy * dy <= r2 && ++n >= p.cuantos) break;
      }
      crudo[i] = Math.min(1, n / Math.max(1, p.cuantos));
    }
    return suavizar(crudo);
  });
}

/** Media movil a lo largo de la linea, con los bordes repetidos. */
function suavizar(v: Float32Array): Float32Array {
  const n = v.length;
  if (n <= 2) return v;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let suma = 0;
    let cuenta = 0;
    for (let k = -SUAVIZADO; k <= SUAVIZADO; k++) {
      const j = i + k;
      if (j < 0 || j >= n) continue;
      suma += v[j];
      cuenta++;
    }
    out[i] = suma / cuenta;
  }
  return out;
}

/**
 * El cartel entero partido en tramos, en el orden en que se dibuja.
 *
 * Son arreglos paralelos y no una lista de objetos porque son diez mil
 * tramos y se recorren por rango sesenta veces por segundo: un objeto por
 * tramo es basura que el recolector tendria que ir juntando en medio de la
 * animacion.
 *
 * El orden lo decide quien los pide. El del horneado —de la linea mas larga
 * a la mas corta— reparte bien el presupuesto del recorrido pero visto
 * dibujar es un parpadeo de pedazos sueltos por todo el cartel; el mural
 * pide el de la espiral (`ordenPorEspiral`), que es el de la mano: da la
 * vuelta, y cada nopal aparece cuando le toca.
 */
export interface Tramos {
  x0: Float32Array;
  y0: Float32Array;
  x1: Float32Array;
  y1: Float32Array;
  /** Opacidad que le toca por la gente que tiene encima. */
  alpha: Float32Array;
  /** Grosor de la linea del dibujo ahi, en px de trabajo. */
  ancho: Float32Array;
  largo: number;
}

/**
 * Mide el cartel y le reparte la tinta. Una vez por tanda de datos.
 *
 * `orden` son los indices de las lineas en el orden en que hay que
 * dibujarlas; sin el, el del boceto.
 */
export function tramosDe(
  boceto: Boceto,
  ocupacion: readonly Float32Array[],
  p: SiluetaParams,
  orden?: Int32Array
): Tramos {
  let n = 0;
  for (const t of boceto.trazas) n += Math.max(0, t.xs.length - 1);

  const tramos: Tramos = {
    x0: new Float32Array(n), y0: new Float32Array(n),
    x1: new Float32Array(n), y1: new Float32Array(n),
    alpha: new Float32Array(n), ancho: new Float32Array(n),
    largo: n,
  };

  const rango = p.tinta - p.fantasma;
  let i = 0;
  const recorrido = orden && orden.length === boceto.trazas.length
    ? Array.from(orden)
    : boceto.trazas.map((_, k) => k);

  recorrido.forEach((k) => {
    const t = boceto.trazas[k];
    const ocupa = ocupacion[k];
    for (let j = 0; j < t.xs.length - 1; j++, i++) {
      tramos.x0[i] = t.xs[j];
      tramos.y0[i] = t.ys[j];
      tramos.x1[i] = t.xs[j + 1];
      tramos.y1[i] = t.ys[j + 1];
      const carga = ocupa ? (ocupa[j] + ocupa[j + 1]) / 2 : 0;
      tramos.alpha[i] = p.fantasma + rango * carga;
      // El semiancho por dos es el ancho de la linea; el minimo es para que
      // el detalle fino no desaparezca al mirar el mural de lejos.
      tramos.ancho[i] = Math.max(p.grosorMin, t.ws[j] + t.ws[j + 1]);
    }
  });

  return tramos;
}

/** Lo que se ve del dibujo ahora mismo, en coordenadas de trabajo. */
export interface Recorte {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export interface PintadoTramos {
  /** De coordenadas de trabajo a las del lienzo. */
  escala?: number;
  /** Lo que entra en el lienzo: lo de afuera no se recorre. */
  recorte?: Recorte | null;
  /** Opacidad de cada tramo, por su lugar en el rango. Para el apagado. */
  desvanecer?: (i: number) => number;
}

/** Niveles de tinta que se distinguen. Mas que esto no se nota y cuesta. */
const NIVELES = 6;
/** Paso con el que se agrupan los grosores, en px de trabajo. */
const PASO_GROSOR = 0.5;

/**
 * Pinta los tramos `[desde, hasta)`.
 *
 * Agrupa por tinta y grosor antes de trazar. No es solo velocidad —con un
 * `stroke` por tramo, el cartel entero seria un cuadro de decimas de
 * segundo—: redondear la opacidad a unos pocos niveles es lo que hace que la
 * ilustracion se lea como un dibujo entintado a mano, con linea clara y linea
 * oscura, en vez de como un degradado donde cada tramo es un poco distinto
 * del de al lado.
 *
 * Asume que quien llama ya puso el modo de composicion que quiera.
 */
export function pintarTramos(
  ctx: CanvasRenderingContext2D,
  tramos: Tramos,
  desde: number,
  hasta: number,
  p: SiluetaParams,
  o: PintadoTramos = {}
): void {
  const escala = o.escala ?? 1;
  const recorte = o.recorte ?? null;
  const tope = Math.min(hasta, tramos.largo);
  // Clave: nivel de tinta y grosor, los dos ya redondeados.
  const tandas = new Map<number, Path2D>();

  for (let i = Math.max(0, desde); i < tope; i++) {
    if (recorte && fuera(tramos, i, recorte)) continue;
    const alpha = tramos.alpha[i] * (o.desvanecer ? o.desvanecer(i) : 1);
    const nivel = Math.round((alpha / p.tinta) * (NIVELES - 1));
    if (nivel <= 0) continue;
    const clave = nivel * 4096 + Math.round(tramos.ancho[i] / PASO_GROSOR);
    let path = tandas.get(clave);
    if (!path) tandas.set(clave, (path = new Path2D()));
    path.moveTo(tramos.x0[i] * escala, tramos.y0[i] * escala);
    path.lineTo(tramos.x1[i] * escala, tramos.y1[i] * escala);
  }

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const [clave, path] of tandas) {
    const nivel = Math.floor(clave / 4096);
    const grosor = (clave % 4096) * PASO_GROSOR * escala;
    const alpha = (nivel / (NIVELES - 1)) * p.tinta;
    if (alpha <= 0.004 || grosor < 0.2) continue;
    ctx.strokeStyle = `rgb(${p.negro} / ${alpha.toFixed(3)})`;
    ctx.lineWidth = grosor;
    ctx.stroke(path);
  }
}

/** El cartel entero de una vez: el dibujo quieto. */
export function dibujarSilueta(
  ctx: CanvasRenderingContext2D,
  tramos: Tramos,
  p: SiluetaParams,
  escala = 1,
  recorte: Recorte | null = null
): void {
  pintarTramos(ctx, tramos, 0, tramos.largo, p, { escala, recorte });
}

/** Si el tramo quedo fuera de lo que se esta mirando. */
function fuera(t: Tramos, i: number, r: Recorte): boolean {
  return (t.x0[i] < r.x0 && t.x1[i] < r.x0)
    || (t.x0[i] > r.x1 && t.x1[i] > r.x1)
    || (t.y0[i] < r.y0 && t.y1[i] < r.y0)
    || (t.y0[i] > r.y1 && t.y1[i] > r.y1);
}
