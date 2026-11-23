/**
 * Los testimonios escritos dentro del trazo.
 *
 * Lo que cada persona dejo escrito no es un dato de hover: es parte del
 * dibujo. Las frases corren por dentro del tronco, siguiendo la espiral letra
 * por letra, en el orden en que estan las personas sobre el recorrido. Cada
 * frase arranca en la raiz de la rama de quien la dijo, asi que el texto y el
 * trazo hablan del mismo registro.
 *
 * Dos cosas gobiernan cuantas se ven:
 *
 * - El tamano de la letra se mide en pixeles del lienzo, no del dibujo. El
 *   mural se rasteriza a la medida en que se mira (ver `ajustarLienzo` en el
 *   mural), asi que una letra de 11 px es una letra de 11 px en pantalla,
 *   se este viendo en un telefono o proyectado en una pared.
 * - Una frase ocupa el tramo de espiral que mide su propio ancho. La
 *   siguiente empieza despues, con un respiro. Como la espiral tiene un
 *   largo fijo, entran las que entran: el resto de la gente esta igual en el
 *   mural —su rama, su color— y su frase se lee al señalarla.
 *
 * Donde la espiral va hacia la izquierda el texto se escribe al reves (de
 * atras para adelante y girado media vuelta) para que nunca quede cabeza
 * abajo: es lo mismo que hace cualquier rotulo sobre una curva cerrada.
 */
import { enLargo, type Espina } from './espina';
import type { Rgb } from './palette';

export interface TestimonioParams {
  /** Altura de la letra en pixeles del lienzo. */
  tamano: number;
  /** Respiro entre una frase y la siguiente, en pixeles del lienzo. */
  respiro: number;
  /** Opacidad de la tinta. */
  opacity: number;
  /** Familia tipografica del lienzo. */
  fuente: string;
}

export const DEFAULT_TESTIMONIOS: TestimonioParams = {
  tamano: 12.5,
  respiro: 26,
  opacity: 0.82,
  fuente: 'Georgia, "Iowan Old Style", "Times New Roman", serif',
};

/** Una frase para escribir y donde empieza, en [0,1] sobre el recorrido. */
export interface Frase {
  s: number;
  texto: string;
}

/** Muestras de tangente que se toman para medir el rumbo de un tramo. */
const MUESTRAS = 7;

/**
 * Hacia donde va el recorrido a lo largo de un tramo, y cuanto se mantiene.
 *
 * `medio` es la direccion promedio y `coherencia` va de 1 (el tramo es casi
 * recto) a 0 (da la vuelta sobre si mismo). Es el promedio vectorial de las
 * tangentes, que es la unica forma honesta de promediar angulos.
 */
function rumbo(
  e: Espina, inicio: number, ancho: number, k: number
): { medio: number; coherencia: number } {
  let sx = 0, sy = 0;
  for (let i = 0; i <= MUESTRAS; i++) {
    const a = enLargo(e, (inicio + (ancho * i) / MUESTRAS) / k).ang;
    sx += Math.cos(a);
    sy += Math.sin(a);
  }
  return {
    medio: Math.atan2(sy, sx),
    coherencia: Math.hypot(sx, sy) / (MUESTRAS + 1),
  };
}

/**
 * Escribe las frases sobre la espina. `k` lleva de coordenadas de trabajo a
 * las del lienzo. Devuelve cuantas entraron.
 *
 * Asume `globalCompositeOperation = 'multiply'`: la tinta se mete en el
 * pigmento del tronco en vez de taparlo.
 */
export function escribirTestimonios(
  ctx: CanvasRenderingContext2D,
  e: Espina,
  frases: readonly Frase[],
  color: Rgb,
  p: TestimonioParams,
  k = 1
): number {
  if (p.tamano < 5) return 0;   // mas chico que esto no es texto, es mugre

  ctx.save();
  ctx.font = `italic ${p.tamano}px ${p.fuente}`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = `rgba(${color.r | 0},${color.g | 0},${color.b | 0},${p.opacity})`;

  // El cursor avanza en pixeles del lienzo sobre el recorrido; la espina se
  // consulta en coordenadas de trabajo, de ahi las dos escalas.
  const largoLienzo = e.largo * k;
  let cursor = p.respiro;
  let escritas = 0;

  for (const frase of frases) {
    const texto = frase.texto.trim();
    if (!texto) continue;
    const ancho = ctx.measureText(texto).width;
    const inicio = Math.max(cursor, frase.s * largoLienzo);
    if (inicio + ancho + p.respiro > largoLienzo) break;

    // El sentido lo decide la direccion media del tramo que va a ocupar la
    // frase, no la del punto donde empieza: sobre la espiral una frase larga
    // gira varios grados y, mirando solo el arranque, terminaba cabeza abajo
    // a mitad de camino.
    const { medio, coherencia } = rumbo(e, inicio, ancho, k);
    // Donde la espiral cierra —el ojo del centro— ninguna orientacion salva
    // a la frase: da la vuelta entera mientras se la escribe. Ese tramo se
    // deja sin texto y se prueba con la frase siguiente, un poco mas lejos.
    if (coherencia < 0.82) {
      cursor = inicio + ancho * 0.4;
      continue;
    }
    const alDerecho = Math.cos(medio) >= 0;
    let avance = 0;
    for (const letra of texto) {
      const ancholetra = ctx.measureText(letra).width;
      // Girado media vuelta, la letra se dibuja hacia atras sobre el
      // recorrido: su ancla es el final del hueco que ocupa, no el principio.
      const d = alDerecho ? inicio + avance : inicio + ancho - avance;
      const punto = enLargo(e, d / k);
      ctx.save();
      ctx.translate(punto.x * k, punto.y * k);
      ctx.rotate(alDerecho ? punto.ang : punto.ang + Math.PI);
      ctx.fillText(letra, 0, 0);
      ctx.restore();
      avance += ancholetra;
    }

    cursor = inicio + ancho + p.respiro;
    escritas++;
  }

  ctx.restore();
  return escritas;
}
