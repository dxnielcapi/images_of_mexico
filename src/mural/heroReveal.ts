/**
 * Trazado animado de la ilustracion del Hero, en bucle.
 *
 * El ciclo imita a quien dibuja y despues levanta la hoja: unos pinceles
 * trazan las lineas siguiendo el dibujo en orden aleatorio, el color se abre
 * detras como una aguada, la imagen se queda un momento entera, el color se
 * retira y las mismas lineas se van borrando hasta dejar el papel limpio.
 * Ninguna fase corta a la anterior: cada una arranca desde donde quedo, asi
 * que no se ve el salto de un reinicio.
 *
 * No toca la escena renderizada ni el motor de acuarela: pinta aparte una
 * mascara a baja resolucion (va desenfocada bajo el velo de cristal, no hace
 * falta mas) y la usa para tapar con color papel lo que todavia no esta ahi.
 */
import { createSurfaceCtx } from '@core/platform/surface';
import { PAPER_COLOR } from '@core/render/paper';
import { mulberry32, type Rng } from '@core/sampling/prng';

/** Lado mayor de la mascara, en pixeles. */
const MASK_SIDE = 480;
/** Luminancia por debajo de la cual un pixel del dibujo cuenta como tinta. */
const INK_LUMA = 170;
/** Separacion de la rejilla de muestreo, en pixeles de mascara. */
const STEP = 3;
/** Puntos que como mucho encadena un mismo trazo. */
const STROKE_MAX = 24;
/** Pinceles que avanzan a la vez, cada uno por su zona del dibujo. */
const BRUSHES = 6;
/** Grosor del pincel sobre la mascara. */
const BRUSH_W = 7;
/** Lo que opaca el borrador en cada pasada: menos de 1 para que no corte. */
const ERASER_ALPHA = 0.75;

/** Duracion de cada fase del ciclo, en ms. */
const DRAW_MS = 2600;    // se trazan las lineas
const WASH_MS = 800;     // entra el color
const HOLD_MS = 1500;    // el dibujo, entero
const DRY_MS = 800;      // se retira el color
const ERASE_MS = 2000;   // se borran las lineas
const REST_MS = 500;     // papel en blanco

type Phase = 'draw' | 'wash' | 'hold' | 'dry' | 'erase' | 'rest';

export interface HeroReveal {
  /** Compone `scene` en `ctx` segun el momento del ciclo. */
  paint(ctx: CanvasRenderingContext2D, scene: CanvasImageSource): void;
  /** Arranca el bucle, o lo reanuda donde se quedo. */
  play(): void;
  /** Lo deja quieto (p. ej. con el Hero fuera de pantalla). */
  pause(): void;
  /** `true` mientras el bucle este corriendo. */
  readonly running: boolean;
}

interface Pt { x: number; y: number }

/** Un pincel: por que trazo va y por que punto de el. */
interface Brush { stroke: number; at: number }

/**
 * Prepara el trazado del dibujo ya cargado. `onFrame` se llama en cada
 * fotograma para que quien lo use vuelva a componer su lienzo.
 */
