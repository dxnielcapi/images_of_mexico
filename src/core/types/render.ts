import type { WatercolorParams } from '../render/watercolor';
import type { TrazoParams } from '../render/trazo';
import type { RamaParams } from '../render/rama';
import type { PinceladaParams } from '../render/pincelada';
import type { TroncoParams } from '../render/tronco';
import type { TestimonioParams } from '../render/testimonios';
import type { RedParams } from '../render/red';
import type { SiluetaParams } from '../render/silueta';

/** Todo lo que define como se ve el mural. Serializable: va al preset. */
export interface RenderOptions {
  width: number;
  height: number;
  watercolor: WatercolorParams;
  /** Como se traza cada registro: el filamento y su punta. */
  trazo: TrazoParams;
  /** La rama de cada registro sobre la espiral. */
  rama: RamaParams;
  /** La pincelada de cada registro sobre las lineas del dibujo. */
  pincelada: PinceladaParams;
  /** El trazo principal que recorre la espiral. */
  tronco: TroncoParams;
  /** Los testimonios escritos dentro del tronco. */
  testimonios: TestimonioParams;
  /** La red de afinidades: como se reparte la gente y como se une. */
  red: RedParams;
  /** El cartel debajo: que tan en fantasma va y cuanto lo entinta la gente. */
  silueta: SiluetaParams;
  grain: number;
  globalSeed: number;
  showLines: boolean;
  lineAlpha: number;
  /**
   * Pintar el fondo de papel bajo la escena. El mural lo apaga para que la
   * figura quede a sangre sobre la pagina, sin el recuadro del lienzo.
   */
  paper?: boolean;
}
