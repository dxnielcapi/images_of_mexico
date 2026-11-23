import type { PlacedPoint, RenderOptions } from '../types';
import { paintPaper } from './paper';
import { ColorRamp } from './palette';
import { drawWatercolorBlob } from './watercolor';
import { drawTrazo } from './trazo';
import { pintarRama, type Rama } from './rama';
import { pintarTronco } from './tronco';
import { escribirTestimonios, type Frase } from './testimonios';
import type { Espina } from './espina';
import type { Boceto } from './boceto';
import type { ShapeField } from './field';
import { dibujarRed, type Red } from './red';
import { mulberry32, seedFor } from '../sampling/prng';

export interface SceneInput {
  points: PlacedPoint[];
  ramp: ColorRamp;
  options: RenderOptions;
  /**
   * El campo del dibujo, que le dice a cada marca hacia donde crecer. No
   * recorta: guia. Solo lo usa el pintado sin espina.
   */
  field: ShapeField | null;
  /** Capa de lineas original del dibujo, ya rasterizada. */
  lines: CanvasImageSource | null;
  /**
   * La espiral del dibujo. Es lo que usa el camino anterior —una rama por
   * persona y los testimonios sobre el recorrido— cuando no hay red que
   * pintar. Sin ninguna de las dos se cae al reparto de manchas y mechones.
   */
  espina?: Espina | null;
  /**
   * Las lineas del dibujo, si la figura la trazan los datos. Cuando estan,
   * cada rama es la pincelada de alguien sobre una de esas lineas y no hay
   * nada mas que pintar: el tronco sobraria, porque el cuerpo de la
   * serpiente ya lo estan dibujando las pinceladas (ver
   * `@core/render/pincelada`).
   */
  boceto?: Boceto | null;
  /** Las ramas ya resueltas, una por registro (ver `@core/render/rama`). */
  ramas?: readonly Rama[] | null;
  /**
   * La red de afinidades. Cuando esta, es la escena: la figura la arman los
   * nodos y sus aristas, y no hay pinceladas ni tronco que pintar debajo
   * (ver `@core/render/red`).
   */
  red?: Red | null;
  /** Las frases que van escritas sobre el tronco, en orden de recorrido. */
  testimonios?: readonly Frase[] | null;
}

/** Bins del perfil de densidad a lo largo del recorrido. */
const BINS = 72;

/**
 * Cuanta gente hay en cada tramo del recorrido, normalizado a [0,1].
 *
 * Es lo que carga de pigmento al tronco: el cuerpo de la serpiente va oscuro
 * donde se junto mucha gente y lavado donde todavia no paso casi nadie. El
 * perfil se suaviza con sus vecinos para que el trazo no vaya a saltos.
 */
function perfilDensidad(ramas: readonly Rama[]): (s: number) => number {
  const bins = new Float32Array(BINS);
  for (const r of ramas) {
    const i = Math.min(BINS - 1, Math.max(0, Math.floor(r.s * BINS)));
    bins[i]++;
  }
  const suave = new Float32Array(BINS);
  for (let i = 0; i < BINS; i++) {
    const a = bins[Math.max(0, i - 1)], b = bins[i], c = bins[Math.min(BINS - 1, i + 1)];
    suave[i] = (a + b * 2 + c) / 4;
  }
  let max = 0;
  for (const v of suave) if (v > max) max = v;
  if (max <= 0) return () => 0;
  return (s: number) => suave[Math.min(BINS - 1, Math.max(0, Math.floor(s * BINS)))] / max;
}

/**
 * Render completo de la escena a `scale` (1 = resolucion de trabajo).
 * Se re-renderiza a mayor resolucion, nunca se escala el bitmap final.
 *
 * Todo va a un mismo lienzo en `multiply` y sin recorte por zona: el boceto
 * no es un molde. Con red, la escena son los nodos y sus aristas y no hay
 * nada mas debajo. Sin ella queda el mural anterior: con espina el orden es
 * el de una pintura —primero el cuerpo, despues las ramas, al final la
 * escritura y las lineas—, y las ramas se pintan de la mas lavada a la mas
 * cargada para que las fuertes queden encima.
 */
