/**
 * El fondo de «Visualización de datos» y «La escala de la alimentación»: unos
 * cuantos fragmentos de red con el mismo pincel del mural, solo como
 * acompañamiento visual.
 *
 * No usa datos: los nodos y las aristas se inventan aqui, en pequeños racimos
 * repartidos por los bordes de la pantalla. Cada nodo respira con una deriva
 * lenta y las aristas lo siguen.
 *
 * Son dos secciones y por tanto dos lienzos, pero una sola red: cada seccion
 * necesita el suyo para que quede bajo su propio texto —y, en la escala,
 * encima del carmin, donde los mismos trazos se leen en claro—, y como las
 * dos escenas se pegan al mismo alto de la pantalla, pintar la misma red en
 * las dos se ve como una sola animacion que cruza de una a otra sin costura.
 *
 * El bucle solo corre con alguna de las secciones a la vista y la pestaña al
 * frente; con `prefers-reduced-motion` los fragmentos quedan quietos.
 */
import {
  derivaX, derivaY, dibujarRed, respiracionDe,
  type Arista, type Nodo, type Red, type RedParams,
} from '@core/render/red';
import type { ColorRamp } from '@core/render/palette';
import type { PlacedPoint } from '@core/types';

interface Opciones {
  ramp: ColorRamp;
  params: RedParams;
}

const DPR_MAX = 1.5;
/** Centros de los fragmentos, en fraccion del lienzo: pegados a los bordes. */
const RACIMOS = [
  { x: 0.1, y: 0.2 },
  { x: 0.9, y: 0.32 },
  { x: 0.08, y: 0.78 },
  { x: 0.88, y: 0.85 },
];
const NODOS_POR_RACIMO = 16;

/** Una capa del fondo: el lienzo y la seccion que decide si hay que animar. */
export interface CapaFondo {
  seccion: HTMLElement;
  canvas: HTMLCanvasElement;
}

interface Lienzo {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
}

