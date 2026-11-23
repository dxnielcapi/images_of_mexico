/**
 * La red: el mural como grafo de afinidades.
 *
 * Cada persona es un nodo y cada parecido fuerte entre dos personas es una
 * arista. La figura no se calca: se arma. El cuerpo de la serpiente sale de
 * donde cae la gente, y la gente cae donde la pone lo que contesto.
 *
 * El acomodo tiene dos ejes, y los dos son datos:
 *
 * - **A lo largo** manda el grupo. La espiral se reparte entre los grupos y
 *   cada uno se queda con un tramo del largo de su poblacion, en el orden que
 *   venga. Quien contesto igual cae en el mismo tramo, asi que las aristas de
 *   un grupo son cortas y la red se lee como una cadena de comunidades, de la
 *   cabeza al centro.
 *
 *   El tramo se mide por poblacion y no en partes iguales porque los grupos
 *   no se parecen en tamano: en este mural hay perfiles con cien personas y
 *   perfiles con tres. Con tramos iguales, los grandes se apelmazaban en un
 *   nudo ilegible y media espiral quedaba vacia — la figura no cerraba. Con
 *   tramos por poblacion la densidad sale pareja de punta a punta, que es lo
 *   que deja que el cuerpo se vea. El precio es que un alta corre un poco a
 *   quien venga despues en el recorrido; como el tramo crece en la proporcion
 *   de una persona entre cientos, el corrimiento es de menos de lo que mide
 *   un nodo.
 * - **Dentro del tramo** ordena `orden`, que el mapeo llena con lo que quiera
 *   graduar: la gente se reparte pareja a lo largo de su tramo siguiendo ese
 *   valor, asi que cada comunidad tiene adentro su propio degradado.
 * - **A lo ancho** no manda ningun dato: el nodo se despeina sobre la banda
 *   del cuerpo con su propia semilla. La banda es angosta y meter ahi un
 *   tercer eje seria pedirle al ojo que lea treinta pixeles de diferencia.
 *
 * Nada de esto conoce las preguntas: el significado vive en `@data/afinidad`
 * y entra por `EntradaRed` y por el `parecido` que se le pasa. Aqui solo hay
 * geometria, y por eso la red sirve igual si manana las preguntas son otras.
 *
 * La silueta la cierra el campo del dibujo (`@core/render/field`): un nodo
 * que cayo fuera de lo pintable se recoge hacia el eje hasta entrar. El
 * contorno de la figura no es un molde dibujado encima, es el borde al que
 * llegan los nodos.
 *
 * Por donde pasa el recorrido no se decide aqui: lo arma `@core/render/recorrido`
 * y crece con la poblacion, asi que al mural le van saliendo plumas a medida
 * que llega gente. Para la red es siempre lo mismo, una linea con un largo y
 * un ancho en cada punto.
 */
import type { DataRecord, PlacedPoint } from '../types';
import { gaussian, mulberry32, seedFor } from '../sampling/prng';
import { SpatialGrid } from '../sampling/grid';
import type { Recorrido } from './recorrido';
import { depthAt, type ShapeField } from './field';
import type { ColorRamp } from './palette';

/** Lo que la red necesita saber de una persona. El sentido lo pone el mapeo. */
export interface EntradaRed {
  record: DataRecord;
  /** Puesto de su grupo, en [0, grupos). Decide que tramo del recorrido le toca. */
  grupo: number;
  /** Con que se ordena dentro de su tramo, en [0,1]. */
  orden: number;
  /** Intensidad ya normalizada, en [0,1]: el color y el tamano. */
  t: number;
}

