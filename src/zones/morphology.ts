/** Operaciones morfologicas y transformada de distancia sobre mascaras binarias. */

/** Dilata una mascara binaria `radius` pixeles (metrica chebyshev separable). */
export function dilate(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  if (radius <= 0) return mask.slice();
  let src = mask;
  let dst = new Uint8Array(mask.length);
  // Pasada horizontal.
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) {
      let v = 0;
      const x0 = Math.max(0, x - radius), x1 = Math.min(width - 1, x + radius);
      for (let k = x0; k <= x1 && !v; k++) v = src[row + k];
      dst[row + x] = v;
    }
  }
  // Pasada vertical.
  src = dst;
  dst = new Uint8Array(mask.length);
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) {
      let v = 0;
      const y0 = Math.max(0, y - radius), y1 = Math.min(height - 1, y + radius);
      for (let k = y0; k <= y1 && !v; k++) v = src[k * width + x];
      dst[y * width + x] = v;
    }
  }
  return dst;
}

/**
 * Transformada de distancia euclidiana exacta (Felzenszwalb & Huttenlocher)
 * desde cada pixel de fondo hasta la tinta mas cercana.
 */
export function distanceToInk(ink: Uint8Array, width: number, height: number): Float32Array {
  const INF = 1e20;
  const f = new Float32Array(Math.max(width, height));
  const d = new Float32Array(Math.max(width, height));
  const v = new Int32Array(Math.max(width, height));
  const z = new Float32Array(Math.max(width, height) + 1);
  const out = new Float32Array(width * height);

  for (let i = 0; i < out.length; i++) out[i] = ink[i] ? 0 : INF;

  const edt1d = (n: number) => {
    let k = 0;
    v[0] = 0;
    z[0] = -INF;
    z[1] = INF;
    for (let q = 1; q < n; q++) {
      let s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      while (s <= z[k]) {
        k--;
        s = (f[q] + q * q - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
      }
      k++;
      v[k] = q;
      z[k] = s;
      z[k + 1] = INF;
    }
    k = 0;
    for (let q = 0; q < n; q++) {
      while (z[k + 1] < q) k++;
      const dx = q - v[k];
      d[q] = dx * dx + f[v[k]];
    }
  };

  // Columnas.
  for (let x = 0; x < width; x++) {
    for (let y = 0; y < height; y++) f[y] = out[y * width + x];
    edt1d(height);
    for (let y = 0; y < height; y++) out[y * width + x] = d[y];
  }
  // Filas.
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) f[x] = out[row + x];
    edt1d(width);
    for (let x = 0; x < width; x++) out[row + x] = Math.sqrt(d[x]);
  }
  return out;
}