export function createHeroReveal(img: ImageData, onFrame: () => void): HeroReveal {
  const scale = MASK_SIDE / Math.max(img.width, img.height);
  const mw = Math.max(1, Math.round(img.width * scale));
  const mh = Math.max(1, Math.round(img.height * scale));
  const { canvas: mask, ctx: mctx } = createSurfaceCtx(mw, mh);
  const { canvas: cover, ctx: cctx } = createSurfaceCtx(mw, mh);

  const strokes = traceStrokes(img, scale, mw, mh);
  const total = Math.max(1, strokes.reduce((n, s) => n + s.length, 0));
  // Cada vuelta baraja de nuevo: el dibujo nunca se traza dos veces igual.
  const rng = mulberry32(0x5e17ca11);

  let phase: Phase = 'rest';
  let left = 0;          // ms que le quedan a la fase por tiempo
  let order: number[] = [];
  let brushes: Brush[] = [];
  let next = 0;          // proximo trazo del orden sin repartir
  let steps = 0;         // puntos ya tocados en esta fase
  let carry = 0;         // resto fraccionario de puntos por repartir
  let veil = 1;          // cuanto tapa el papel: 1 = solo lo trazado, 0 = todo
  let raf = 0;
  let last = 0;
  let idle = true;       // sin bucle en marcha

  // ------------------------------------------------------------- las fases

  function drawStyle(): void {
    mctx.globalCompositeOperation = 'source-over';
    mctx.fillStyle = '#fff';
    mctx.strokeStyle = '#fff';
    mctx.lineWidth = BRUSH_W;
    mctx.lineCap = 'round';
    mctx.lineJoin = 'round';
  }

  function eraseStyle(): void {
    mctx.globalCompositeOperation = 'destination-out';
    mctx.fillStyle = `rgba(0, 0, 0, ${ERASER_ALPHA})`;
    mctx.strokeStyle = `rgba(0, 0, 0, ${ERASER_ALPHA})`;
    // Algo mas ancho que el trazo, para no dejar hilos sueltos detras.
    mctx.lineWidth = BRUSH_W * 1.5;
    mctx.lineCap = 'round';
    mctx.lineJoin = 'round';
  }

  /** Reparte los trazos entre los pinceles, en un orden nuevo. */
  function dealStrokes(): void {
    order = strokes.map((_, i) => i);
    shuffle(order, rng);
    next = 0;
    steps = 0;
    carry = 0;
    brushes = [];
    for (let i = 0; i < BRUSHES && next < order.length; i++) {
      brushes.push({ stroke: order[next++], at: 0 });
    }
  }

  function begin(p: Phase): void {
    phase = p;
    switch (p) {
      case 'draw':
        mctx.globalCompositeOperation = 'source-over';
        mctx.clearRect(0, 0, mw, mh);
        drawStyle();
        dealStrokes();
        veil = 1;
        break;
      case 'erase':
        eraseStyle();
        dealStrokes();
        veil = 1;
        break;
      case 'wash':
        left = WASH_MS;
        break;
      case 'hold':
        left = HOLD_MS;
        veil = 0;
        break;
      case 'dry':
        left = DRY_MS;
        break;
      case 'rest':
        left = REST_MS;
        veil = 1;
        break;
    }
  }

  // ------------------------------------------------------------- el pincel

  /** Avanza un pincel `n` puntos. Devuelve `false` si ya no le queda nada. */
  function advance(b: Brush, n: number): boolean {
    for (let i = 0; i < n; i++) {
      const stroke = strokes[b.stroke];
      if (!stroke) return false;

      if (b.at === 0) {
        // Primera pincelada del trazo: la gota donde se apoya el pincel.
        const p = stroke[0];
        mctx.beginPath();
        mctx.arc(p.x, p.y, mctx.lineWidth / 2, 0, Math.PI * 2);
        mctx.fill();
        steps++;
      }

      const from = stroke[b.at];
      const to = stroke[b.at + 1];
      if (to) {
        mctx.beginPath();
        mctx.moveTo(from.x, from.y);
        mctx.lineTo(to.x, to.y);
        mctx.stroke();
        steps++;
        b.at++;
      }

      // Trazo terminado: el pincel se lleva el siguiente que quede libre.
      if (b.at >= stroke.length - 1) {
        if (next >= order.length) return false;
        b.stroke = order[next++];
        b.at = 0;
      }
    }
    return true;
  }

  /**
   * Desvanecido parejo mientras se borra: apaga los restos que el borrador
   * deja a medias para que el papel quede limpio sin un ultimo salto.
   */
  function fade(progress: number, dt: number): void {
    const a = 0.05 * progress * progress * (dt / 16.7);
    if (a < 0.001) return;
    mctx.save();
    mctx.globalCompositeOperation = 'destination-out';
    mctx.fillStyle = `rgba(0, 0, 0, ${Math.min(0.4, a)})`;
    mctx.fillRect(0, 0, mw, mh);
    mctx.restore();
  }

  // --------------------------------------------------------------- el reloj

  function tick(now: number): void {
    // Un salto largo (pestaña en segundo plano) no se recupera de golpe.
    const dt = Math.min(50, now - last);
    last = now;

    if (phase === 'draw' || phase === 'erase') {
      const dur = phase === 'draw' ? DRAW_MS : ERASE_MS;
      const progress = Math.min(1, steps / total);
      // Arranca algo mas lento y acelera, como quien dibuja.
      carry += (total * (0.7 + 0.7 * progress) * dt) / dur;
      const take = Math.floor(carry);
      carry -= take;

      let active = false;
      if (take > 0) {
        const per = Math.ceil(take / Math.max(1, brushes.length));
        for (const b of brushes) {
          if (advance(b, per)) active = true;
        }
      } else {
        active = true;
      }
      if (phase === 'erase') fade(progress, dt);

      if (!active) {
        if (phase === 'draw') {
          begin('wash');
        } else {
          mctx.globalCompositeOperation = 'source-over';
          mctx.clearRect(0, 0, mw, mh);
          begin('rest');
        }
      }
    } else {
      left -= dt;
      const t = Math.max(0, Math.min(1, left / (phase === 'wash' ? WASH_MS : DRY_MS)));
      // Suavizado en los extremos: el color no entra ni se va de golpe.
      if (phase === 'wash') veil = smooth(t);
      else if (phase === 'dry') veil = smooth(1 - t);

      if (left <= 0) {
        if (phase === 'wash') begin('hold');
        else if (phase === 'hold') begin('dry');
        else if (phase === 'dry') begin('erase');
        else begin('draw');
      }
    }

    onFrame();
    raf = requestAnimationFrame(tick);
  }

  return {
    get running(): boolean {
      return raf !== 0;
    },

    paint(ctx, scene): void {
      const w = ctx.canvas.width;
      const h = ctx.canvas.height;
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(scene, 0, 0, w, h);
      if (idle || veil <= 0.004) return;

      // Tapa de papel con un agujero donde ya paso el pincel. Al escalarla
      // desde la mascara chica, los bordes salen suaves solos.
      cctx.globalCompositeOperation = 'source-over';
      cctx.fillStyle = PAPER_COLOR;
      cctx.fillRect(0, 0, mw, mh);
      cctx.globalCompositeOperation = 'destination-out';
      cctx.drawImage(mask, 0, 0);
      cctx.globalCompositeOperation = 'source-over';

      ctx.globalAlpha = veil;
      ctx.drawImage(cover, 0, 0, w, h);
      ctx.globalAlpha = 1;
    },

    play(): void {
      if (raf || strokes.length === 0) return;
      if (idle) {
        idle = false;
        begin('draw');
      }
      last = performance.now();
      raf = requestAnimationFrame(tick);
    },

    pause(): void {
      if (!raf) return;
      cancelAnimationFrame(raf);
      raf = 0;
    },
  };
}

