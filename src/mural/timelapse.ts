/**
 * `/timelapse`: el mural pintandose solo, del primer registro al ultimo.
 *
 * El mural de `/` esta vivo —se registra, se busca, se acerca— y por eso
 * aparece ya pintado: quien llega quiere ver la figura, no esperarla. Pero la
 * figura es el trabajo de dos mil personas a lo largo de dos meses, y eso no
 * se cuenta con un numero al pie: se cuenta mostrandolo. Aqui el cartel
 * arranca en blanco, con el primer registro que entro, y se va llenando hasta
 * el ultimo. Nada mas: ni mandos de parametros, ni lupa, ni fichas. Es una
 * pelicula.
 *
 * Tres decisiones sostienen todo lo demas:
 *
 * - **El acomodo es el final, y lo que avanza es cuanta gente se ve.** La red
 *   se arma una sola vez con todo el mundo (`redDeRegistros`, el mismo que usa
 *   el kiosco) y los nodos se van revelando en el orden en que se registraron.
 *   Rearmarla a cada paso seria mas fiel al mural de aquel dia —el recorrido
 *   crece con la poblacion, asi que al mural le van saliendo plumas— pero cada
 *   recalculo corre a todos los nodos un poco, y mil recalculos seguidos no se
 *   ven como un dibujo pintandose: se ven como un dibujo temblando. Cada quien
 *   aparece donde esta hoy, que es tambien donde lo deja el mural de `/`.
 * - **El reloj es el calendario, no el conteo.** La pelicula va del dia del
 *   primer registro al del ultimo, y dentro de cada dia sus registros se
 *   reparten parejos. Asi un dia de treinta pinta rapido y uno de tres pinta
 *   despacio —que es lo que de verdad paso— sin que la pelicula vaya a saltos
 *   de un dia al siguiente.
 * - **La tinta del cartel se vuelve a repartir cada tantos registros.** Las
 *   lineas del dibujo se entintan por donde hay gente encima
 *   (`@core/render/silueta`), y medir eso son diez mil puntos: se hace unas
 *   decenas de veces en toda la pelicula y no sesenta veces por segundo. El
 *   cartel va quieto en su propio lienzo y el fotograma solo lo estampa.
 *
 * Lo que se ve al final es exactamente el mural de `/` con la misma gente: el
 * pincel, la paleta y el acomodo son los mismos modulos.
 *
 * Y una perilla, la unica de la pagina: la ilustracion se apaga. El codice es
 * todo negro y la red es todo carmin, asi que con el dibujo debajo un nodo
 * que cayo sobre un nopal se confunde con la linea del nopal; apagado queda el
 * grafo solo y se leen sus nudos, sus hilos y los huecos entre comunidades
 * (ver `verCartel`).
 */
import { parseId } from '@core/ids/idCodec';
import { CARMIN, ColorRamp } from '@core/render/palette';
import { dibujarFigura, rasterizarFigura } from '@core/render/figura';
import { dibujarRed, type Arista, type Nodo, type Red } from '@core/render/red';
import { dibujarSilueta, ocupacionDe, tramosDe, type Tramos } from '@core/render/silueta';
import { mergeById } from '@data/repo/localRepo';
import { diaDeFecha } from '@data/seguridad';
import { cargarMural, opcionesMural, redDeRegistros, type Cartel } from './cartel';
import type { DataRecord } from '@core/types';

/** Lo que tarda la pelicula entera, en segundos. */
const DURACION = 26;

/**
 * Cada cuantos registros se vuelve a repartir la tinta del cartel.
 *
 * Sale de la poblacion: unas sesenta repartidas en toda la pelicula, que es
 * donde la tinta se ve crecer sin que medirla cueste un fotograma.
 */
const TINTADAS = 60;

/** Tope de densidad del lienzo y techo de pixeles, como en el mural. */
const DPR_MAX = 2;
const PIXELES_MAX = 3.6e6;

const RENDER = opcionesMural();
const ramp = new ColorRamp(CARMIN);

// ---------------------------------------------------------------- la pagina

