import type { PlacedPoint, RenderOptions, ZoneMap } from '../types';
import { paintPaper } from './paper';
import { ColorRamp } from './palette';
import { drawWatercolorBlob } from './watercolor';
import { zoneClipCanvas } from '../zones/zoneMask';
import { mulberry32, seedFor } from '../sampling/prng';

export interface SceneInput {
  zones: ZoneMap;
  points: PlacedPoint[];
  ramp: ColorRamp;
  options: RenderOptions;
  /** Capa de lineas original del dibujo, ya rasterizada. */
  lines: CanvasImageSource | null;
}

/**
 * Render completo de la escena a `scale` (1 = resolucion de trabajo).
 * Se re-renderiza a mayor resolucion, nunca se escala el bitmap final.
 */
export function renderScene(
  target: HTMLCanvasElement,
  scene: SceneInput,
  scale = 1
): void {
  const { zones, points, ramp, options, lines } = scene;
  const W = Math.round(options.width * scale);
  const H = Math.round(options.height * scale);
  target.width = W;
  target.height = H;
  const ctx = target.getContext('2d')!;

  paintPaper(ctx, W, H, options.grain);

  // Agrupar puntos por zona: cada zona se pinta en su propia capa recortada.
  const byZone = new Map<string, PlacedPoint[]>();
  for (const p of points) {
    const list = byZone.get(p.record.zona);
    if (list) list.push(p);
    else byZone.set(p.record.zona, [p]);
  }

  const wc = { ...options.watercolor, radius: options.watercolor.radius * scale };

  for (const [zoneName, zonePoints] of byZone) {
    const zone = zones.get(zoneName);
    if (!zone || zonePoints.length === 0) continue;

    const clip = zoneClipCanvas(zone, options.bleed, scale);
    const layer = document.createElement('canvas');
    layer.width = clip.canvas.width;
    layer.height = clip.canvas.height;
    const lctx = layer.getContext('2d')!;
    lctx.globalCompositeOperation = 'multiply';

    for (const p of zonePoints) {
      const rng = mulberry32((seedFor(p.record.id, options.globalSeed) ^ 0x5bf03635) >>> 0);
      drawWatercolorBlob(
        lctx,
        p.x * scale - clip.offsetX,
        p.y * scale - clip.offsetY,
        ramp.at(p.t),
        wc,
        rng
      );
    }

    // Recorte con la mascara de la zona (incluye el sangrado configurado).
    lctx.globalCompositeOperation = 'destination-in';
    lctx.drawImage(clip.canvas, 0, 0);

    ctx.globalCompositeOperation = 'multiply';
    ctx.drawImage(layer, clip.offsetX, clip.offsetY);
  }

  // Lineas del dibujo encima de todo.
  if (lines && options.showLines) {
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = options.lineAlpha;
    ctx.drawImage(lines, 0, 0, W, H);
    ctx.globalAlpha = 1;
  }
  ctx.globalCompositeOperation = 'source-over';
}