/** Suavizado en S: 0 y 1 llegan sin tiron. */
function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

// ------------------------------------------------------------------ trazos

/**
 * Convierte el dibujo en trazos: muestrea donde hay tinta sobre una rejilla,
 * baraja los puntos de arranque y encadena cada uno con sus vecinos libres,
 * de modo que el recorrido sigue las lineas en vez de saltar al azar.
 */
function traceStrokes(img: ImageData, scale: number, mw: number, mh: number): Pt[][] {
  const cols = Math.ceil(mw / STEP);
  const rows = Math.ceil(mh / STEP);
  const ink = new Uint8Array(cols * rows);
  const d = img.data;

  // Una pasada de dos en dos pixeles: las lineas son mas gruesas que eso.
  for (let y = 0; y < img.height; y += 2) {
    for (let x = 0; x < img.width; x += 2) {
      const i = (y * img.width + x) * 4;
      if (d[i + 3] < 40) continue;
      if (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114 > INK_LUMA) continue;
      const cx = Math.min(cols - 1, Math.floor((x * scale) / STEP));
      const cy = Math.min(rows - 1, Math.floor((y * scale) / STEP));
      ink[cy * cols + cx] = 1;
    }
  }

  const seeds: number[] = [];
  for (let i = 0; i < ink.length; i++) if (ink[i]) seeds.push(i);
  shuffle(seeds, mulberry32(0x5e17ca11));

  const used = new Uint8Array(ink.length);
  const strokes: Pt[][] = [];
  for (const seed of seeds) {
    if (used[seed]) continue;
    let cell = seed;
    used[cell] = 1;
    const stroke: Pt[] = [cellPoint(cell, cols)];
    for (let n = 1; n < STROKE_MAX; n++) {
      const step = nearestFree(cell, cols, rows, ink, used);
      if (step < 0) break;
      used[step] = 1;
      stroke.push(cellPoint(step, cols));
      cell = step;
    }
    strokes.push(stroke);
  }
  return strokes;
}

/** Centro de una celda de la rejilla, en pixeles de mascara. */
function cellPoint(cell: number, cols: number): Pt {
  return {
    x: ((cell % cols) + 0.5) * STEP,
    y: (Math.floor(cell / cols) + 0.5) * STEP,
  };
}

/** Celda con tinta sin usar mas cercana, buscando por anillos. -1 si no hay. */
function nearestFree(
  cell: number,
  cols: number,
  rows: number,
  ink: Uint8Array,
  used: Uint8Array
): number {
  const cx = cell % cols;
  const cy = Math.floor(cell / cols);
  for (let r = 1; r <= 2; r++) {
    let best = -1;
    let bestDist = Infinity;
    for (let y = cy - r; y <= cy + r; y++) {
      if (y < 0 || y >= rows) continue;
      for (let x = cx - r; x <= cx + r; x++) {
        if (x < 0 || x >= cols) continue;
        // Solo el borde del anillo: lo de dentro ya se miro en la vuelta previa.
        if (Math.max(Math.abs(x - cx), Math.abs(y - cy)) !== r) continue;
        const i = y * cols + x;
        if (!ink[i] || used[i]) continue;
        const dist = (x - cx) ** 2 + (y - cy) ** 2;
        if (dist < bestDist) { bestDist = dist; best = i; }
      }
    }
    if (best >= 0) return best;
  }
  return -1;
}

/** Barajado Fisher-Yates in situ con un generador determinista. */
function shuffle(items: number[], rng: Rng): void {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
}