export interface RedParams {
  /** Radio del nodo mas lavado y del mas cargado, en px de trabajo. */
  radioMin: number;
  radioMax: number;
  /** Cuanto del semiancho del cuerpo ocupa la nube, en [0,1]. */
  banda: number;
  /** Desorden a lo largo, en fracciones del hueco entre dos vecinos. */
  dispersion: number;
  /** Cuantas aristas intenta tener cada nodo. */
  grado: number;
  /** Parecido minimo para que dos nodos se unan. */
  parecidoMin: number;
  /** Largo maximo de una arista, en px de trabajo. */
  largoMax: number;
  /** Grosor de la arista mas fuerte, en px de trabajo. */
  aristaAncho: number;
  /** Opacidad de la arista mas fuerte. */
  aristaAlpha: number;
  /** Hasta donde se siente el cursor, en px de trabajo. */
  evasion: number;
  /** Cuanto se aparta el nodo mas empujado, en px de trabajo. */
  empuje: number;
  /** Que tan rapido obedece el nodo, en 1/segundos. */
  respuesta: number;
}

/**
 * Afinados contra la plantilla a su tamano nativo (~2000 px de lado); las
 * medidas en pixeles las recalcula `medidasParaDibujo`.
 */
export const DEFAULT_RED: RedParams = {
  radioMin: 7,
  radioMax: 18,
  banda: 0.85,
  dispersion: 0.42,
  grado: 5,
  parecidoMin: 0.62,
  largoMax: 190,
  aristaAncho: 3,
  aristaAlpha: 0.52,
  evasion: 150,
  empuje: 26,
  respuesta: 9,
};

export interface Nodo {
  /** El punto que ve el resto del mural: su lugar en reposo. */
  punto: PlacedPoint;
  /** Donde descansa, en px de trabajo. Es lo que indexa el hit-testing. */
  bx: number;
  by: number;
  /** Cuanto esta corrido ahora mismo por el cursor. */
  dx: number;
  dy: number;
  /** Radio en px de trabajo. */
  r: number;
}

export interface Arista {
  a: Nodo;
  b: Nodo;
  /** Parecido entre los dos, en [0,1]. */
  peso: number;
}

export interface Red {
  nodos: Nodo[];
  aristas: Arista[];
}

/** Donde esta un nodo ahora mismo: su reposo mas lo que lo corrio el cursor. */
export const vivoX = (n: Nodo) => n.bx + n.dx;
export const vivoY = (n: Nodo) => n.by + n.dy;

export interface RedOpts {
  globalSeed: number;
  /** En cuantos tramos se parte el recorrido. */
  grupos: number;
  /** Cuanto se parecen dos registros, en [0,1]. */
  parecido: (a: DataRecord, b: DataRecord) => number;
}

/**
 * Margen del tramo que queda libre a cada lado.
 *
 * Es chico a proposito. Separar los grupos ayuda a leerlos, pero el cuerpo de
 * la serpiente es uno solo: con un margen generoso la espiral salia cortada a
 * guiones y la figura se perdia. Lo que separa a un grupo del siguiente no
 * tiene que ser un hueco, son las aristas que dejan de cruzar.
 */
const MARGEN_TRAMO = 0.015;

/** Intentos de recoger un nodo que cayo fuera de la silueta. */
const PASOS_ADENTRO = 6;

/**
 * Arma la red: donde cae cada quien y quien queda unido con quien.
 *
 * El lugar de un nodo sale de su grupo, de su `ancho` y de su id —nunca de su
 * posicion en la lista—, asi que dos tandas con la misma gente dan el mismo
 * dibujo y agregar a alguien no corre a los demas.
 */
