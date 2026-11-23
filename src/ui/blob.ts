/**
 * La marca de una persona, suelta, para usarla como muestra en la interfaz.
 *
 * Usa el mismo pincel, el mismo trazo y la misma rampa que pintan el mural:
 * lo que se elige tocando una de estas muestras es, literalmente, la marca
 * que va a quedar en el mural.
 *
 * Lo unico que no puede traer es el dibujo: fuera del mural no hay cuerpo del
 * que salirse, asi que el trazo camina sobre un campo de muestra —un disco—
 * donde "hacia afuera" es simplemente hacia afuera. El mechon sale radial en
 * vez de peinado, y es la unica diferencia con lo que se ve en la serpiente.
 */
import type { ColorRamp } from '@core/render/palette';
import { DEFAULT_WATERCOLOR, drawWatercolorBlob, type WatercolorParams } from '@core/render/watercolor';
import { DEFAULT_TRAZO, drawTrazo, type TrazoParams } from '@core/render/trazo';
import type { ShapeField } from '@core/render/field';
import { hashString, mulberry32 } from '@core/sampling/prng';

/**
 * Campo de muestra: un disco centrado en el canvas. Se memoriza por tamano,
 * que son dos o tres en toda la interfaz.
 */
const campos = new Map<number, ShapeField>();

function campoDisco(px: number): ShapeField {
  const hecho = campos.get(px);
  if (hecho) return hecho;
  const dist = new Float32Array(px * px);
  const c = px / 2;
  const radio = px * 0.3;
  for (let y = 0; y < px; y++) {
    for (let x = 0; x < px; x++) {
      const d = radio - Math.hypot(x - c, y - c);
      dist[y * px + x] = d > 0 ? d : 0;
    }
  }
  const campo = { width: px, height: px, dist };
  campos.set(px, campo);
  return campo;
}

export interface BlobOpts {
  /** Lado del canvas en px CSS. */
  size: number;
  /** Semilla: la misma cadena pinta siempre la misma silueta. */
  seed: string;
  /** Fraccion del medio lado que ocupa el radio base (deja aire al borde). */
  fill?: number;
  params?: Partial<WatercolorParams>;
  /**
   * Dibujar tambien el mechon. Va en la tarjeta del alta, que muestra "tu
   * mancha" y tiene que ser la marca entera. Las muestras de animo no lo
   * llevan: ahi lo que se elige es el color, y nueve mechones de 58 px uno al
   * lado del otro son ruido que no ayuda a decidir.
   */
  mechon?: boolean;
  trazo?: Partial<TrazoParams>;
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
  // Una sola semilla para la mancha y su mechon, como en el mural.
  const rng = mulberry32(hashString(opts.seed));
  // Igual que en las capas de zona: multiply sobre transparente deja el color.
  ctx.globalCompositeOperation = 'multiply';
  drawWatercolorBlob(
    ctx,
    px / 2,
    px / 2,
    ramp.at(t),
    {
      ...DEFAULT_WATERCOLOR,
      // Mas chica y menos dispersa que en el mural, y bastante mas densa: en
      // el mural el color lo hace la suma de muchas manchas superpuestas,
      // mientras que aqui cada muestra esta sola en su recuadro y tiene que
      // leerse entera —y distinguirse de la de al lado, que es el mismo
      // carmin a otra profundidad— sin salirse del canvas.
      radius: (px / 2) * (opts.fill ?? (opts.mechon ? 0.3 : 0.54)),
      layers: 28,
      opacity: 0.062,
      scatter: 0.3,
      ...opts.params,
    },
    rng
  );

  if (!opts.mechon) return;

  // El mechon, con las medidas atadas al recuadro igual que en el mural lo
  // estan al dibujo. Tiene que salirse del nucleo —si no, se lo traga— y
  // caber en el canvas aun en su cerda mas larga, que es unas dos veces y
  // media el largo base.
  drawTrazo(ctx, px / 2, px / 2, t, ramp.at(t), campoDisco(px), {
    ...DEFAULT_TRAZO,
    largo: px * 0.2,
    grosor: Math.max(0.7, px * 0.011),
    punta: Math.max(0.7, px * 0.015),
    opacity: 0.42,
    // En un disco, correr "a lo largo" es girar en redondo: no dice nada.
    hebra: 0,
    ...opts.trazo,
  }, rng);
}
