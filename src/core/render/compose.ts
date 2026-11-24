import type { PlacedPoint, RenderOptions } from '../types';
import { paintPaper } from './paper';
import { ColorRamp } from './palette';
import { drawWatercolorBlob } from './watercolor';
import { drawTrazo } from './trazo';
import type { ShapeField } from './field';
import { dibujarRed, type Red } from './red';
import { dibujarSilueta, type Tramos } from './silueta';
import { dibujarFigura, type Figura } from './figura';
import { mulberry32, seedFor } from '../sampling/prng';

export interface SceneInput {
  points: PlacedPoint[];
  ramp: ColorRamp;
  options: RenderOptions;
  /**
   * El campo del dibujo, que le dice a cada marca hacia donde crecer. No
   * recorta: guia. Solo lo usa el reparto de marcas, que es el respaldo
   * cuando no hay red.
   */
  field: ShapeField | null;
  /** Capa de lineas original del dibujo, ya rasterizada. */
  lines: CanvasImageSource | null;
  /**
   * La red de afinidades. Cuando esta, es la escena: la figura la arman los
   * nodos y sus aristas, y no hay pinceladas ni tronco que pintar debajo
   * (ver `@core/render/red`).
   */
  red?: Red | null;
  /**
   * El cartel partido en tramos, cada uno con la tinta que le dio la gente
   * que tiene encima (ver `@core/render/silueta`). Aqui se pinta entero y
   * quieto; en el mural lo va trazando un lapiz que no para
   * (`mural/trazado`), que es la misma medida pintada de a pedazos.
   */
  tramos?: Tramos | null;
  /** La figura que no pinta la gente —el tlacuilo—, ya ubicada. */
  figura?: Figura | null;
  /** Esa figura rasterizada a la escala de este render. */
  laminaFigura?: CanvasImageSource | null;
}

/**
 * Render completo de la escena a `scale` (1 = resolucion de trabajo).
 * Se re-renderiza a mayor resolucion, nunca se escala el bitmap final.
 *
 * Todo va a un mismo lienzo en `multiply` y sin recorte por zona: el boceto
 * no es un molde. El orden es el de un codice: primero el cartel en
 * fantasma, entintado por donde paso la gente (ver `@core/render/silueta`);
 * encima la red, que es el pigmento; y al final el tlacuilo, que no es ni
 * una cosa ni la otra —es quien esta dibujando— y por eso va entero y sin
 * nada por arriba.
 *
 * Sin red se cae al reparto de manchas y mechones, que es el ultimo respaldo
 * si faltaran los archivos horneados que van al lado de la ilustracion.
 */
export function renderScene(
  target: HTMLCanvasElement,
  scene: SceneInput,
  scale = 1
): void {
  const { points, ramp, options, field } = scene;
  const W = Math.round(options.width * scale);
  const H = Math.round(options.height * scale);
  target.width = W;
  target.height = H;
  const ctx = target.getContext('2d')!;

  // Sin papel la escena queda transparente: las manchas y las lineas se
  // componen sobre lo que haya debajo en la pagina. Los `multiply` siguen
  // funcionando —sobre pixel transparente el modo deja pasar el origen tal
  // cual— siempre que la capa de lineas tampoco traiga fondo.
  if (options.paper === false) ctx.clearRect(0, 0, W, H);
  else paintPaper(ctx, W, H, options.grain);

  ctx.globalCompositeOperation = 'multiply';

  // El cartel va debajo de todo: es el lapiz sobre el que se pinta.
  pintarFondoDibujo(ctx, scene, W, H, scale);

  if (scene.red) dibujarRed(ctx, scene.red, ramp, options.red, scale);
  else pintarMarcas(ctx, points, ramp, options, field, scale);

  ctx.globalCompositeOperation = 'source-over';
  // Y el tlacuilo encima: ni la red ni la tinta le pasan por arriba.
  if (scene.figura && scene.laminaFigura) {
    dibujarFigura(ctx, scene.figura, scene.laminaFigura, scale);
  }
}

/**
 * El dibujo debajo de la escena: el cartel con la tinta que le dieron los
 * datos, entero y quieto.
 *
 * Esta es la version sin lapiz —la del fondo del Hero y la del movimiento
 * reducido—; en el mural, los mismos tramos los va pintando `mural/trazado`
 * de a pedazos. La lamina del SVG solo entra si alguien enciende
 * `showLines`, que el mural deja apagado a proposito: con la ilustracion
 * debajo volveria a ser un dibujo coloreado por los datos.
 *
 * Asume `multiply` ya puesto por quien llama.
 */
function pintarFondoDibujo(
  ctx: CanvasRenderingContext2D,
  scene: SceneInput,
  W: number,
  H: number,
  scale: number
): void {
  const { lines, options, tramos } = scene;
  if (lines && options.showLines) {
    ctx.globalAlpha = options.lineAlpha;
    ctx.drawImage(lines, 0, 0, W, H);
    ctx.globalAlpha = 1;
  }
  if (tramos) dibujarSilueta(ctx, tramos, options.silueta, scale);
}

/**
 * El reparto de manchas y mechones: lo que se pinta cuando no hay espiral que
 * seguir ni red que tender: el ultimo respaldo si faltaran los archivos que
 * van al lado de la ilustracion.
 */
function pintarMarcas(
  ctx: CanvasRenderingContext2D,
  points: PlacedPoint[],
  ramp: ColorRamp,
  options: RenderOptions,
  field: ShapeField | null,
  scale: number
): void {
  const wc = {
    ...options.watercolor,
    radius: options.watercolor.radius * scale * options.trazo.raiz,
  };
  for (const p of points) {
    const rng = mulberry32((seedFor(p.record.id, options.globalSeed) ^ 0x5bf03635) >>> 0);
    const color = ramp.at(p.t);
    const x = p.x * scale;
    const y = p.y * scale;
    if (wc.radius >= 1) drawWatercolorBlob(ctx, x, y, color, wc, rng);
    if (field) drawTrazo(ctx, x, y, p.t, color, field, options.trazo, rng, scale);
  }
}
