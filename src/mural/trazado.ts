/**
 * El lapiz que no para: el cartel se traza a si mismo, de a pedazos.
 *
 * El dibujo no se muestra. Nunca se pega la lamina del SVG debajo del mural
 * —eso volveria a ser una ilustracion coloreada por los datos— y tampoco se
 * deja la silueta quieta, que es casi lo mismo con menos tinta. Lo que hay es
 * un lapiz que recorre el cartel entero una y otra vez, rapido, dejando el
 * trazo apenas marcado; detras de el la linea se apaga. En cualquier momento
 * se ve un pedazo del codice y no el codice: lo justo para saber que esta
 * ahi, que alguien lo esta dibujando y que la red cae encima de sus lineas.
 *
 * Como se sostiene:
 *
 * - **Se acumula, no se repinta.** Cada fotograma apaga un poco todo lo que
 *   hay en el lienzo y estampa los tramos nuevos. Son unas decenas de trazos
 *   por cuadro en vez de los diez mil del cartel, asi que la animacion sale
 *   gratis al lado de la red.
 * - **El orden es el del horneado**, de la linea mas larga a la mas corta
 *   (ver `@core/render/silueta`): primero la espiral, despues las plumas, al
 *   final el detalle. Dibujado asi se parece a como se dibuja.
 * - **La tinta sigue siendo la de los datos.** El lapiz no decide cuanto
 *   marca: marca lo que la gente puso ahi, y por eso al pasar por un nopal
 *   lleno de nodos deja una linea firme y al pasar por uno vacio no deja casi
 *   nada.
 * - **Al mover la lupa se rehace la cola.** Lo acumulado esta en pixeles de
 *   pantalla y un encuadre nuevo lo invalida, asi que se vuelve a pintar el
 *   ultimo tramo de recorrido con su desvanecido: el lapiz no se reinicia, se
 *   lo encuentra donde estaba.
 *
 * Con `prefers-reduced-motion` no hay lapiz: el cartel se pinta entero y se
 * queda quieto, que es la misma informacion sin nada moviendose.
 */
import { pintarTramos, type Recorte, type SiluetaParams, type Tramos } from '@core/render/silueta';

/** Cuanto tarda el lapiz en recorrer el cartel entero, en segundos. */
const VUELTA = 4.2;
/**
 * Cuanto vive un trazo detras del lapiz, en segundos. Contra `VUELTA` dice
 * que fraccion del cartel se ve a la vez: hoy, poco mas de un tercio.
 */
const COLA = 1.5;
/** Constante del apagado: a los `COLA` segundos no queda ni un 2 %. */
const TAU = COLA / 4;

/** Donde y a que tamano se esta mirando el cartel. */
export interface Marco {
  /** Tamano del lienzo, en pixeles. */
  ancho: number;
  alto: number;
  /** De coordenadas de trabajo a pixeles del lienzo. */
  escala: number;
  /** Donde cae el origen del dibujo en el lienzo. */
  ox: number;
  oy: number;
  /** Lo que entra en el lienzo, en coordenadas de trabajo. */
  recorte: Recorte | null;
}

export interface Trazado {
  /** El lienzo con lo que lleva dibujado. Se estampa debajo de la red. */
  readonly lienzo: HTMLCanvasElement;
  /** Tanda nueva: el cartel cambio de tinta porque cambio la gente. */
  datos(tramos: Tramos): void;
  /** Encuadre o tamano nuevo: se rehace lo que estaba a la vista. */
  encuadre(m: Marco): void;
  /** Avanza el lapiz. `dt` en segundos. */
  avanzar(dt: number): void;
  /** Con o sin lapiz: sin el, el cartel se pinta entero y se queda. */
  animar(si: boolean): void;
}