export function redDe(
  entradas: readonly EntradaRed[],
  recorrido: Recorrido,
  field: ShapeField | null,
  p: RedParams,
  o: RedOpts
): Red {
  const nodos: Nodo[] = [];
  if (entradas.length === 0) return { nodos, aristas: [] };

  // Cada grupo se lleva un tramo del largo de su poblacion, y adentro su
  // gente se reparte pareja: eso es lo que deja la densidad igual en todo el
  // recorrido, que es lo que hace que el cuerpo se vea.
  const porGrupo = new Map<number, EntradaRed[]>();
  for (const e of entradas) {
    const lista = porGrupo.get(e.grupo);
    if (lista) lista.push(e);
    else porGrupo.set(e.grupo, [e]);
  }
  const puestos = [...porGrupo.keys()].sort((a, b) => a - b);

  let desde = 0;
  for (const puesto of puestos) {
    // Dentro del grupo, el orden que pidio el mapeo; el id desempata, para
    // que dos personas con el mismo valor no dependan de quien llego antes.
    const gente = porGrupo.get(puesto)!.slice().sort((x, y) =>
      x.orden - y.orden || (x.record.id < y.record.id ? -1 : 1));
    const arco = gente.length / entradas.length;
    const paso = arco / gente.length;

    gente.forEach((e, i) => {
      const rng = mulberry32((seedFor(e.record.id, o.globalSeed) ^ 0x7f4a7c15) >>> 0);

      // Su lugar en la fila del grupo, con el margen que separa un grupo del
      // siguiente y un temblor de menos de medio paso para que no quede a
      // compas de regla.
      const dentro = (i + 0.5) / gente.length;
      const s = desde + arco * (MARGEN_TRAMO + (1 - 2 * MARGEN_TRAMO) * dentro)
        + gaussian(rng) * paso * p.dispersion;
      // A lo ancho manda solo la semilla: la banda es angosta y el dato ya
      // esta dicho a lo largo.
      const v = (rng() * 2 - 1) * p.banda;

      nodos.push(nodoEn(e, recorrido, field, p, s, v));
    });

    desde += arco;
  }

  return { nodos, aristas: aristasDe(nodos, p, o) };
}

/** Un nodo en `s` del recorrido, corrido `v` semianchos hacia un costado. */
function nodoEn(
  e: EntradaRed,
  recorrido: Recorrido,
  field: ShapeField | null,
  p: RedParams,
  s: number,
  v: number
): Nodo {
  const q = recorrido.en(s);
  const nx = -Math.sin(q.ang);
  const ny = Math.cos(q.ang);

  // El semiancho lo pone el recorrido: en el cuerpo es la banda entera y en
  // una pluma es el grosor del trazo, asi que el nodo se pega a la linea sola.
  // Si aun asi cayo fuera de lo pintable, se recoge hasta entrar: el borde de
  // la figura lo pone el dibujo, no la formula.
  let k = Math.max(-1, Math.min(1, v));
  let x = q.x + nx * k * q.w;
  let y = q.y + ny * k * q.w;
  if (field) {
    for (let i = 0; i < PASOS_ADENTRO && depthAt(field, x, y) <= 0; i++) {
      k *= 0.6;
      x = q.x + nx * k * q.w;
      y = q.y + ny * k * q.w;
    }
  }

  const t = Math.min(1, Math.max(0, e.t));
  return {
    punto: { record: e.record, x, y, t },
    bx: x, by: y, dx: 0, dy: 0,
    r: p.radioMin + (p.radioMax - p.radioMin) * t,
  };
}

/**
 * Las aristas: de cada nodo, las `grado` compañias mas parecidas que tenga
 * cerca.
 *
 * Se buscan por vecindad y no entre todos contra todos por dos razones, y la
 * de velocidad es la menos importante. La otra es que una arista entre dos
 * personas parecidas que cayeron en extremos opuestos del dibujo seria una
 * cuerda cruzando la figura: cierta como dato e ilegible como imagen. Como el
 * acomodo ya puso cerca a quienes se parecen, el recorte por distancia casi
 * no pierde parecidos de verdad — y los que pierde son los que habrian
 * tapado el dibujo.
 */