// Los elementos los pone `src/pages/timelapse.astro`, que es la unica pagina
// que carga este modulo: si faltara alguno no hay pelicula que mostrar.
const caja = document.getElementById('tl-caja') as HTMLElement;
const lienzo = document.getElementById('tl-lienzo') as HTMLCanvasElement;
const aviso = document.getElementById('tl-aviso') as HTMLElement;
const btnPlay = document.getElementById('tl-play') as HTMLButtonElement;
const btnCartel = document.getElementById('tl-cartel') as HTMLButtonElement;
const fila = document.getElementById('tl-mandos') as HTMLElement;
const barra = document.getElementById('tl-barra') as HTMLElement;
const relleno = document.getElementById('tl-relleno') as HTMLElement;
const cuenta = document.getElementById('tl-cuenta') as HTMLElement;
const rotuloFecha = document.getElementById('tl-reloj') as HTMLElement;
const rango = document.getElementById('tl-rango') as HTMLElement;

const ctx = lienzo.getContext('2d')!;
/** El cartel entintado hasta donde va la pelicula: quieto, se estampa y ya. */
const cartelLienzo = document.createElement('canvas');
/** El tlacuilo rasterizado a la escala en que se esta mirando. */
const laminaTlacuilo = document.createElement('canvas');

const MANDOS = {
  // El mismo triangulo con el que se entra desde el mural.
  reproducir: '<circle cx="12" cy="12" r="8.6"/><path d="M10.1 8.3l5.6 3.7-5.6 3.7z"/>',
  pausa: '<line x1="9.8" y1="7.6" x2="9.8" y2="16.4" stroke-width="2.6"/>'
    + '<line x1="14.2" y1="7.6" x2="14.2" y2="16.4" stroke-width="2.6"/>',
  // Volver al principio: la barra del comienzo y el triangulo contra ella.
  volver: '<line x1="7.4" y1="7.2" x2="7.4" y2="16.8" stroke-width="2.4"/>'
    + '<path d="M19 7.4v9.2l-8-4.6z"/>',
};

/**
 * El icono de la ilustracion: una lamina con su dibujo adentro. Es el mismo
 * encendido y apagado —lo que cambia es el boton, que se tine de carmin
 * mientras el codice este puesto (`.tool.active`).
 */
const ILUSTRACION = '<rect x="3.4" y="4.8" width="17.2" height="14.4" rx="2.4"/>'
  + '<path d="M4.2 16.3l4.1-3.9a2 2 0 0 1 2.8 0l5 4.7"/>'
  + '<circle cx="15.1" cy="9.4" r="1.45"/>';

/** La fecha como se escribe: «16 de septiembre de 2026». */
const FECHA = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
});
/** La misma sin el año, para el extremo que lo comparte con el otro. */
const FECHA_CORTA = new Intl.DateTimeFormat('es-MX', {
  day: 'numeric', month: 'long', timeZone: 'UTC',
});

// ---------------------------------------------------------------- el reloj

/** Un dia en milisegundos. */
const DIA_MS = 86400000;

/**
 * Cuando se registro alguien. La columna `fecha` manda; si no esta, queda la
 * del id, que la lleva escrita en el nombre (ver `@core/ids/idCodec`).
 *
 * Las dos pasan por la ventana de `@data/seguridad` (noventa anos atras, un
 * dia adelante), y ese filtro es el que cuida la pelicula: el largo sale de la
 * fecha mas vieja a la mas nueva, asi que un solo registro fechado en 1800
 * —en la columna o en el id de una fila que no vino del formulario— la
 * estiraria dos siglos y aplastaria todo lo real en su ultimo tramo. Fuera de
 * la ventana la fecha no cuenta, y quien la trae entra como quien no dejo
 * ninguna: desde el principio.
 */
function diaDe(r: DataRecord): number | null {
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec((r.extra['fecha'] ?? '').trim());
  const porColumna = iso ? diaDeFecha(+iso[1], +iso[2], +iso[3]) : null;
  if (porColumna !== null) return porColumna;
  const compacta = /^(\d{4})(\d{2})(\d{2})$/.exec(parseId(r.id).fecha);
  return compacta ? diaDeFecha(+compacta[1], +compacta[2], +compacta[3]) : null;
}

/** El calendario de la pelicula: cuando entra cada quien, en [0,1]. */
interface Reloj {
  /** El momento de cada registro, por id. */
  porId: Map<string, number>;
  /** El dia del primer registro, en dias desde la epoca. */
  desde: number;
  /** Cuanto abarca la pelicula, en dias. */
  largo: number;
}

/**
 * Reparte los registros a lo largo del calendario.
 *
 * Los del mismo dia se reparten dentro de su dia, en orden de id: la fecha
 * solo dice el dia, asi que sin repartirlos los treinta de un martes
 * apareceran todos juntos de golpe, y eso es justo lo que no es un timelapse.
 * Quien no dejo fecha entra desde el principio: ya estaba ahi antes de que
 * hubiera algo que contar.
 */
