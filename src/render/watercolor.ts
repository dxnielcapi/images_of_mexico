import type { Rgb } from './palette';
import type { Rng } from '../sampling/prng';
import { gaussian } from '../sampling/prng';

export interface WatercolorParams {
  /** Radio base de la mancha en px. */
  radius: number;
  /** Numero de capas superpuestas (20-40). */
  layers: number;
  /** Opacidad de cada capa (0.03-0.06). */
  opacity: number;
  /** Nivel de deformacion del contorno (0-1). */
  deform: number;
  /** "Humedad": cuanto se expande y difumina el borde (0-1). */
  wetness: number;
  /** Acumulacion de pigmento en la orilla (0-1). */
  edge: number;
}

export const DEFAULT_WATERCOLOR: WatercolorParams = {
  radius: 14,
  layers: 24,
  opacity: 0.04,
  deform: 0.5,
  wetness: 0.45,
  edge: 0.5,
};

type Poly = Float32Array; // [x0,y0,x1,y1,...] relativo al centro

/** Poligono base: circulo de N vertices con radio ligeramente irregular. */
function basePolygon(rng: Rng, radius: number, n: number): Poly {
  const pts = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const r = radius * (0.85 + rng() * 0.3);
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
  let poly = basePolygon(rng, radius, verts);
  let amp = 0.28 * deform;
  for (let l = 0; l < levels; l++) {
    poly = subdivide(poly, rng, amp);
    amp *= 0.55;
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

  // Unas pocas variantes reutilizadas: el costo esta en construir los paths.
  const variantCount = Math.min(6, Math.max(3, Math.round(p.layers / 5)));
  const jitterBase = p.radius * (0.03 + 0.1 * p.wetness);
  const paths: Path2D[] = [];
  for (let v = 0; v < variantCount; v++) {
    const t = variantCount === 1 ? 0 : v / (variantCount - 1);
    const scale = 1 + t * 0.3 * p.wetness - 0.06;
    paths.push(variant(base, rng, jitterBase * (0.5 + t), scale));
  }

  const fill = `rgba(${color.r | 0},${color.g | 0},${color.b | 0},${p.opacity})`;
  ctx.save();
  ctx.translate(x, y);
  // Una sola orientacion por mancha: rotar cada capa al azar promediaria
  // la silueta hasta volverla un disco y se perderia el contorno fractal.
  ctx.rotate(rng() * Math.PI * 2);
  ctx.fillStyle = fill;

  for (let i = 0; i < p.layers; i++) {
    const v = i % variantCount;
    // Giro y desplazamiento minimos para que las capas no se calquen.
    ctx.save();
    ctx.rotate(gaussian(rng) * 0.05);
    ctx.translate(gaussian(rng) * jitterBase * 0.45, gaussian(rng) * jitterBase * 0.45);
    ctx.fill(paths[v]);
    ctx.restore();
  }

  // Borde: pigmento acumulado en la orilla.
  if (p.edge > 0) {
    ctx.strokeStyle = `rgba(${color.r | 0},${color.g | 0},${color.b | 0},${p.opacity * 1.6 * p.edge})`;
    ctx.lineWidth = Math.max(0.6, p.radius * 0.09);
    ctx.lineJoin = 'round';
    const strokes = Math.max(1, Math.round(4 * p.edge));
    for (let i = 0; i < strokes; i++) {
      ctx.save();
      ctx.rotate(gaussian(rng) * 0.05);
      ctx.stroke(paths[i % variantCount]);
      ctx.restore();
    }
  }

  ctx.restore();
}