function aristasDe(nodos: readonly Nodo[], p: RedParams, o: RedOpts): Arista[] {
  if (nodos.length < 2) return [];

  let maxX = 1;
  let maxY = 1;
  for (const n of nodos) {
    if (n.bx > maxX) maxX = n.bx;
    if (n.by > maxY) maxY = n.by;
  }
  // El indice pide `x`/`y` y el nodo guarda su reposo en `bx`/`by`: se
  // indexa un envoltorio en vez de renombrar el nodo, porque `x`/`y` de un
  // nodo tendrian que ser los de ahora, y los de ahora se mueven.
  const grid = new SpatialGrid<{ x: number; y: number; nodo: Nodo }>(
    Math.max(8, p.largoMax), maxX, maxY);
  for (const n of nodos) grid.insert({ x: n.bx, y: n.by, nodo: n });

  const indice = new Map<Nodo, number>();
  nodos.forEach((n, i) => indice.set(n, i));

  const aristas: Arista[] = [];
  const puestas = new Set<number>();
  const n = nodos.length;

  for (const a of nodos) {
    const ia = indice.get(a)!;
    const cerca: { b: Nodo; peso: number }[] = [];

    for (const { nodo: b } of grid.near(a.bx, a.by, p.largoMax)) {
      if (b === a) continue;
      if (Math.hypot(b.bx - a.bx, b.by - a.by) > p.largoMax) continue;
      const peso = o.parecido(a.punto.record, b.punto.record);
      if (peso < p.parecidoMin) continue;
      cerca.push({ b, peso });
    }

    // Mas parecido primero; a igual parecido, el id decide, para que la red
    // no dependa del orden en que llegaron los registros.
    cerca.sort((x, y) =>
      y.peso - x.peso || (x.b.punto.record.id < y.b.punto.record.id ? -1 : 1));

    for (const { b, peso } of cerca.slice(0, p.grado)) {
      const ib = indice.get(b)!;
      const clave = ia < ib ? ia * n + ib : ib * n + ia;
      if (puestas.has(clave)) continue;
      puestas.add(clave);
      aristas.push({ a, b, peso });
    }
  }

  // De la mas floja a la mas fuerte: las fuertes quedan encima.
  aristas.sort((x, y) => x.peso - y.peso);
  return aristas;
}

// ---------------------------------------------------------------- el cursor

export interface Cursor {
  x: number;
  y: number;
}

/**
 * Corre los nodos para que esquiven el cursor, y los deja volver cuando se
 * va. Devuelve true mientras quede algo moviendose: es lo que apaga el bucle
 * de animacion cuando la red ya esta quieta.
 *
 * El empuje se mide desde el reposo del nodo y no desde donde esta ahora. Es
 * la diferencia entre esquivar y huir: midiendo desde la posicion corrida, un
 * nodo que se aparta deja de sentir el cursor, vuelve, lo vuelve a sentir, y
 * tiembla. Desde el reposo la fuerza es constante mientras el cursor no se
 * mueva, y el nodo se queda apartado, quieto.
 */
export function evadir(red: Red, cursor: Cursor | null, p: RedParams, dt: number): boolean {
  // Suavizado exponencial: independiente del fotograma, sin rebote.
  const k = 1 - Math.exp(-Math.max(0, dt) * p.respuesta);
  let vivo = false;

  for (const n of red.nodos) {
    let tx = 0;
    let ty = 0;
    if (cursor) {
      const dx = n.bx - cursor.x;
      const dy = n.by - cursor.y;
      const d = Math.hypot(dx, dy);
      if (d < p.evasion && d > 1e-3) {
        // Cuadratico: casi nada en el borde del radio, firme al centro.
        const f = 1 - d / p.evasion;
        const push = p.empuje * f * f;
        tx = (dx / d) * push;
        ty = (dy / d) * push;
      }
    }
    n.dx += (tx - n.dx) * k;
    n.dy += (ty - n.dy) * k;
    if (!vivo && (Math.abs(tx - n.dx) > 0.05 || Math.abs(ty - n.dy) > 0.05)) vivo = true;
  }

  return vivo;
}

/** Deja la red en reposo, sin animar. Para el fondo del Hero y el export. */
export function enReposo(red: Red): void {
  for (const n of red.nodos) { n.dx = 0; n.dy = 0; }
}

