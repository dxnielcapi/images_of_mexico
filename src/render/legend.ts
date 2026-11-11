import type { ColorRamp } from './palette';
import { mulberry32, gaussian } from '../sampling/prng';

/**
 * Leyenda: el gradiente se pinta como una pincelada de acuarela,
 * no como una barra rectangular.
 */
export function drawLegend(
  ctx: CanvasRenderingContext2D,
  ramp: ColorRamp,
  x: number, y: number, w: number, h: number,
  minLabel: string, maxLabel: string,
  title = 'valor'
): void {
  const rng = mulberry32(0x1e6e4d);
  ctx.save();
  ctx.clearRect(x - 4, y - 18, w + 8, h + 46);

  // Contorno irregular de la pincelada.
  const steps = 60;
  const top: number[] = [];
  const bottom: number[] = [];
  for (let i = 0; i <= steps; i++) {
    top.push(y + gaussian(rng) * h * 0.07 + h * 0.05);
    bottom.push(y + h - gaussian(rng) * h * 0.07 - h * 0.05);
  }

  for (let i = 0; i < steps; i++) {
    const t0 = i / steps;
    const t1 = (i + 1) / steps;
    const x0 = x + t0 * w;
    const x1 = x + t1 * w + 0.6;
    // Varias pasadas translucidas para el look de pigmento.
    for (let k = 0; k < 5; k++) {
      ctx.fillStyle = ramp.rgbaAt((t0 + t1) / 2, 0.3);
      ctx.beginPath();
      ctx.moveTo(x0, top[i] + gaussian(rng) * 1.2);
      ctx.lineTo(x1, top[i + 1] + gaussian(rng) * 1.2);
      ctx.lineTo(x1, bottom[i + 1] + gaussian(rng) * 1.2);
      ctx.lineTo(x0, bottom[i] + gaussian(rng) * 1.2);
      ctx.closePath();
      ctx.fill();
    }
  }

  ctx.fillStyle = '#4a4036';
  ctx.font = '11px ui-sans-serif, system-ui, sans-serif';
  ctx.textBaseline = 'top';
  ctx.fillText(minLabel, x, y + h + 6);
  ctx.textAlign = 'right';
  ctx.fillText(maxLabel, x + w, y + h + 6);
  ctx.textAlign = 'left';
  ctx.fillStyle = '#7a6a58';
  ctx.textBaseline = 'bottom';
  ctx.fillText(title, x, y - 4);
  ctx.restore();
}
