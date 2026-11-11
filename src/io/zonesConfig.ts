import type { ZonesConfig, ZoneMap } from '../types';

export function buildConfig(
  drawing: string,
  width: number,
  height: number,
  threshold: number,
  dilateRadius: number,
  minArea: number,
  margin: number,
  zones: ZoneMap
): ZonesConfig {
  return {
    drawing,
    width,
    height,
    threshold,
    dilate: dilateRadius,
    minArea,
    margin,
    zones: [...zones.values()].map((z) => ({ name: z.name, seedPoints: z.seedPoints })),
  };
}

export function parseConfig(text: string): ZonesConfig {
  const cfg = JSON.parse(text) as ZonesConfig;
  if (!cfg || !Array.isArray(cfg.zones)) throw new Error('JSON de zonas invalido');
  return cfg;
}

export function downloadText(filename: string, text: string, mime = 'application/json'): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function downloadCanvas(filename: string, canvas: HTMLCanvasElement): void {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'image/png');
}
