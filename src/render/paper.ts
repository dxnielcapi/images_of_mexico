import { mulberry32 } from '../sampling/prng';

export const PAPER_COLOR = '#FAF6EE';

let grainTile: HTMLCanvasElement | null = null;

/** Baldosa de grano reutilizable: ruido monocromo muy sutil. */
function makeGrainTile(size = 256): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(size, size);
  const rng = mulberry32(0x9e3779b9);
  for (let i = 0; i < size * size; i++) {
    const n = (rng() - 0.5) * 2;
    const v = 128 + n * 18;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 26;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/** Pinta el fondo de papel: color crema + grano. */
export function paintPaper(ctx: CanvasRenderingContext2D, w: number, h: number, grain: number): void {
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = PAPER_COLOR;
  ctx.fillRect(0, 0, w, h);
  if (grain > 0) {
    if (!grainTile) grainTile = makeGrainTile();
    const pattern = ctx.createPattern(grainTile, 'repeat');
    if (pattern) {
      ctx.globalAlpha = grain;
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, w, h);
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();
}