function relojDe(gente: readonly DataRecord[]): Reloj {
  const dias = gente.map(diaDe);
  let temprano = Infinity;
  for (const d of dias) if (d !== null && d < temprano) temprano = d;
  if (!isFinite(temprano)) temprano = 0;

  const porDia = new Map<number, DataRecord[]>();
  gente.forEach((r, i) => {
    const dia = dias[i] ?? temprano;
    const lista = porDia.get(dia);
    if (lista) lista.push(r);
    else porDia.set(dia, [r]);
  });

  const porId = new Map<string, number>();
  let primero = Infinity;
  let ultimo = -Infinity;
  // Sin nadie no hay pelicula, pero la pagina tiene que abrir igual (el banco
  // simulado puede estar apagado y el dispositivo no haber registrado a
  // nadie): un dia de largo deja el reloj dando fechas validas.
  if (gente.length === 0) return { porId, desde: temprano, largo: 1 };

  for (const [dia, lista] of porDia) {
    lista.sort((a, b) => (a.id < b.id ? -1 : 1));
    lista.forEach((r, k) => {
      const momento = dia + (k + 0.5) / lista.length;
      porId.set(r.id, momento);
      if (momento < primero) primero = momento;
      if (momento > ultimo) ultimo = momento;
    });
  }

  // Normalizado a [0,1]: el primer registro abre la pelicula y el ultimo la
  // cierra, sea de un dia o de dos meses lo que haya en medio.
  const largo = ultimo - primero || 1;
  for (const [id, momento] of porId) porId.set(id, (momento - primero) / largo);
  return { porId, desde: primero, largo };
}

/** La fecha que marca el reloj en `t`. */
function fechaEn(t: number): Date {
  return new Date((reloj.desde + t * reloj.largo) * DIA_MS);
}

/** «Del 16 de septiembre al 23 de noviembre de 2026». */
function rangoTexto(): string {
  const desde = fechaEn(0);
  const hasta = fechaEn(1);
  const mismoAno = desde.getUTCFullYear() === hasta.getUTCFullYear();
  const abre = mismoAno ? FECHA_CORTA.format(desde) : FECHA.format(desde);
  return `Del ${abre} al ${FECHA.format(hasta)}`;
}

// ---------------------------------------------------------------- la pelicula

let cartel: Cartel | null = null;
let reloj: Reloj = { porId: new Map(), desde: 0, largo: 1 };
/** Los nodos y las aristas en el orden en que entran, con su momento al lado. */
let nodos: Nodo[] = [];
let aristas: Arista[] = [];
let momentoNodo = new Float64Array(0);
let momentoArista = new Float64Array(0);
/** Lo que se ve ahora: el prefijo de las dos listas que ya le toco entrar. */
const vivos: Red = { nodos: [], aristas: [] };
let iNodo = 0;
let iArista = 0;

/** El cartel con la tinta de los nodos revelados, y con cuantos se midio. */
let tramos: Tramos | null = null;
let tintados = -1;
let pasoTinta = 1;

/** Si el codice negro acompana a la red o se queda apagado. */
let conCartel = true;

/** De coordenadas de trabajo a pixeles del lienzo. */
let escala = 1;
/** Donde va la pelicula, en [0,1]. */
let t = 0;
let corriendo = false;
let raf = 0;
let ultimoFrame = 0;

/**
 * Revela lo que le toca a `t` y esconde lo que no.
 *
 * Las dos listas estan ordenadas por momento, asi que avanzar es empujar al
 * final y retroceder es sacar del final: arrastrar la barra hacia atras
 * cuesta lo mismo que hacia adelante y no hay que rearmar nada.
 */
function revelar(hasta: number): void {
  while (iNodo < nodos.length && momentoNodo[iNodo] <= hasta) vivos.nodos.push(nodos[iNodo++]);
  while (iNodo > 0 && momentoNodo[iNodo - 1] > hasta) { vivos.nodos.pop(); iNodo--; }
  while (iArista < aristas.length && momentoArista[iArista] <= hasta) {
    vivos.aristas.push(aristas[iArista++]);
  }
  while (iArista > 0 && momentoArista[iArista - 1] > hasta) { vivos.aristas.pop(); iArista--; }
}

