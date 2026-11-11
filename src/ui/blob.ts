/**
 * Mancha de acuarela suelta, para usarla como muestra dentro de la interfaz.
 *
 * Usa el mismo pincel y la misma rampa que pintan el mural: lo que se elige
 * tocando una de estas manchas es, literalmente, el color que va a quedar
 * en la flor.
 */
import type { ColorRamp } from '../render/palette';
import { DEFAULT_WATERCOLOR, drawWatercolorBlob, type WatercolorParams } from '../render/watercolor';
import { hashString, mulberry32 } from '../sampling/prng';

export interface BlobOpts {
  /** Lado del canvas en px CSS. */
  size: number;
  /** Semilla: la misma cadena pinta siempre la misma silueta. */
  seed: string;
  /** Fraccion del medio lado que ocupa el radio base (deja aire al borde). */
  fill?: number;
  params?: Partial<WatercolorParams>;
}

/** Repinta `canvas` con una mancha de color `ramp.at(t)` centrada. */
export function paintBlob(canvas: HTMLCanvasElement, ramp: ColorRamp, t: number, opts: BlobOpts): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const px = Math.max(1, Math.round(opts.size * dpr));
  canvas.width = px;
  canvas.height = px;
  canvas.style.width = `${opts.size}px`;
  canvas.style.height = `${opts.size}px`;

  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, px, px);
  // Igual que en las capas de zona: multiply sobre transparente deja el color.
  ctx.globalCompositeOperation = 'multiply';
  drawWatercolorBlob(
    ctx,
    px / 2,
    px / 2,
    ramp.at(t),
    {
      ...DEFAULT_WATERCOLOR,
      radius: (px / 2) * (opts.fill ?? 0.72),
      layers: 26,
      opacity: 0.05,
      ...opts.params,
    },
    mulberry32(hashString(opts.seed))
  );
}

/** Canvas nuevo ya pintado. */
export function blobCanvas(ramp: ColorRamp, t: number, opts: BlobOpts): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.className = 'blob';
  paintBlob(c, ramp, t, opts);
  return c;
}
