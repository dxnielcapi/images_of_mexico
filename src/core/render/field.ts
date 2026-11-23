/**
 * El campo del dibujo: lo que el trazo usa para saber hacia donde crecer.
 *
 * El boceto deja de ser un molde que recorta y pasa a ser una guia. De el se
 * conserva una sola cosa, la profundidad de cada pixel —cuanto dista del borde
 * de lo pintable, que es justo lo que `analyzeDrawing` ya calcula—, y de ahi
 * salen las dos direcciones que necesita cualquier marca:
 *
 * - **afuera**: contra el gradiente de la profundidad, o sea hacia el borde
 *   mas cercano y, si el trazo sigue, a cruzarlo. Es la que despeina la
 *   silueta.
 * - **a lo largo**: perpendicular a la anterior, la que corre paralela al
 *   cuerpo. Es la que hace que muchas hebras vecinas se peinen solas en el
 *   mismo sentido, sin que nadie las agrupe.
 *
 * Ninguna de las dos recorta nada: una marca puede salirse del dibujo, y ese
 * es el punto.
 */

export interface ShapeField {
  width: number;
  height: number;
  /** Profundidad por pixel: 0 fuera de lo pintable, creciente hacia adentro. */
  dist: Float32Array;
}

export interface Vec {
  x: number;
  y: number;
}

/** Profundidad interpolada en (x,y). Fuera del lienzo, 0. */
export function depthAt(f: ShapeField, x: number, y: number): number {
  const { width: w, height: h, dist } = f;
  if (x < 0 || y < 0 || x > w - 1 || y > h - 1) return 0;
  const x0 = x | 0, y0 = y | 0;
  const x1 = x0 + 1 < w ? x0 + 1 : x0;
  const y1 = y0 + 1 < h ? y0 + 1 : y0;
  const fx = x - x0, fy = y - y0;
  const a = dist[y0 * w + x0], b = dist[y0 * w + x1];
  const c = dist[y1 * w + x0], d = dist[y1 * w + x1];
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}

/**
 * Direccion hacia el borde mas cercano, normalizada.
 *
 * El gradiente se mide con un stencil ancho (`paso`) en vez de con pixeles
 * contiguos: la transformada de distancia es escalonada de cerca, y con
 * diferencias de un pixel el campo tiembla. En el eje medio de una region el
 * gradiente se anula —ahi "afuera" no significa nada, hay dos bordes igual de
 * cerca— y entonces se devuelve el vector nulo: quien llame decide.
 */
export function outwardAt(f: ShapeField, x: number, y: number, paso = 2): Vec {
  const gx = depthAt(f, x + paso, y) - depthAt(f, x - paso, y);
  const gy = depthAt(f, x, y + paso) - depthAt(f, x, y - paso);
  // Contra el gradiente: la profundidad baja hacia el borde.
  const len = Math.hypot(gx, gy);
  if (len < 1e-4) return { x: 0, y: 0 };
  return { x: -gx / len, y: -gy / len };
}

/** Gira un vector 90 grados: de "hacia el borde" a "a lo largo del cuerpo". */
export function perpendicular(v: Vec): Vec {
  return { x: -v.y, y: v.x };
}

/** Angulo de un vector, o `fallback` si es nulo. */
export function angleOf(v: Vec, fallback: number): number {
  return v.x === 0 && v.y === 0 ? fallback : Math.atan2(v.y, v.x);
}