/**
 * Deja el lienzo a la medida de la caja, con el cartel entero adentro.
 *
 * Aqui no hay lupa que valga: la pelicula se mira de lejos, asi que el lienzo
 * mide exactamente lo que mide el cartel encajado y no hace falta llevar
 * cuenta de ningun encuadre. Lo centra el CSS de la caja.
 */
function ajustar(): boolean {
  if (!RENDER.width || !RENDER.height) return false;
  const marco = caja.getBoundingClientRect();
  const css = getComputedStyle(caja);
  const ancho = marco.width - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight);
  const alto = marco.height - parseFloat(css.paddingTop) - parseFloat(css.paddingBottom);
  if (!(ancho > 0) || !(alto > 0)) return false;

  const encaje = Math.min(ancho / RENDER.width, alto / RENDER.height);
  const w = RENDER.width * encaje;
  const h = RENDER.height * encaje;
  lienzo.style.width = `${w}px`;
  lienzo.style.height = `${h}px`;

  const dpr = Math.min(
    DPR_MAX,
    window.devicePixelRatio || 1,
    // Nunca mas fino que el archivo: pintar por encima de su resolucion no
    // agrega informacion, solo trabajo.
    1 / encaje,
    Math.sqrt(PIXELES_MAX / (w * h))
  );
  const px = Math.max(1, Math.round(w * dpr));
  const py = Math.max(1, Math.round(h * dpr));
  if (lienzo.width !== px || lienzo.height !== py) {
    lienzo.width = px;
    lienzo.height = py;
  }
  escala = px / RENDER.width;
  return true;
}

/** Vuelve a medir la tinta del cartel con los nodos que ya estan a la vista. */
function entintar(): void {
  if (!cartel?.boceto) return;
  const ocupacion = ocupacionDe(
    cartel.boceto,
    vivos.nodos.map((n) => ({ x: n.bx, y: n.by })),
    RENDER.silueta, RENDER.width, RENDER.height
  );
  // Sin `orden`: aqui el cartel se pinta entero de una vez, asi que en que
  // sucesion salgan los tramos no cambia nada (en el mural si, que los va
  // trazando un lapiz).
  tramos = tramosDe(cartel.boceto, ocupacion, RENDER.silueta);
  tintados = vivos.nodos.length;
  pintarCartel();
}

/** Estampa el cartel en su lienzo, a la escala en que se esta mirando. */
function pintarCartel(): void {
  if (cartelLienzo.width !== lienzo.width || cartelLienzo.height !== lienzo.height) {
    cartelLienzo.width = lienzo.width;
    cartelLienzo.height = lienzo.height;
  }
  const cctx = cartelLienzo.getContext('2d');
  if (!cctx) return;
  cctx.clearRect(0, 0, cartelLienzo.width, cartelLienzo.height);
  if (tramos) dibujarSilueta(cctx, tramos, RENDER.silueta, escala);
}

/**
 * El fotograma: el cartel, la red revelada encima y el tlacuilo al final.
 *
 * Es el mismo orden y el mismo pincel que el render completo del mural (ver
 * `@core/render/compose`), solo que con la red recortada a lo que ya se
 * registro —y con la ilustracion apagable, que es lo unico que esta pantalla
 * hace distinto (ver `verCartel`).
 */
function dibujar(): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, lienzo.width, lienzo.height);
  ctx.globalCompositeOperation = 'multiply';
  if (conCartel) ctx.drawImage(cartelLienzo, 0, 0);
  dibujarRed(ctx, vivos, ramp, RENDER.red, escala);
  ctx.globalCompositeOperation = 'source-over';
  // El tlacuilo es la otra mitad del mismo codice en negro: si se apaga la
  // ilustracion, se apagan los dos o quedaria el dibujo a medias.
  if (conCartel && cartel?.tlacuilo) {
    dibujarFigura(ctx, cartel.tlacuilo, laminaTlacuilo, escala);
  }
}

/**
 * Enciende o apaga la ilustracion.
 *
 * El codice es todo negro y la red es el carmin que le pusieron encima, asi
 * que con el dibujo debajo un nodo que cayo sobre un nopal se confunde con la
 * linea del nopal: apagarlo es la unica forma de leer el grafo —sus nudos,
 * sus hilos y los huecos entre comunidades— como lo que es.
 *
 * Mientras esta apagado el cartel se sigue entintando en su lienzo, que no se
 * mira: volver a encenderlo es inmediato y no hay que esperar a la proxima
 * tanda de tinta.
 */
