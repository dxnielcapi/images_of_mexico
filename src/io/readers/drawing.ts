/** Carga y rasterizacion del dibujo de lineas (PNG, JPG o SVG). */

export interface LoadedDrawing {
  name: string;
  /** Canvas de trabajo (lado mayor <= maxSide, proporcion conservada). */
  canvas: HTMLCanvasElement;
  imageData: ImageData;
  width: number;
  height: number;
  /** Fuente original, para re-rasterizar al exportar en alta resolucion. */
  source: HTMLImageElement;
  /** Texto del SVG si el archivo lo era, para ofrecer usar sus paths. */
  svgText: string | null;
}

export const MAX_SIDE = 2000;

export async function loadDrawingFile(file: File, maxSide = MAX_SIDE): Promise<LoadedDrawing> {
  const isSvg = file.type === 'image/svg+xml' || /\.svg$/i.test(file.name);
  const text = isSvg ? await file.text() : null;
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url);
    return rasterize(img, file.name, text, maxSide);
  } finally {
    // La imagen ya esta decodificada; el blob puede liberarse.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

export async function loadDrawingUrl(url: string, maxSide = MAX_SIDE): Promise<LoadedDrawing> {
  const isSvg = /\.svg(\?|$)/i.test(url);
  const text = isSvg ? await fetch(url).then((r) => r.text()) : null;
  const img = await loadImage(url);
  const name = url.split('/').pop() || 'dibujo';
  return rasterize(img, name, text, maxSide);
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`No se pudo cargar la imagen: ${src}`));
    img.src = src;
  });
}

function rasterize(
  img: HTMLImageElement,
  name: string,
  svgText: string | null,
  maxSide: number
): LoadedDrawing {
  const natW = img.naturalWidth || 1000;
  const natH = img.naturalHeight || 1000;
  const scale = Math.min(1, maxSide / Math.max(natW, natH));
  const width = Math.max(1, Math.round(natW * scale));
  const height = Math.max(1, Math.round(natH * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, width, height);

  return {
    name,
    canvas,
    imageData: ctx.getImageData(0, 0, width, height),
    width,
    height,
    source: img,
    svgText,
  };
}

/**
 * Capa de lineas, lista para componer en multiply.
 *
 * El fondo blanco es neutro para el multiply y le da base a los PNG/JPG, que
 * no tienen alfa. Con `fondo: false` la capa queda transparente: hace falta
 * cuando la escena tampoco lleva papel (el mural a sangre), porque sobre un
 * lienzo transparente el multiply pintaria ese blanco como un recuadro.
 */
export function linesLayer(
  drawing: LoadedDrawing,
  width: number,
  height: number,
  fondo = true
): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  const ctx = c.getContext('2d')!;
  if (fondo) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
  }
  ctx.drawImage(drawing.source, 0, 0, width, height);
  return c;
}
