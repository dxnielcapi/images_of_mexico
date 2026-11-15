import type { WatercolorParams } from '../render/watercolor';

/** Todo lo que define como se ve el mural. Serializable: va al preset. */
export interface RenderOptions {
  width: number;
  height: number;
  watercolor: WatercolorParams;
  bleed: number;
  grain: number;
  globalSeed: number;
  showLines: boolean;
  lineAlpha: number;
  /**
   * Pintar el fondo de papel bajo la escena. Por defecto si (el studio
   * exporta una lamina acabada); el mural lo apaga para que la ilustracion
   * quede a sangre sobre la pagina, sin el recuadro del lienzo.
   */
  paper?: boolean;
}