function verCartel(si: boolean): void {
  conCartel = si;
  rotularCartel();
  dibujar();
}

/** Deja el boton de la ilustracion diciendo en que estado esta. */
function rotularCartel(): void {
  const label = conCartel ? 'Ocultar la ilustración' : 'Mostrar la ilustración';
  btnCartel.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ILUSTRACION}</svg>`;
  btnCartel.classList.toggle('active', conCartel);
  btnCartel.setAttribute('aria-pressed', String(conCartel));
  btnCartel.setAttribute('aria-label', label);
  btnCartel.title = label;
}

/** Lleva la pelicula a `donde` y repinta lo que haga falta. */
function ponerEn(donde: number): void {
  t = Math.min(1, Math.max(0, donde));
  revelar(t);
  // La tinta del cartel se rehace de a tandas, y siempre en los extremos: el
  // cartel en blanco del principio y el entintado del final son los dos
  // fotogramas que la gente se queda mirando.
  if (Math.abs(vivos.nodos.length - tintados) >= pasoTinta || t <= 0 || t >= 1) entintar();
  dibujar();
  avance();
}

/** Deja escrito por donde va: la barra, la cuenta y la fecha. */
function avance(): void {
  relleno.style.width = `${(t * 100).toFixed(2)}%`;
  barra.setAttribute('aria-valuenow', String(Math.round(t * 100)));
  const total = nodos.length;
  cuenta.textContent = vivos.nodos.length === 1
    ? `1 registro de ${total}`
    : `${vivos.nodos.length} de ${total} registros`;
  rotuloFecha.textContent = FECHA.format(fechaEn(t));
}

/** Pone el boton en lo que se puede hacer ahora. */
function mandos(): void {
  const estado = corriendo ? 'pausa' : t >= 1 ? 'volver' : 'reproducir';
  const label = corriendo ? 'Pausar' : t >= 1 ? 'Volver a verlo' : 'Reproducir';
  btnPlay.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${MANDOS[estado]}</svg>`;
  btnPlay.setAttribute('aria-label', label);
  btnPlay.title = label;
}

function correr(si: boolean): void {
  if (si === corriendo) return;
  corriendo = si;
  if (si) {
    // Al final, reproducir es volver a empezar: la pelicula no tiene nada mas
    // que mostrar desde donde quedo.
    if (t >= 1) ponerEn(0);
    ultimoFrame = performance.now();
    raf = requestAnimationFrame(avanzar);
  } else if (raf) {
    cancelAnimationFrame(raf);
    raf = 0;
  }
  mandos();
}

function avanzar(ahora: number): void {
  raf = 0;
  if (!corriendo) return;
  // Con la pestaña en segundo plano el salto puede ser de minutos: acotado,
  // volver a la pelicula la encuentra donde se la dejo y no terminada.
  const dt = Math.min(0.1, (ahora - ultimoFrame) / 1000);
  ultimoFrame = ahora;
  ponerEn(t + dt / DURACION);
  if (t >= 1) {
    corriendo = false;
    mandos();
    return;
  }
  raf = requestAnimationFrame(avanzar);
}

// ---------------------------------------------------------------- los mandos

btnPlay.addEventListener('click', () => correr(!corriendo));
btnCartel.addEventListener('click', () => verCartel(!conCartel));

/**
 * La barra se arrastra para ir a cualquier momento de la pelicula, y al
 * tocarla se pausa: quien busca un momento no quiere que se le escape
 * mientras lo busca.
 */
let arrastre = false;

function llevarA(e: PointerEvent): void {
  const r = barra.getBoundingClientRect();
  if (r.width > 0) ponerEn((e.clientX - r.left) / r.width);
}

barra.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  arrastre = true;
  correr(false);
  barra.setPointerCapture(e.pointerId);
  llevarA(e);
});

barra.addEventListener('pointermove', (e) => { if (arrastre) llevarA(e); });

for (const fin of ['pointerup', 'pointercancel'] as const) {
  barra.addEventListener(fin, (e) => {
    if (!arrastre) return;
    arrastre = false;
    if (barra.hasPointerCapture(e.pointerId)) barra.releasePointerCapture(e.pointerId);
  });
}

/** Un paso de teclado: un veinteavo de la pelicula, o un quinto con Mayus. */
function paso(e: KeyboardEvent): number {
  return e.shiftKey ? 0.2 : 0.05;
}