export function renderScene(
  target: HTMLCanvasElement,
  scene: SceneInput,
  scale = 1
): void {
  const { points, ramp, options, lines, field, espina } = scene;
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

  if (scene.red) dibujarRed(ctx, scene.red, ramp, options.red, scale);
  else if (espina) pintarMural(ctx, scene, espina, scale);
  else pintarMarcas(ctx, points, ramp, options, field, scale);

  // Lineas del dibujo encima de todo.
  if (lines && options.showLines) {
    ctx.globalAlpha = options.lineAlpha;
    ctx.drawImage(lines, 0, 0, W, H);
    ctx.globalAlpha = 1;
  }
  ctx.globalCompositeOperation = 'source-over';
}

/**
 * El mural: las pinceladas de la gente y los testimonios.
 *
 * Con las lineas del dibujo cargadas (`boceto`), la figura entera son esas
 * pinceladas. Sin ellas se pinta el mural de antes: el tronco de la espiral
 * con las ramas saliendo de el.
 */
function pintarMural(
  ctx: CanvasRenderingContext2D,
  scene: SceneInput,
  espina: Espina,
  scale: number
): void {
  const { ramp, options } = scene;
  const ramas = scene.ramas ?? [];

  // El tronco lleva su propia semilla, estable: el temblor de su contorno no
  // depende de cuanta gente haya ni de quien se acabe de registrar.
  if (!scene.boceto) {
    pintarTronco(
      ctx, espina, ramp, perfilDensidad(ramas), options.tronco,
      mulberry32((options.globalSeed ^ 0x1f123bb5) >>> 0), scale
    );
  }

  // De la mas lavada a la mas cargada: las ramas fuertes terminan arriba.
  const orden = [...ramas].sort((a, b) => a.punto.t - b.punto.t);
  for (const rama of orden) pintarRamaDe(ctx, rama, ramp, options, scale, !scene.boceto);

  const frases = scene.testimonios ?? [];
  if (frases.length > 0) {
    escribirTestimonios(ctx, espina, frases, ramp.at(0.98), options.testimonios, scale);
  }
}

/**
 * Una rama con el pincel de la escena: su semilla, su color y, si se pide, el
 * nucleo de pigmento de la raiz.
 *
 * Esta suelta porque el mural no siempre pinta la escena entera de una vez:
 * cuando la va pintando pincelada a pincelada (ver `mural/pintado.ts`) cada
 * una entra por aqui, y tiene que salir identica a como habria salido en el
 * render completo. Misma semilla, misma marca.
 *
 * Asume `globalCompositeOperation = 'multiply'` ya puesto. `scale` lleva de
 * coordenadas de trabajo a las del lienzo.
 */
export function pintarRamaDe(
  ctx: CanvasRenderingContext2D,
  rama: Rama,
  ramp: ColorRamp,
  options: RenderOptions,
  scale = 1,
  nucleo = false
): void {
  const p = rama.punto;
  // Una sola semilla por registro, como siempre: la marca entera es estable y
  // agregar gente no redibuja a nadie.
  const rng = mulberry32((seedFor(p.record.id, options.globalSeed) ^ 0x5bf03635) >>> 0);
  const color = ramp.at(p.t);
  pintarRama(ctx, rama, color, options.rama, rng, scale);
  if (!nucleo) return;

  // El nucleo de pigmento en la raiz: el punto donde el pincel toco el cuerpo
  // antes de arrastrar. Solo en las ramas con valor, o el tronco se empasta de
  // nudos. Las pinceladas sobre el dibujo no lo llevan: ahi la raiz no es el
  // nacimiento de nada, es por donde entro el pincel.
  const radio = options.watercolor.radius * options.trazo.raiz * (0.35 + p.t) * scale;
  if (radio >= 1.2) {
    drawWatercolorBlob(ctx, rama.eje[0] * scale, rama.eje[1] * scale, color,
      { ...options.watercolor, radius: radio }, rng);
  }
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
