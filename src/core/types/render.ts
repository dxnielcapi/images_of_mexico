import type { WatercolorParams } from '../render/watercolor';

/** Todo lo que define como se ve el mural. Serializable: va al preset. */
export interface RenderOptions {
  width: number;
  height: number;
  watercolor: WatercolorParams;
  bleed: number;
  grain: number;
  paletteId: string;
  globalSeed: number;
  showLines: boolean;
  lineAlpha: number;
}
