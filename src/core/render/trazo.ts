/**
 * El trazo de una persona: como se dibuja un registro.
 *
 * Antes cada registro era una mancha redonda recortada contra su zona, y el
 * dibujo del mural era, literalmente, el boceto relleno. Ahora cada registro
 * es una marca con direccion y largo —un nucleo de pigmento y un filamento que
 * sale de el—, y la silueta aparece por acumulacion: la hace el conjunto de
 * las marcas, no un contorno.
 *
 * El filamento camina sobre el campo del dibujo (`@core/render/field`):
 *
 * - mientras esta adentro, se endereza hacia la direccion del campo. Las
 *   plumas apuntan al borde mas cercano; las hebras corren a lo largo del
 *   cuerpo. Por eso el conjunto sigue siendo la forma del boceto aunque nadie
 *   la recorte: las marcas vecinas comparten el campo y se peinan solas.
 * - al salir, el campo deja de tirar y el filamento sigue con la inercia que
 *   traia mas su propio ruido. Eso es lo que despeina la silueta y lo que
 *   hace que el borde sea del trazo y no del boceto.
 *
 * El largo lo fija el valor del registro, como la altura de una barra: el
 * mapa de calor se sigue leyendo, ahora tambien en la longitud y no solo en
 * el color.
 */
import type { Rgb } from './palette';
import { depthAt, outwardAt, perpendicular, angleOf, type ShapeField } from './field';
import { gaussian, type Rng } from '../sampling/prng';

export interface TrazoParams {
  /** Largo del filamento en px, para el valor mas alto. */
  largo: number;
  /** Cuanto serpentea el filamento (0-1). */
  curva: number;
  /** Fraccion de registros que corren a lo largo del cuerpo (0-1). */
  hebra: number;
  /** Radio del punto en la punta, en px. */
  punta: number;
  /** Opacidad del filamento. */
  opacity: number;
  /** Grosor base del filamento en px. */
  grosor: number;
  /**
   * Filamentos por registro. Una marca no es un pelo sino un mechon: es lo
   * que hace que el conjunto se lea como plumaje y no como confeti. Siguen
   * siendo una persona —misma raiz, misma semilla, mismo color—, igual que
   * una pincelada tiene muchas cerdas y es una sola pincelada.
   */
  cerdas: number;
  /** Apertura del mechon, en radianes. */
  apertura: number;
  /** Tamano del nucleo de pigmento, como factor del radio de mancha (0-1). */
  raiz: number;
}

/**
 * Valores afinados contra la plantilla del mural a su tamano nativo (~2000 px
 * de lado). Las tres medidas en pixeles —largo, grosor y punta— las recalcula
 * el mural segun el dibujo que cargue (ver `trazoParaDibujo`); estas sirven de
 * punto de partida para cualquier dibujo de ese orden.
 */
export const DEFAULT_TRAZO: TrazoParams = {
  largo: 190,
  curva: 0.6,
  hebra: 0.62,
  punta: 6,
  opacity: 0.22,
  grosor: 5.2,
  cerdas: 9,
  apertura: 1,
  raiz: 0.5,
};

