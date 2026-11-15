import type { Rgb } from './palette';
import type { Rng } from '../sampling/prng';
import { gaussian } from '../sampling/prng';

export interface WatercolorParams {
  /** Radio base de la mancha en px. */
  radius: number;
  /** Numero de capas superpuestas (20-40). */
  layers: number;
  /** Opacidad de cada capa (0.015-0.04). Tenue: el color lo hace la suma. */
  opacity: number;
  /** Nivel de deformacion del contorno (0-1). */
  deform: number;
  /** "Humedad": cuanto se expande y difumina el borde (0-1). */
  wetness: number;
  /** Acumulacion de pigmento en la orilla (0-1). */
  edge: number;
  /** Cuanto se separan las capas entre si (0-1): el aguado de la mancha. */
  scatter: number;
}

/**
 * La mancha de base: aguada y de contorno irregular.
 *
 * `opacity` es deliberadamente baja —la mancha se arma por acumulacion, no
 * por una capa opaca— y `scatter` separa las capas para que ninguna calque a
 * la anterior: eso es lo que la vuelve dispersa en vez de compacta.
 */
export const DEFAULT_WATERCOLOR: WatercolorParams = {
  radius: 14,
  layers: 26,
  opacity: 0.022,
  deform: 0.8,
  wetness: 0.7,
  edge: 0.28,
  scatter: 0.6,
};

type Poly = Float32Array; // [x0,y0,x1,y1,...] relativo al centro

/**
 * Poligono base: circulo de N vertices con el radio y el angulo irregulares.
 * El angulo tambien se corre (no solo el radio) para que no quede el reparto
 * regular del circulo debajo de la deformacion.
 */
function basePolygon(rng: Rng, radius: number, n: number, deform: number): Poly {
  const pts = new Float32Array(n * 2);
  const paso = (Math.PI * 2) / n;
  for (let i = 0; i < n; i++) {
    const a = i * paso + (rng() - 0.5) * paso * 0.8 * deform;
    const r = radius * (1 - 0.45 * deform + rng() * 0.9 * deform);
    pts[i * 2] = Math.cos(a) * r;
    pts[i * 2 + 1] = Math.sin(a) * r;
  }
  return pts;
}

/**
 * Subdivide cada arista insertando su punto medio desplazado con ruido
 * gaussiano perpendicular. La amplitud cae a la mitad en cada nivel, que es
 * lo que da el contorno fractal caracteristico de la acuarela.
 */
function subdivide(poly: Poly, rng: Rng, amplitude: number): Poly {
  const n = poly.length / 2;
  const out = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const x0 = poly[i * 2], y0 = poly[i * 2 + 1];
    const x1 = poly[j * 2], y1 = poly[j * 2 + 1];
    out[i * 4] = x0;
    out[i * 4 + 1] = y0;
    const dx = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    const off = gaussian(rng) * amplitude * len;
    out[i * 4 + 2] = (x0 + x1) / 2 + (-dy / len) * off;
    out[i * 4 + 3] = (y0 + y1) / 2 + (dx / len) * off;
  }
  return out;
}

function deformedPolygon(rng: Rng, radius: number, levels: number, deform: number): Poly {
  const verts = radius < 8 ? 8 : radius < 20 ? 10 : 12;
  let poly = basePolygon(rng, radius, verts, deform);
  let amp = 0.34 * deform;
  for (let l = 0; l < levels; l++) {
    poly = subdivide(poly, rng, amp);
    // Decae mas lento que antes: el detalle fino tambien queda irregular.
    amp *= 0.62;
  }
  return poly;
}

/** Copia del poligono con jitter por vertice y escala: una "variante" de capa. */
function variant(poly: Poly, rng: Rng, jitter: number, scale: number): Path2D {
  const path = new Path2D();
  const n = poly.length / 2;
  for (let i = 0; i < n; i++) {
    const x = poly[i * 2] * scale + gaussian(rng) * jitter;
    const y = poly[i * 2 + 1] * scale + gaussian(rng) * jitter;
    if (i === 0) path.moveTo(x, y);
    else path.lineTo(x, y);
  }
  path.closePath();
  return path;
}

/**
 * Pinta una mancha de acuarela en (x,y).
 * Asume que el contexto ya tiene globalCompositeOperation = 'multiply'.
 */
export function drawWatercolorBlob(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: Rgb,
  p: WatercolorParams,
  rng: Rng
): void {
  const levels = p.radius < 10 ? 3 : p.radius < 24 ? 4 : 5;
  const base = deformedPolygon(rng, p.radius, levels, p.deform);

  // Unas cuantas variantes reutilizadas: el costo esta en construir los paths.
  const variantCount = Math.min(8, Math.max(4, Math.round(p.layers / 4)));
  const jitterBase = p.radius * (0.04 + 0.14 * p.wetness);
  const paths: Path2D[] = [];
  for (let v = 0; v < variantCount; v++) {
    const t = variantCount === 1 ? 0 : v / (variantCount - 1);
    const scale = 0.9 + t * 0.45 * p.wetness;
    paths.push(variant(base, rng, jitterBase * (0.5 + t), scale));
  }

  const { r, g, b } = { r: color.r | 0, g: color.g | 0, b: color.b | 0 };
  // Cuanto se corre cada capa de la siguiente: la mancha deja de ser un
  // monton de siluetas calcadas y pasa a ser pigmento disperso.
  const spread = p.radius * 0.42 * p.scatter;

  ctx.save();
  ctx.translate(x, y);
  // Una sola orientacion por mancha: rotar cada capa al azar promediaria
  // la silueta hasta volverla un disco y se perderia el contorno fractal.
  ctx.rotate(rng() * Math.PI * 2);

  for (let i = 0; i < p.layers; i++) {
    const v = i % variantCount;
    ctx.save();
    ctx.rotate(gaussian(rng) * 0.06 * (0.4 + p.scatter));
    ctx.translate(gaussian(rng) * spread, gaussian(rng) * spread);
    // Cada capa pesa un poco distinto: ninguna orilla queda marcada dos veces
    // en el mismo sitio, y el conjunto se lee aguado en vez de plano.
    const peso = Math.max(0.25, 1 + gaussian(rng) * 0.45 * p.scatter);
    ctx.fillStyle = `rgba(${r},${g},${b},${p.opacity * peso})`;
    ctx.scale(1 + gaussian(rng) * 0.05 * p.scatter, 1 + gaussian(rng) * 0.05 * p.scatter);
    ctx.fill(paths[v]);
    ctx.restore();
  }

  // Borde: pigmento acumulado en la orilla. Tambien se corre con el resto,
  // asi no vuelve a dibujar un contorno nitido sobre una mancha dispersa.
  if (p.edge > 0) {
    ctx.strokeStyle = `rgba(${r},${g},${b},${p.opacity * 1.6 * p.edge})`;
    ctx.lineWidth = Math.max(0.6, p.radius * 0.09);
    ctx.lineJoin = 'round';
    const strokes = Math.max(1, Math.round(4 * p.edge));
    for (let i = 0; i < strokes; i++) {
      ctx.save();
      ctx.rotate(gaussian(rng) * 0.06);
      ctx.translate(gaussian(rng) * spread * 0.6, gaussian(rng) * spread * 0.6);
      ctx.stroke(paths[i % variantCount]);
      ctx.restore();
    }
  }

  ctx.restore();
}
