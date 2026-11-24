/**
 * Una figura del dibujo que se pinta tal cual: hoy, el tlacuilo.
 *
 * El cartel es un codice y quien lo esta contando es el pintor del centro.
 * Esa figura no puede aparecer de a poco como el resto: es la mano que
 * dibuja, tiene que estar desde la primera visita y con el trazo del autor,
 * no con una aproximacion hecha de nodos. Por eso vive en su propio SVG
 * —`tools/figuras.py` la separa del dibujo grande— y por eso se dibuja
 * encima de todo, sin pigmento ni transparencia.
 *
 * Lo unico que hay que resolver aqui es donde va. El SVG de la figura trae el
 * viewBox ajustado a ella, asi que su sitio sale de comparar ese marco con el
 * del dibujo entero: la figura cae exactamente donde el autor la dejo, sin
 * que nadie tenga que anotar coordenadas a mano.
 *
 * Que sea un SVG aparte tambien es lo que la deja aguantar la lupa: se
 * rasteriza a la medida en que se la va a mirar (`rasterizarFigura`), de modo
 * que al acercarse el trazo se vuelve a dibujar en vez de agrandarse.
 */

/** Una figura ya ubicada en el dibujo, en coordenadas de trabajo. */
export interface Figura {
  img: HTMLImageElement;
  x: number;
  y: number;
  ancho: number;
  alto: number;
}

/** El `viewBox` de un SVG, o null si no lo declara. */
export function viewBoxDe(svg: string): [number, number, number, number] | null {
  const m = /viewBox="([-\d.eE\s]+)"/.exec(svg);
  if (!m) return null;
  const v = m[1].trim().split(/\s+/).map(Number);
  return v.length === 4 && v.every(Number.isFinite)
    ? [v[0], v[1], v[2], v[3]]
    : null;
}

/**
 * Ubica la figura dentro del dibujo cargado.
 *
 * `width`/`height` son los del dibujo en coordenadas de trabajo. Si a alguno
 * de los dos SVG le falta el viewBox no hay con que comparar y la figura no
 * se dibuja: mejor sin pintor que con el pintor corrido.
 */
export function figuraDesde(
  img: HTMLImageElement,
  svgFigura: string,
  svgDibujo: string,
  width: number,
  height: number
): Figura | null {
  const caja = viewBoxDe(svgFigura);
  const marco = viewBoxDe(svgDibujo);
  if (!caja || !marco) return null;

  const [fx, fy, fw, fh] = caja;
  const [dx, dy, dw, dh] = marco;
  if (!(dw > 0) || !(dh > 0)) return null;

  return {
    img,
    x: ((fx - dx) / dw) * width,
    y: ((fy - dy) / dh) * height,
    ancho: (fw / dw) * width,
    alto: (fh / dh) * height,
  };
}

/**
 * Rasteriza la figura al tamano en que se va a ver.
 *
 * El navegador rasteriza un SVG a la medida en que se lo dibuja, pero
 * hacerlo en cada fotograma seria decodificar el archivo sesenta veces por
 * segundo. Esto lo hace una sola vez por escala —al cargar, al cambiar el
 * tamano de la ventana, al mover la lupa— y despues cada fotograma es una
 * sola estampa.
 *
 * `scale` lleva de coordenadas de trabajo a las del lienzo.
 */
export function rasterizarFigura(
  f: Figura,
  scale: number,
  destino?: HTMLCanvasElement
): HTMLCanvasElement {
  const c = destino ?? document.createElement('canvas');
  const w = Math.max(1, Math.round(f.ancho * scale));
  const h = Math.max(1, Math.round(f.alto * scale));
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  if (ctx) ctx.drawImage(f.img, 0, 0, w, h);
  return c;
}

/** Estampa la figura ya rasterizada en su sitio del dibujo. */
export function dibujarFigura(
  ctx: CanvasRenderingContext2D,
  f: Figura,
  lamina: CanvasImageSource,
  scale = 1
): void {
  ctx.drawImage(
    lamina,
    f.x * scale, f.y * scale,
    f.ancho * scale, f.alto * scale
  );
}