/** Diferencia de angulos normalizada a [-PI, PI]. */
function deltaAngulo(a: number, b: number): number {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Recorrido del filamento: una polilinea que arranca en (x,y) y avanza
 * `pasos` veces, dejandose llevar por el campo mientras esta adentro.
 */
function recorrido(
  x: number,
  y: number,
  field: ShapeField,
  largo: number,
  anguloInicial: number,
  aLoLargo: boolean,
  curva: number,
  giroFuera: number,
  rng: Rng,
  scale: number
): number[] {
  const pasos = 18;
  // El campo se consulta en coordenadas de trabajo; el dibujo, en las de
  // salida. Un solo sitio donde se cruza la escala: aqui.
  const avance = largo / pasos;
  const pts: number[] = [x, y];

  let ang = anguloInicial;
  let px = x, py = y;
  for (let i = 0; i < pasos; i++) {
    const fx = px / scale, fy = py / scale;
    const dentro = depthAt(field, fx, fy) > 0;

    if (dentro) {
      const out = outwardAt(field, fx, fy);
      if (out.x !== 0 || out.y !== 0) {
        const guia = aLoLargo ? perpendicular(out) : out;
        let meta = Math.atan2(guia.y, guia.x);
        // La tangente tiene dos sentidos: se toma el que no obliga a
        // darse vuelta, o la hebra iria y volveria en cada paso.
        if (aLoLargo && Math.abs(deltaAngulo(ang, meta)) > Math.PI / 2) meta += Math.PI;
        // Adentro el campo manda, pero de a poco: un giro brusco se nota
        // como un codo y el filamento deja de parecer trazado de un tiron.
        ang += deltaAngulo(ang, meta) * 0.5;
      }
    } else {
      // Afuera no hay campo que seguir. En vez de dejarlo irse derecho —que
      // es lo que mandaba puntas sueltas al centro del anillo y al borde de
      // la hoja— se le da una curvatura constante: el filamento se enrosca
      // como una pluma y la marca se queda cerca del cuerpo del que salio.
      ang += giroFuera;
    }

    ang += gaussian(rng) * curva * (dentro ? 0.1 : 0.14);
    px += Math.cos(ang) * avance;
    py += Math.sin(ang) * avance;
    pts.push(px, py);
  }
  return pts;
}

/** Path2D suavizado por la polilinea, con los puntos medios como anclas. */
function pathDe(pts: number[], hasta: number): Path2D {
  const path = new Path2D();
  path.moveTo(pts[0], pts[1]);
  const n = Math.min(hasta, pts.length / 2);
  for (let i = 1; i < n - 1; i++) {
    const x0 = pts[i * 2], y0 = pts[i * 2 + 1];
    const x1 = pts[i * 2 + 2], y1 = pts[i * 2 + 3];
    path.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
  }
  if (n >= 2) path.lineTo(pts[(n - 1) * 2], pts[(n - 1) * 2 + 1]);
  return path;
}

/**
 * Pinta el filamento y su punta en (x,y). El nucleo de pigmento lo pone quien
 * llama, con el pincel de acuarela de siempre.
 *
 * Asume `globalCompositeOperation = 'multiply'` ya puesto en el contexto.
 */
export function drawTrazo(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  t: number,
  color: Rgb,
  field: ShapeField,
  p: TrazoParams,
  rng: Rng,
  scale = 1
): void {
  // El mechon entero decide una sola vez: si corre a lo largo del cuerpo y
  // en que direccion arranca. Despues cada cerda se abre un poco de ahi.
  const aLoLargo = rng() < p.hebra;
  const out0 = outwardAt(field, x / scale, y / scale);
  let base = angleOf(out0, rng() * Math.PI * 2);
  if (aLoLargo) base += rng() < 0.5 ? Math.PI / 2 : -Math.PI / 2;

  // El valor estira la marca, como la altura de una barra. Las hebras son mas
  // largas que las plumas: una recorre el cuerpo, la otra solo lo abandona.
  const largoBase = p.largo * scale * (0.3 + t) * (aLoLargo ? 1.9 : 1);
  const { r, g, b } = { r: color.r | 0, g: color.g | 0, b: color.b | 0 };
  const grosor = p.grosor * scale;
  const cerdas = Math.max(1, Math.round(p.cerdas));

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (let c = 0; c < cerdas; c++) {
    // Abanico parejo mas un temblor, para que el mechon no quede peinado a
    // compas pero tampoco se desarme.
    const reparto = cerdas === 1 ? 0 : c / (cerdas - 1) - 0.5;
    const ang0 = base + reparto * p.apertura + gaussian(rng) * p.apertura * 0.18;
    // Cerdas desparejas: una o dos largas y el resto cortas es lo que da el
    // perfil de pluma en vez de el de cepillo.
    const largo = largoBase * (0.45 + rng() * rng() * 1.3);
    // Cada cerda se enrosca para su lado, con su propio radio.
    const giroFuera = (rng() < 0.5 ? -1 : 1) * (0.05 + rng() * 0.07) * (0.4 + p.curva);
    const pts = recorrido(x, y, field, largo, ang0, aLoLargo, p.curva, giroFuera, rng, scale);
    const total = pts.length / 2;

    // Dos pasadas en vez de un grosor por segmento: la cerda sale gruesa de
    // la raiz y llega fina a la punta, con dos strokes en lugar de veinte.
    ctx.strokeStyle = `rgba(${r},${g},${b},${p.opacity * 0.5})`;
    ctx.lineWidth = grosor * 0.55;
    ctx.stroke(pathDe(pts, total));

    ctx.strokeStyle = `rgba(${r},${g},${b},${p.opacity})`;
    ctx.lineWidth = grosor * 1.4;
    ctx.stroke(pathDe(pts, Math.max(2, Math.round(total * 0.4))));

    // La punta: el nodo con el que terminan las dos referencias. Es lo que
    // deja el borde granulado en vez de difuminado. Solo en las cerdas
    // largas: en todas, el mechon se vuelve un puñado de bolitas.
    const px = pts[(total - 1) * 2], py = pts[(total - 1) * 2 + 1];
    const radio = p.punta * scale * (0.4 + t * 0.8) * (largo / largoBase > 0.9 ? 1 : 0.45);
    if (radio > 0.25) {
      ctx.fillStyle = `rgba(${r},${g},${b},${Math.min(1, p.opacity * 2.2)})`;
      ctx.beginPath();
      ctx.arc(px, py, radio, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