export function crearTrazado(p: SiluetaParams): Trazado {
  const lienzo = document.createElement('canvas');
  const ctx = lienzo.getContext('2d');
  let tramos: Tramos | null = null;
  let marco: Marco | null = null;
  /** Por donde va el lapiz, en tramos; flotante para que no vaya a saltos. */
  let lapiz = 0;
  let animado = true;

  /** Tramos por segundo: el cartel entero en una vuelta, sea cual sea. */
  function ritmo(): number {
    return tramos && tramos.largo > 0 ? tramos.largo / VUELTA : 0;
  }

  /**
   * Deja el lienzo del tamano que toca y la transformacion puesta: de aqui
   * en mas se pinta en coordenadas de trabajo, corridas por la lupa.
   */
  function encuadrar(): boolean {
    if (!ctx || !marco || !tramos) return false;
    if (lienzo.width !== marco.ancho || lienzo.height !== marco.alto) {
      lienzo.width = marco.ancho;
      lienzo.height = marco.alto;
    }
    ctx.setTransform(1, 0, 0, 1, marco.ox, marco.oy);
    return true;
  }

  /** Pinta el rango `[desde, hasta)` con el apagado que le toque a cada uno. */
  function tanda(desde: number, hasta: number, edadDe?: (i: number) => number): void {
    if (!ctx || !marco || !tramos) return;
    pintarTramos(ctx, tramos, desde, hasta, p, {
      escala: marco.escala,
      recorte: marco.recorte,
      desvanecer: edadDe && ((i) => Math.exp(-edadDe(i) / TAU)),
    });
  }

  /**
   * Vuelve a pintar la cola del lapiz en el encuadre nuevo.
   *
   * Es lo que hace que mover la lupa no borre el dibujo: lo acumulado no
   * sirve —estaba en otras coordenadas— pero se sabe por donde venia el
   * lapiz, y repintar su ultimo tramo con el desvanecido de cada tramo deja
   * la misma imagen que habria dejado dibujandola.
   */
  function rehacerCola(): void {
    if (!tramos) return;
    const n = tramos.largo;
    const porSeg = ritmo();
    if (n === 0 || porSeg <= 0) return;
    const cola = Math.min(n, Math.ceil(porSeg * COLA));
    const hasta = Math.floor(lapiz);
    const edadDe = (i: number) => ((hasta - i + n) % n) / porSeg;

    // El lapiz puede haber dado la vuelta: la cola son dos tramos de la
    // lista, el del final y el del principio.
    const desde = hasta - cola;
    if (desde >= 0) {
      tanda(desde, hasta, edadDe);
    } else {
      tanda(n + desde, n, edadDe);
      tanda(0, hasta, edadDe);
    }
  }

  function todo(): void {
    if (!tramos) return;
    tanda(0, tramos.largo);
  }

  function repintar(): void {
    if (!ctx || !encuadrar()) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, lienzo.width, lienzo.height);
    encuadrar();
    if (animado) rehacerCola();
    else todo();
  }

  return {
    lienzo,

    datos(nuevos: Tramos): void {
      tramos = nuevos;
      // El lapiz vuelve a su sitio proporcional: una tanda nueva puede tener
      // otra cantidad de tramos, pero el cartel es el mismo y no tiene por
      // que saltar.
      const n = nuevos.largo;
      lapiz = n > 0 ? Math.min(n - 1, lapiz) : 0;
      repintar();
    },

    encuadre(m: Marco): void {
      marco = m;
      repintar();
    },

    avanzar(dt: number): void {
      if (!animado || !ctx || !tramos || !marco) return;
      const n = tramos.largo;
      const porSeg = ritmo();
      if (n === 0 || porSeg <= 0) return;
      if (!encuadrar()) return;

      // Se apaga todo un poco: lo que dibujo el lapiz hace rato ya no esta.
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = `rgba(0, 0, 0, ${(1 - Math.exp(-dt / TAU)).toFixed(4)})`;
      ctx.fillRect(0, 0, lienzo.width, lienzo.height);
      ctx.globalCompositeOperation = 'source-over';
      ctx.setTransform(1, 0, 0, 1, marco.ox, marco.oy);

      // Y el lapiz avanza. Si da la vuelta, sigue por el principio: el cartel
      // se dibuja sin fin, sin un momento en que este entero ni uno en que
      // este vacio.
      const antes = lapiz;
      lapiz += porSeg * dt;
      if (lapiz >= n) {
        tanda(Math.floor(antes), n);
        lapiz -= n;
        tanda(0, Math.floor(lapiz) + 1);
      } else {
        tanda(Math.floor(antes), Math.floor(lapiz) + 1);
      }
    },

    animar(si: boolean): void {
      if (si === animado) return;
      animado = si;
      repintar();
    },
  };
}