document.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const target = e.target as Element | null;
  if (target?.closest('input, textarea, select, a, [contenteditable="true"]')) return;

  if (e.key === ' ' || e.key === 'Spacebar' || e.key === 'k') {
    // Con un boton enfocado la barra espaciadora es suya: el navegador ya lo
    // activa, y tomarla aqui ademas haria dos cosas de un toque.
    if (target?.closest('button')) return;
    e.preventDefault();
    correr(!corriendo);
  } else if (e.key === 'i') {
    e.preventDefault();
    verCartel(!conCartel);
  } else if (e.key === 'ArrowLeft') {
    e.preventDefault();
    correr(false);
    ponerEn(t - paso(e));
  } else if (e.key === 'ArrowRight') {
    e.preventDefault();
    correr(false);
    ponerEn(t + paso(e));
  } else if (e.key === 'Home') {
    e.preventDefault();
    ponerEn(0);
  } else if (e.key === 'End') {
    e.preventDefault();
    correr(false);
    ponerEn(1);
  }
});

// Fuera de la vista no se gastan fotogramas; al volver sigue donde estaba.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) correr(false);
});

/**
 * Al cambiar el tamano de la ventana hay que volver a rasterizar: el cartel y
 * el tlacuilo estan pintados a la medida de la anterior. Se espera a que el
 * gesto termine, como en el mural.
 */
function seguirTamano(): void {
  let timer = 0;
  const alCambiar = () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      const ancho = lienzo.width;
      const alto = lienzo.height;
      if (!ajustar()) return;
      if (lienzo.width === ancho && lienzo.height === alto) return;
      if (cartel?.tlacuilo) rasterizarFigura(cartel.tlacuilo, escala, laminaTlacuilo);
      pintarCartel();
      dibujar();
    }, 180);
  };
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(alCambiar).observe(caja);
  else window.addEventListener('resize', alCambiar);
}

// ---------------------------------------------------------------- arranque

async function start(): Promise<void> {
  const cargado = await cargarMural(RENDER);
  cartel = cargado.cartel;

  // Los propios van con los del banco (sin duplicar los ya sincronizados):
  // son registros del mural como cualquier otro, y traen su fecha igual.
  const gente = mergeById(cargado.base, cargado.propios).records;
  const armada = redDeRegistros(gente, cartel.trama, cartel.field, RENDER);
  if (!armada) {
    sinPelicula('No se pudo armar la red del mural: falta la espiral del dibujo.');
    return;
  }
  if (armada.red.nodos.length === 0) {
    sinPelicula('Todavía no hay registros: el mural se pinta en cuanto alguien se suma.');
    return;
  }

  reloj = relojDe(gente);
  const momentoDe = (n: Nodo) => reloj.porId.get(n.punto.record.id) ?? 0;

  // En el orden en que se registraron. Las aristas entran con el ultimo de
  // sus dos extremos: una union no existe hasta que estan los dos. El orden
  // de `redDe` —de la mas floja a la mas fuerte— se conserva entre las que
  // comparten momento, que es lo que deja las fuertes encima.
  nodos = [...armada.red.nodos].sort((a, b) => momentoDe(a) - momentoDe(b));
  momentoNodo = new Float64Array(nodos.map(momentoDe));
  const momentoUnion = (e: Arista) => Math.max(momentoDe(e.a), momentoDe(e.b));
  aristas = [...armada.red.aristas].sort((x, y) => momentoUnion(x) - momentoUnion(y));
  momentoArista = new Float64Array(aristas.map(momentoUnion));
  pasoTinta = Math.max(1, Math.round(nodos.length / TINTADAS));

  rango.textContent = rangoTexto();
  aviso.remove();
  lienzo.classList.remove('opacity-0');

  ajustar();
  if (cartel.tlacuilo) rasterizarFigura(cartel.tlacuilo, escala, laminaTlacuilo);
  seguirTamano();

  // Con movimiento reducido la pelicula no arranca sola: queda el mural
  // entero, que es lo que tendria que mostrar al terminar, y el boton sigue
  // ahi para quien quiera verla de todos modos.
  const quieto = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  ponerEn(quieto ? 1 : 0);
  mandos();
  rotularCartel();
  if (!quieto) correr(true);
}

/** Lo que queda en pantalla cuando no hay nada que reproducir. */
function sinPelicula(texto: string): void {
  aviso.textContent = texto;
  fila.classList.add('hidden');
}

start().catch((err) => {
  sinPelicula(`No se pudo cargar el mural: ${err}`);
});