export function crearFondoRed(capas: CapaFondo[], o: Opciones) {
  const lienzos: Lienzo[] = [];
  for (const capa of capas) {
    const ctx = capa.canvas.getContext('2d');
    if (ctx) lienzos.push({ canvas: capa.canvas, ctx });
  }
  let red: Red = { nodos: [], aristas: [] };
  // Donde queda la escena una vez pegada: a la izquierda del todo y bajo la
  // barra. El alto sale del `top` de la propia escena —el `sticky top-[60px]`
  // de la pagina—, asi que mover la barra no deja esto desfasado.
  const ancla = { x: 0, y: 0 };
  function medirAncla(): void {
    const escena = lienzos[0]?.canvas.parentElement;
    ancla.y = escena ? parseFloat(getComputedStyle(escena).top) || 0 : 0;
  }
  let raf = 0;
  let visible = false;
  let ultimo = 0;
  const t0 = performance.now();
  const menos = window.matchMedia?.('(prefers-reduced-motion: reduce)');

  /** Arma los fragmentos a la medida del lienzo, en px de pantalla. */
  function generar(w: number, h: number): void {
    const lado = Math.min(w, h);
    const radio = lado * 0.16;
    const nodos: Nodo[] = [];
    const aristas: Arista[] = [];
    for (const c of RACIMOS) {
      const propios: Nodo[] = [];
      for (let i = 0; i < NODOS_POR_RACIMO; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = Math.sqrt(Math.random()) * radio;
        const x = c.x * w + Math.cos(a) * d * 1.3;
        const y = c.y * h + Math.sin(a) * d;
        const t = Math.random();
        const n: Nodo = {
          punto: { record: { id: '' }, x, y, t } as unknown as PlacedPoint,
          bx: x, by: y, dx: 0, dy: 0,
          r: (2.5 + 4 * t) * (lado / 700),
          ...respiracionDe(Math.random),
        };
        propios.push(n);
      }
      // Cada nodo se une con sus dos vecinos mas cercanos del racimo.
      propios.forEach((a, i) => {
        propios
          .map((b, j) => ({ b, j, d: Math.hypot(a.bx - b.bx, a.by - b.by) }))
          .filter((x) => x.j > i)
          .sort((x, y) => x.d - y.d)
          .slice(0, 2)
          .forEach(({ b }) => aristas.push({ a, b, peso: 0.6 + Math.random() * 0.4 }));
      });
      nodos.push(...propios);
    }
    red = { nodos, aristas };
  }

  /**
   * Lleva los fragmentos ya sorteados a un lienzo de otra medida.
   *
   * En el telefono la barra del navegador se esconde y reaparece con el
   * scroll, y con ella cambia el alto del lienzo (`100dvh`). Volver a sortear
   * la red en ese momento se ve como un salto a media lectura, asi que los
   * mismos nodos se reacomodan en la proporcion nueva.
   */
  function reescalar(kx: number, ky: number): void {
    const k = Math.min(kx, ky);
    for (const n of red.nodos) {
      n.bx *= kx;
      n.by *= ky;
      n.r *= k;
    }
  }

  function dibujar(ms: number): void {
    // La red no vive en ningun lienzo: vive en el ancla, el rectangulo de
    // pantalla donde las escenas quedan pegadas —de ancho completo y desde
    // debajo de la barra—, y cada lienzo pinta el trozo que le cae encima
    // segun lo lejos que este de esa posicion.
    //
    // Pintarla en coordenadas de cada lienzo era lo evidente y no sirve: la
    // escena de una seccion solo se pega cuando su seccion llega arriba, asi
    // que mientras la de abajo entra en pantalla las dos estan en sitios
    // distintos y la misma red se veria dos veces, corrida. Clavada al
    // ancla, en el cruce una capa termina justo donde empieza la otra.
    const guia = lienzos[0];
    if (!guia) return;
    const r = guia.canvas.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return;
    const dpr = Math.min(DPR_MAX, window.devicePixelRatio || 1);
    const w = Math.round(r.width * dpr);
    const h = Math.round(r.height * dpr);
    if (guia.canvas.width !== w || guia.canvas.height !== h) {
      const previo = { w: guia.canvas.width, h: guia.canvas.height };
      if (red.nodos.length && previo.w > 0 && previo.h > 0) {
        reescalar(w / previo.w, h / previo.h);
      } else {
        generar(w, h);
      }
    }
    for (const l of lienzos) {
      if (l.canvas.width !== w) l.canvas.width = w;
      if (l.canvas.height !== h) l.canvas.height = h;
    }

    // Con `prefers-reduced-motion` la respiracion se congela en su primer
    // fotograma: el repintado del scroll y el del resize entran por aqui, y
    // sin esto los nodos irian saltando a la posicion que les tocara ahora.
    // Es la misma deriva que respira la red del mural (ver `derivaX`), solo
    // que aqui la amplitud va en pixeles de pantalla y se asigna sin
    // suavizar: no hay cursor que esquivar, y asi cada repintado suelto —el
    // del scroll, el del resize— sale igual que el del bucle.
    const t = (menos?.matches ? 0 : ms) / 1000;
    const amp = Math.min(w, h) * 0.012;
    for (const n of red.nodos) {
      n.dx = derivaX(n, amp, t);
      n.dy = derivaY(n, amp, t);
    }

    const params = { ...o.params, aristaAncho: o.params.aristaAncho * dpr };
    for (const l of lienzos) {
      const caja = l.canvas.getBoundingClientRect();
      l.ctx.setTransform(1, 0, 0, 1, 0, 0);
      l.ctx.clearRect(0, 0, w, h);
      // Lo que separa a este lienzo del ancla, al reves: el trozo de red que
      // le toca es el que cae dentro de su recuadro.
      l.ctx.setTransform(1, 0, 0, 1, (ancla.x - caja.left) * dpr, (ancla.y - caja.top) * dpr);
      l.ctx.globalCompositeOperation = 'multiply';
      dibujarRed(l.ctx, red, o.ramp, params, 1);
      l.ctx.globalCompositeOperation = 'source-over';
      l.ctx.setTransform(1, 0, 0, 1, 0, 0);
    }
  }

  const quiere = () => visible && !document.hidden && !menos?.matches;

  function animar(): void {
    if (raf || !quiere()) return;
    ultimo = performance.now();
    const tick = (ahora: number) => {
      raf = 0;
      if (!quiere()) return;
      if (ahora - ultimo >= 1000 / 40) {
        ultimo = ahora;
        dibujar(ahora - t0);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  if (typeof IntersectionObserver !== 'undefined') {
    // Con mas de una seccion no basta con mirar la tanda que llega: el
    // observador solo avisa de las que cambiaron, asi que se lleva la cuenta
    // de cuales estan a la vista y se anima mientras quede alguna.
    const aLaVista = new Set<Element>();
    const observador = new IntersectionObserver((entradas) => {
      for (const e of entradas) {
        if (e.isIntersecting) aLaVista.add(e.target);
        else aLaVista.delete(e.target);
      }
      visible = aLaVista.size > 0;
      if (visible) animar();
    }, { threshold: 0 });
    for (const capa of capas) observador.observe(capa.seccion);
  } else {
    visible = true;
  }
  // La red va clavada a la pantalla, asi que el trozo que le toca a cada
  // lienzo cambia con el scroll. Mientras corre el bucle eso ya se repinta
  // solo; con `prefers-reduced-motion` no hay bucle y hay que pedirlo aqui
  // —los nodos siguen quietos, lo unico que se mueve es de donde se recorta.
  let pendiente = 0;
  window.addEventListener('scroll', () => {
    if (pendiente || !visible || document.hidden || !menos?.matches) return;
    pendiente = requestAnimationFrame(() => {
      pendiente = 0;
      dibujar(0);
    });
  }, { passive: true });

  document.addEventListener('visibilitychange', animar);
  window.addEventListener('resize', () => {
    medirAncla();
    dibujar(performance.now() - t0);
  });
  medirAncla();
  dibujar(0);
  animar();
}
