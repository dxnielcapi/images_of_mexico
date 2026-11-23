/**
 * El tronco: la espiral pintada, el trazo del que salen todas las ramas.
 *
 * Es el unico trazo que no pertenece a nadie en particular y, sin embargo, es
 * el que mas dice: recorre la espiral de la cabeza al centro y su carga de
 * pigmento es la densidad de registros de ese tramo. Donde se junto mucha
 * gente el cuerpo va oscuro y ancho; donde todavia no paso casi nadie queda
 * un aguado palido. Dicho de otro modo, el mapa de calor se lee dos veces: en
 * las ramas (una por persona) y en el cuerpo que las sostiene.
 *
 * Se pinta por tramos y no de una sola pasada porque el color cambia a lo
 * largo del recorrido; los tramos se superponen un punto para que no quede la
 * juntura a la vista.
 */
import { type Espina } from './espina';
import type { ColorRamp } from './palette';
import { gaussian, type Rng } from '../sampling/prng';

export interface TroncoParams {
  /** Semiancho minimo del cuerpo, en px de trabajo. */
  anchoMin: number;
  /** Cuanto suma la densidad al ancho medido, en px de trabajo. */
  anchoDato: number;
  /** Opacidad de cada pasada. */
  opacity: number;
  /** Pasadas de pigmento. */
  capas: number;
}

export const DEFAULT_TRONCO: TroncoParams = {
  anchoMin: 11,
  anchoDato: 16,
  opacity: 0.085,
  capas: 5,
};

/** Puntos de espina por tramo pintado. */
const TRAMO = 14;

/**
 * Semiancho del cuerpo en el punto `i`: lo que mide la banda del dibujo ahi,
 * con un piso para que la espiral interior —que en el boceto es una linea
 * sola de 4 px— tenga cuerpo donde escribir, y un extra por la densidad de
 * registros del tramo.
 */
function anchoEn(e: Espina, i: number, densidad: number, p: TroncoParams): number {
  const medido = Math.min(e.ws[i], p.anchoMin * 2.6);
  return Math.max(p.anchoMin, medido) + densidad * p.anchoDato;
}

/** El contorno de un tramo: ida por un lado del eje y vuelta por el otro. */
function contornoTramo(
  e: Espina,
  desde: number,
  hasta: number,
  densidad: number,
  p: TroncoParams,
  rng: Rng,
  temblor: number,
  escala: number,
  k: number
): Path2D {
  const izq: number[] = [];
  const der: number[] = [];
  for (let i = desde; i <= hasta; i++) {
    const j = i < e.xs.length - 1 ? i + 1 : i - 1;
    const s = i < e.xs.length - 1 ? 1 : -1;
    const dx = (e.xs[j] - e.xs[i]) * s;
    const dy = (e.ys[j] - e.ys[i]) * s;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;
    const w = anchoEn(e, i, densidad, p) * escala * (1 + gaussian(rng) * temblor) * k;
    izq.push(e.xs[i] * k + nx * w, e.ys[i] * k + ny * w);
    der.push(e.xs[i] * k - nx * w, e.ys[i] * k - ny * w);
  }

  const n = izq.length / 2;
  const path = new Path2D();
  path.moveTo(izq[0], izq[1]);
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

/**
 * Pinta la espiral entera. `densidad(s)` devuelve en [0,1] cuanta gente hay
 * alrededor de ese punto del recorrido; es lo que decide el color y el
 * cuerpo del trazo.
 *
 * Asume `globalCompositeOperation = 'multiply'` ya puesto en el contexto.
 */
export function pintarTronco(
  ctx: CanvasRenderingContext2D,
  e: Espina,
  ramp: ColorRamp,
  densidad: (s: number) => number,
  p: TroncoParams,
  rng: Rng,
  k = 1
): void {
  const n = e.xs.length;
  const capas = Math.max(1, Math.round(p.capas));

  for (let desde = 0; desde < n - 1; desde += TRAMO) {
    const hasta = Math.min(n - 1, desde + TRAMO);
    const s = (e.acum[(desde + hasta) >> 1]) / e.largo;
    const d = densidad(s);
    // El tono sube con la densidad pero nunca llega al carmin mas cerrado:
    // ese queda para las ramas, que son las que tienen que destacarse.
    const color = ramp.at(0.18 + d * 0.62);
    const { r, g, b } = { r: color.r | 0, g: color.g | 0, b: color.b | 0 };

    for (let c = 0; c < capas; c++) {
      const f = c / Math.max(1, capas - 1);
      const escala = 1.12 - f * 0.5;
      const alfa = p.opacity * (0.55 + f * 0.85) * (0.45 + d * 0.75);
      ctx.fillStyle = `rgba(${r},${g},${b},${alfa})`;
      ctx.fill(contornoTramo(e, desde, hasta, d, p, rng, 0.08 + f * 0.16, escala, k));
    }

    // La orilla cargada, mas marcada donde hay mas gente.
    ctx.strokeStyle = `rgba(${r},${g},${b},${p.opacity * (0.5 + d * 1.1)})`;
    ctx.lineWidth = Math.max(0.5, p.anchoMin * k * 0.16);
    ctx.lineJoin = 'round';
    ctx.stroke(contornoTramo(e, desde, hasta, d, p, rng, 0.05, 1, k));
  }
}
