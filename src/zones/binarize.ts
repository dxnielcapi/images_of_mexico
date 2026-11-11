/**
 * Binarizacion: separa las lineas del dibujo (tinta) del fondo.
 * Devuelve una mascara con 1 = tinta, 0 = fondo.
 */
export function binarize(image: ImageData, threshold: number): Uint8Array {
  const { data, width, height } = image;
  const ink = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < ink.length; i++, p += 4) {
    const alpha = data[p + 3];
    // Pixel transparente = fondo (papel).
    if (alpha < 16) continue;
    const lum = 0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2];
    // Mezcla sobre blanco para respetar el canal alfa de PNG/SVG.
    const over = lum * (alpha / 255) + 255 * (1 - alpha / 255);
    if (over < threshold) ink[i] = 1;
  }
  return ink;
}