// ---------------------------------------------------------------- el pincel

/** Niveles de color que se hornean: mas que esto no se distinguen. */
const NIVELES = 32;
/** Lado del sprite horneado, en pixeles. */
const SPRITE = 96;

/**
 * Los nodos no se dibujan con un `arc` por nodo sino con una estampa
 * horneada: un disco aguado, uno por nivel de color.
 *
 * Es por el cursor. Con la red esquivando hay que redibujar los trescientos
 * nodos y sus aristas en cada fotograma, y un degradado radial nuevo por
 * nodo son diez mil degradados por segundo. Horneados una vez, cada nodo es
 * un `drawImage` escalado y el fotograma sale practicamente gratis.
 */
const PINCELES = new WeakMap<ColorRamp, HTMLCanvasElement[]>();

function pincelesDe(ramp: ColorRamp): HTMLCanvasElement[] {
  const hecho = PINCELES.get(ramp);
  if (hecho) return hecho;

  const sprites: HTMLCanvasElement[] = [];
  for (let i = 0; i < NIVELES; i++) {
    const t = i / (NIVELES - 1);
    const c = document.createElement('canvas');
    c.width = SPRITE;
    c.height = SPRITE;
    const cx = c.getContext('2d')!;
    const m = SPRITE / 2;
    // Nucleo lleno y borde que se deshace: el canto aguado de una gota.
    const g = cx.createRadialGradient(m, m, 0, m, m, m);
    g.addColorStop(0, ramp.rgbaAt(t, 0.95));
    g.addColorStop(0.42, ramp.rgbaAt(t, 0.8));
    g.addColorStop(0.72, ramp.rgbaAt(t, 0.3));
    g.addColorStop(1, ramp.rgbaAt(t, 0));
    cx.fillStyle = g;
    cx.fillRect(0, 0, SPRITE, SPRITE);
    sprites.push(c);
  }

  PINCELES.set(ramp, sprites);
  return sprites;
}

/**
 * Pinta la red donde este ahora mismo.
 *
 * Primero las aristas y despues los nodos: el tejido va debajo y la gente
 * encima, que es el orden en que se lee. Asume `multiply` ya puesto por quien
 * llama, como el resto del render. `scale` lleva de coordenadas de trabajo a
 * las del lienzo.
 */
export function dibujarRed(
  ctx: CanvasRenderingContext2D,
  red: Red,
  ramp: ColorRamp,
  p: RedParams,
  scale = 1
): void {
  const rango = Math.max(0.01, 1 - p.parecidoMin);

  ctx.lineCap = 'round';
  for (const e of red.aristas) {
    const fuerza = Math.min(1, Math.max(0, (e.peso - p.parecidoMin) / rango));
    const t = (e.a.punto.t + e.b.punto.t) / 2;
    ctx.strokeStyle = ramp.rgbaAt(t, p.aristaAlpha * (0.22 + 0.78 * fuerza));
    ctx.lineWidth = Math.max(0.35, p.aristaAncho * (0.35 + 0.65 * fuerza) * scale);
    ctx.beginPath();
    ctx.moveTo(vivoX(e.a) * scale, vivoY(e.a) * scale);
    ctx.lineTo(vivoX(e.b) * scale, vivoY(e.b) * scale);
    ctx.stroke();
  }

  const sprites = pincelesDe(ramp);
  for (const n of red.nodos) {
    const sprite = sprites[Math.min(NIVELES - 1, Math.max(0, Math.round(n.punto.t * (NIVELES - 1))))];
    // El sprite se deshace antes del borde, asi que se dibuja mas grande que
    // el radio para que el nucleo opaco mida lo que tiene que medir.
    const lado = n.r * 2.6 * scale;
    if (lado < 0.75) continue;
    ctx.drawImage(sprite, vivoX(n) * scale - lado / 2, vivoY(n) * scale - lado / 2, lado, lado);
  }
}
