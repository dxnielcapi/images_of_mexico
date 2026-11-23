/**
 * Pantalla de registro: la ilustracion a pantalla completa y dos iconos
 * al pie, uno para buscar y otro para registrar. Cada uno abre su recuadro
 * hacia arriba; mientras tanto solo se ve el mural.
 *
 * Carga el mural de ejemplo (dibujo + zonas + CSV), le suma las personas que
 * se registraron en este dispositivo y vuelve a pintar con cada alta. No hay
 * controles de parametros: las medidas salen del dibujo (`@core/render/medidas`)
 * y los pesos del mapeo, de `@data/afinidad`.
 *
 * Lo que se ve es una red de afinidades (`@core/render/red`): un nodo por
 * persona, una arista entre quienes contestaron parecido, y el recorrido de
 * la espiral como eje. La figura no esta dibujada en ningun lado — sale de
 * donde cae la gente.
 *
 * Todo queda en la maquina: el CSV de ejemplo es de solo lectura y las altas
 * se guardan en localStorage (ver `@data/repo/localRepo`), con copia a archivo para
 * no depender de que el navegador conserve sus datos.
 */
import { loadDrawingUrl, linesLayer, type LoadedDrawing } from '@io/readers/drawing';
import { parseCsvText } from '@io/readers/csv';
import { recordsToCsv } from '@io/writers/csv';
import { parseConfig } from '@io/zonesConfig';
import {
  DATOS_EJEMPLO, PLANTILLA_DIBUJO, PLANTILLA_ESPINA, PLANTILLA_TRAZOS, PLANTILLA_ZONAS,
} from '@io/plantilla';
import { downloadText } from '@io/writers/download';
import { clearLocal, loadLocal, mergeById, parseBackup, saveLocal, storageAvailable } from '@data/repo/localRepo';
import { analyzeDrawing, clamp01, placeRecords, typicalDepth, zonesFromConfig } from '@core/scene';
import { renderScene } from '@core/render/compose';
import { CARMIN, ColorRamp } from '@core/render/palette';
import { PAPER_COLOR } from '@core/render/paper';
import { medidasParaDibujo } from '@core/render/medidas';
import { espinaDesde, parseEspinaJson, type Espina } from '@core/render/espina';
import { bocetoDesde, parseBocetoJson } from '@core/render/boceto';
import { recorridoDe, tramaDe, type Trama } from '@core/render/recorrido';
import {
  dibujarRed, enReposo, evadir, redDe, vivoX, vivoY, type Nodo, type Red,
} from '@core/render/red';
import type { ShapeField } from '@core/render/field';
import { SpatialGrid } from '@core/sampling/grid';
import {
  PERSON_FIELD_KEYS, PersonIds, SENTIRES, searchByName, todayIso, type Person,
} from '@data/person';
import { mapPerson, remapAll, zonasDisponibles, type MappingContext } from '@data/mapping';
import { FIRMAS, PUESTO_DE_FIRMA, afinidad, firmaDe, rasgosDe, type Rasgos } from '@data/afinidad';
import { personFromExtra } from '@data/person';
import { personSearch, type PersonSearch } from '@ui/personPanel';
import { registroForm, type RegistroForm, type RegistroResult } from '@ui/registroForm';
import { paintBlob } from '@ui/blob';
import { Tooltip } from '@ui/tooltip';
import { createHeroReveal, type HeroReveal } from './heroReveal';
import { crearFondoRed, type CapaFondo } from './fondoRed';
import { el, button, fileButton, row } from '@ui/controls';
import type { DataRecord, PlacedPoint, RenderOptions, ZoneMap } from '@core/types';

const RENDER: RenderOptions = {
  width: 0, height: 0,
  // Provisorias: al cargar el dibujo se recalculan con su lado y su hueco.
  ...medidasParaDibujo(2000, 0),
  grain: 0.5,
  // El dibujo no se muestra. La figura es la red: los nodos caen sobre el
  // recorrido de la espiral y son sus aristas las que trazan el cuerpo (ver
  // `@core/render/red`). Con la ilustracion de fondo, aunque fuera tenue, el
  // mural volveria a ser un dibujo coloreado por los datos en vez de una
  // figura que arman los datos.
  globalSeed: 1234, showLines: false, lineAlpha: 0.28,
  // Sin papel: la ilustracion va a sangre sobre el fondo de la pagina, sin el
  // recuadro que dibujaba el lienzo opaco.
  paper: false,
};

const ramp = new ColorRamp(CARMIN);
const ids = new PersonIds();

/** Lo que el mapeo necesita saber del mural: las zonas que hay ahora. */
const mapping = (): MappingContext => ({ zonas: zonasDisponibles(zones) });
const fmtValue = (v: number) => v.toFixed(3).replace(/\.?0+$/, '');

let drawing: LoadedDrawing | null = null;
let zones: ZoneMap = new Map();
let lines: HTMLCanvasElement | null = null;
/** El campo del dibujo: guia el trazo, no lo recorta. */
let field: ShapeField | null = null;
/** La espiral del dibujo: el eje sobre el que se ancla todo lo demas. */
let espina: Espina | null = null;
/** El dibujo medido y ordenado: de aqui sale el recorrido de cada tanda. */
let trama: Trama | null = null;
/** La red de afinidades: lo que se ve. */
let red: Red | null = null;
/** El nodo de cada registro, por id: para resaltar al que se busca. */
let nodoPorId = new Map<string, Nodo>();
/** Donde esta el cursor en coordenadas de trabajo, o null si no esta encima. */
let cursor: { x: number; y: number } | null = null;
let base: DataRecord[] = [];      // los del CSV de ejemplo
let propios: DataRecord[] = [];   // los registrados en este navegador
let placed: PlacedPoint[] = [];
let grid: SpatialGrid<PlacedPoint> | null = null;
let highlight: PlacedPoint | null = null;
let flashTimer = 0;
let search: PersonSearch | null = null;
let alta: RegistroForm | null = null;
let ultimoNombre = '';
let mine: HTMLElement | null = null;   // "N guardados en este dispositivo"
let backupNote: HTMLElement | null = null;
let pulseUntil = 0;   // hasta cuando late la marca de la mancha senalada

// ---------------------------------------------------------------- layout

const view = el('canvas', { class: 'max-w-full max-h-full' });

// El aviso flotante se apoya sobre la fila de iconos, nunca debajo.
const flash = el('div', {
  class: 'hidden absolute left-1/2 -translate-x-1/2 bottom-[calc(var(--bar)+14px)] '
    + 'max-w-[80%] telefono:max-w-[calc(100%-var(--edge)*2)] px-4 py-[9px] rounded-full '
    + 'bg-[rgb(32_28_22_/_0.92)] text-[#f6f1e6] text-base text-center shadow-[0_8px_24px_rgb(0_0_0_/_0.22)]',
});

const mural = el('section', {
  class: 'lienzo absolute inset-0 flex items-center justify-center overflow-hidden '
    + 'p-6 pb-[calc(24px+var(--bar))] '
    + 'bg-[radial-gradient(circle_at_50%_35%,#fcf9f2_0%,#f1ece0_100%)]',
}, [view, flash]);

const panels = el('div', { class: 'flex flex-auto min-h-0' });
const searchPanel = el('div', { class: 'panel hidden' });
const addPanel = el('div', { class: 'panel hidden' });
const tools = el('div', {
  class: 'flex flex-none justify-end gap-2 telefono:justify-center telefono:gap-3.5',
});
panels.append(searchPanel, addPanel);

// Los recuadros se abren hacia arriba; los iconos van al pie, al alcance del pulgar.
const page = el('div', { class: 'kiosk' }, [
  mural,
  // Columna anclada abajo: los recuadros crecen hacia arriba y la fila de
  // iconos queda fija al borde inferior, sobre el area segura del telefono.
  el('div', {
    class: 'absolute z-5 right-[var(--edge)] bottom-[calc(var(--edge)+var(--safe))] '
      + 'flex flex-col items-end gap-2.5 max-h-[calc(100%-var(--edge)*2-var(--safe))] '
      + 'telefono:left-[var(--edge)] telefono:items-stretch',
  }, [panels, tools]),
]);
const mount = document.getElementById('mural-mount') ?? document.body;
mount.append(page);

const heroCanvas = document.getElementById('hero-canvas') as HTMLCanvasElement | null;
let heroReveal: HeroReveal | null = null;   // trazado animado del Hero
/** Lado mayor del lienzo de fondo del Hero. */
const HERO_MAX_SIDE = 900;
const tooltip = new Tooltip(document.body);
const ctx = view.getContext('2d')!;
const scene = document.createElement('canvas');

/**
 * El mural se rasteriza al tamano en que se ve, no al del archivo.
 *
 * La plantilla mide ~1918x2000 y en pantalla entra en unos 500 px: rasterizar
 * a tamano de archivo significaba pintar catorce veces mas pixeles de los que
 * se miran y despues dejar que el navegador los encogiera, que es justo lo
 * que se comia los filamentos —un trazo de 5 px reducido a 1,2 se promedia
 * con el papel y desaparece—. Rasterizando a la medida de la caja, el trazo
 * se dibuja a su grosor final y se lee.
 *
 * `escala` lleva de coordenadas de trabajo (las del dibujo, en las que viven
 * los puntos y el campo) a las del lienzo. `upx` es cuanto mide un pixel de
 * pantalla en el lienzo, para que los adornos de interfaz —la marca, el
 * pulso, la marca— no engorden ni adelgacen con la resolucion.
 */
let escala = 1;
let upx = 1;

/** Tope de densidad: mas alla de 2x no se nota y cuesta el doble. */
const DPR_MAX = 2;

function ajustarLienzo(): number {
  if (!drawing) return escala;
  const caja = mural.getBoundingClientRect();
  const css = getComputedStyle(mural);
  const ancho = caja.width - parseFloat(css.paddingLeft) - parseFloat(css.paddingRight);
  const alto = caja.height - parseFloat(css.paddingTop) - parseFloat(css.paddingBottom);
  if (!(ancho > 0) || !(alto > 0)) return escala;

  const encaje = Math.min(ancho / RENDER.width, alto / RENDER.height);
  const anchoCss = Math.max(1, Math.round(RENDER.width * encaje));
  const altoCss = Math.max(1, Math.round(RENDER.height * encaje));
  view.style.width = `${anchoCss}px`;
  view.style.height = `${altoCss}px`;

  const dpr = Math.min(DPR_MAX, window.devicePixelRatio || 1);
  // Nunca por encima del original: pintar mas fino que el archivo no agrega
  // informacion, solo trabajo.
  const nueva = Math.min(1, (anchoCss * dpr) / RENDER.width);
  upx = (RENDER.width * nueva) / anchoCss;
  return nueva;
}

const ICONS = {
  buscar: '<circle cx="11" cy="11" r="6.2"/><line x1="15.6" y1="15.6" x2="21" y2="21"/>',
  registrar: '<circle cx="10" cy="8" r="3.6"/><path d="M3.5 20.5c0-3.6 2.9-6.5 6.5-6.5"/><line x1="17" y1="13.5" x2="17" y2="21.5"/><line x1="13" y1="17.5" x2="21" y2="17.5"/>',
};

function iconButton(icon: keyof typeof ICONS, label: string, onClick: () => void): HTMLButtonElement {
  const b = el('button', { class: 'tool', title: label, type: 'button' });
  b.setAttribute('aria-label', label);
  b.setAttribute('aria-expanded', 'false');
  b.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[icon]}</svg>`;
  b.addEventListener('click', onClick);
  return b;
}

const btnBuscar = iconButton('buscar', 'Buscar persona', () => toggle('buscar'));
const btnRegistrar = iconButton('registrar', 'Registrar persona', () => toggle('registrar'));
tools.append(btnBuscar, btnRegistrar);

type PanelId = 'buscar' | 'registrar' | null;
let open: PanelId = null;

function toggle(which: Exclude<PanelId, null>): void {
  setOpen(open === which ? null : which);
}

function setOpen(which: PanelId): void {
  open = which;
  searchPanel.classList.toggle('hidden', which !== 'buscar');
  addPanel.classList.toggle('hidden', which !== 'registrar');
  btnBuscar.classList.toggle('active', which === 'buscar');
  btnRegistrar.classList.toggle('active', which === 'registrar');
  btnBuscar.setAttribute('aria-expanded', String(which === 'buscar'));
  btnRegistrar.setAttribute('aria-expanded', String(which === 'registrar'));

  if (which === null) {
    // Al cerrar se limpia lo que haya quedado marcado por la busqueda.
    tooltip.hide();
    if (!flashTimer) { highlight = null; paint(); }
    return;
  }
  const panel = which === 'buscar' ? searchPanel : addPanel;
  panel.querySelector('input')?.focus({ preventScroll: true });
}

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && open) setOpen(null);
});

// ---------------------------------------------------------------- la red

function records(): DataRecord[] {
  return [...base, ...propios];
}

function valueRange(): { min: number; max: number } {
  let min = Infinity, max = -Infinity;
  for (const r of records()) {
    if (r.valor < min) min = r.valor;
    if (r.valor > max) max = r.valor;
  }
  return isFinite(min) ? { min, max } : { min: 0, max: 1 };
}

/**
 * Arma la red con toda la gente que hay ahora.
 *
 * El acomodo lo decide `@core/render/red` a partir de dos numeros por
 * persona que salen de sus respuestas: el grupo —su firma, o sea las cuatro
 * preguntas de opcion— y donde cae a lo ancho de la banda, que aqui es la
 * escala de como se siente con su alimentacion. Quien contesto igual queda
 * junto, y las aristas entre ellos son las que dibujan el cuerpo.
 *
 * Sin espina no hay recorrido sobre el que repartir, asi que se cae al
 * reparto por zonas de antes: el mural abre igual aunque falte el archivo.
 */
function placeAll(): void {
  const { min, max } = valueRange();
  const span = max - min || 1;
  const gente = records();

  // Los rasgos se calculan una vez por tanda y no por par: el parecido se
  // consulta miles de veces al armar las aristas, y rehacerlos ahi adentro
  // seria recorrer el esquema entero en cada consulta.
  rasgos = new Map(gente.map((r) => [r.id, rasgosDe(personFromExtra(r.extra))]));

  // El recorrido se rearma en cada tanda: de cuanta gente hay depende cuanto
  // dibujo entra (ver `@core/render/recorrido`). Es cortar una lista ya
  // ordenada, no volver a medir el dibujo.
  const recorrido = trama ? recorridoDe(trama, gente.length) : null;

  if (recorrido) {
    red = redDe(
      gente.map((record) => {
        const g = rasgos.get(record.id)!;
        return {
          record,
          grupo: PUESTO_DE_FIRMA[firmaDe(g)],
          orden: g.escala,
          t: clamp01((record.valor - min) / span),
        };
      }),
      recorrido, field, RENDER.red,
      { globalSeed: RENDER.globalSeed, grupos: FIRMAS, parecido: parecidoEntre }
    );
    nodoPorId = new Map(red.nodos.map((n) => [n.punto.record.id, n]));
    placed = red.nodos.map((n) => n.punto);
  } else {
    red = null;
    nodoPorId = new Map();
    placed = placeRecords(gente, zones, {
      mode: 'random', minDistFactor: 1, globalSeed: RENDER.globalSeed,
      width: RENDER.width, min, max,
    }).placed;
  }

  grid = new SpatialGrid(Math.max(8, radioToque()), RENDER.width, RENDER.height);
  for (const p of placed) grid.insert(p);
  refreshCounts();
}

/** Los rasgos de cada registro, por id: el insumo del parecido. */
let rasgos = new Map<string, Rasgos>();

/** Cuanto se parecen dos registros. Es lo que decide si hay arista. */
function parecidoEntre(a: DataRecord, b: DataRecord): number {
  const ra = rasgos.get(a.id);
  const rb = rasgos.get(b.id);
  return ra && rb ? afinidad(ra, rb) : 0;
}

/**
 * Cuanto hay que acercarse a alguien para señalarlo, en px de trabajo.
 *
 * Con la red, el area sensible se mide contra el nodo mas grande y no
 * contra el de cada uno: si fuera por nodo, a los mas lavados —que son los
 * mas chicos— habria que acertarles al pixel.
 */
function radioToque(): number {
  if (red) return Math.max(10, RENDER.red.radioMax * 1.6);
  return Math.max(6, RENDER.watercolor.radius * 1.1);
}

/** "1 registro" / "3 registros", para que los avisos no queden raros. */
function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function refreshCounts(): void {
  for (const node of document.querySelectorAll('.count')) {
    node.textContent = `${placed.length} personas en el mural`;
  }
  for (const node of document.querySelectorAll('[data-stat="personas"]')) {
    node.textContent = String(placed.length);
  }
  for (const node of document.querySelectorAll('[data-stat="zonas"]')) {
    node.textContent = String(zones.size || 12);
  }
  if (mine) {
    mine.textContent = `${plural(propios.length, 'registro guardado', 'registros guardados')} en este dispositivo`;
  }
}

/**
 * Re-renderiza la escena cacheada: la red en reposo, sin el cursor encima.
 *
 * Es lo que mira el fondo del Hero, que no tiene puntero. Lo que se ve en el
 * mural lo dibuja `paint` fotograma a fotograma con los nodos donde esten:
 * esta copia es la base quieta, y las dos salen del mismo pincel.
 */
function render(): void {
  escala = ajustarLienzo();
  const corridos = red?.nodos.map((n) => [n.dx, n.dy] as const);
  if (red) enReposo(red);
  renderScene(
    scene,
    { points: placed, ramp, options: RENDER, lines, field, espina, red },
    escala
  );
  if (red && corridos) {
    red.nodos.forEach((n, i) => { n.dx = corridos[i][0]; n.dy = corridos[i][1]; });
  }
  paint();
  paintHero();
  pintarFondoDatos();
}

/**
 * El fondo animado de «Visualización de datos» y «La escala de la
 * alimentación»: fragmentos de red decorativos. Las dos secciones comparten
 * una sola red —ver `./fondoRed`—, asi que la animacion cruza de la crema al
 * carmin sin cortarse; en la escala los mismos trazos se leen en claro.
 */
let fondoDatos = false;
const CAPAS_FONDO = [
  { seccion: 'datos', lienzo: 'datos-red' },
  { seccion: 'escala', lienzo: 'escala-red' },
];

function pintarFondoDatos(): void {
  if (fondoDatos) return;
  const capas: CapaFondo[] = [];
  for (const c of CAPAS_FONDO) {
    const seccion = document.getElementById(c.seccion);
    const lienzo = document.getElementById(c.lienzo) as HTMLCanvasElement | null;
    if (seccion && lienzo) capas.push({ seccion, canvas: lienzo });
  }
  if (!capas.length) return;
  fondoDatos = true;
  crearFondoRed(capas, { ramp, params: RENDER.red });
}

/** Copia el mapeo renderizado al lienzo de fondo del Hero (bajo el efecto cristal). */
function paintHero(): void {
  if (!heroCanvas || !drawing) return;
  // Va desenfocado bajo el velo de cristal: no hace falta la resolucion de
  // trabajo entera, y asi el trazado animado repinta barato cada fotograma.
  const k = Math.min(1, HERO_MAX_SIDE / Math.max(RENDER.width, RENDER.height));
  const w = Math.max(1, Math.round(RENDER.width * k));
  const h = Math.max(1, Math.round(RENDER.height * k));
  if (heroCanvas.width !== w || heroCanvas.height !== h) {
    heroCanvas.width = w;
    heroCanvas.height = h;
  }
  const hctx = heroCanvas.getContext('2d');
  if (!hctx) return;
  // Con el trazado en curso el Hero muestra solo lo que lleva dibujado.
  if (heroReveal) {
    heroReveal.paint(hctx, scene);
  } else {
    hctx.clearRect(0, 0, w, h);
    hctx.drawImage(scene, 0, 0, w, h);
  }
  // La escena del mural va sin papel —ahi la ilustracion es a sangre, sin
  // recuadro—, pero el fondo del Hero si lo quiere: desenfocado bajo el velo
  // de cristal, sin esa lamina crema no se adivinaria nada. Va debajo de lo
  // ya pintado, que es tambien donde el trazado animado espera su papel.
  hctx.globalCompositeOperation = 'destination-over';
  hctx.fillStyle = PAPER_COLOR;
  hctx.fillRect(0, 0, w, h);
  hctx.globalCompositeOperation = 'source-over';
  heroCanvas.classList.remove('opacity-0');
}

/**
 * Dibuja el fotograma: la red donde este ahora, y encima la marca del nodo
 * senalado con su onda.
 *
 * La red se repinta entera cada vez en vez de estamparse de una copia
 * cacheada, porque con el cursor encima no hay dos fotogramas iguales: los
 * nodos se apartan y las aristas los siguen. Son trescientos `drawImage` y
 * unas setecientas lineas, que es lo que el lienzo hace sin despeinarse; lo
 * caro del mural nunca fueron las marcas sino la acuarela de cada una, y eso
 * ya viene horneado en el pincel de la red.
 *
 * Quien mueve la red es `evadir`, antes de llamar aqui: esto solo dibuja lo
 * que encuentra, asi que sirve igual para un fotograma del bucle que para un
 * repintado suelto (un alta, un resaltado).
 */
function paint(): void {
  if (!drawing) return;
  if (view.width !== scene.width || view.height !== scene.height) {
    view.width = scene.width;
    view.height = scene.height;
  }
  ctx.clearRect(0, 0, view.width, view.height);
  if (red) {
    ctx.globalCompositeOperation = 'multiply';
    dibujarRed(ctx, red, ramp, RENDER.red, escala);
    ctx.globalCompositeOperation = 'source-over';
  } else {
    ctx.drawImage(scene, 0, 0);
  }
  if (!highlight) return;

  // Marca sobre el nodo recien agregado o encontrado: va donde el nodo este
  // ahora, no donde descansa, o al esquivar el cursor se le escaparia de
  // adentro. Las medidas van en pixeles de pantalla: es interfaz, no pigmento.
  const nodo = nodoPorId.get(highlight.record.id);
  const hx = (nodo ? vivoX(nodo) : highlight.x) * escala;
  const hy = (nodo ? vivoY(nodo) : highlight.y) * escala;
  const r = Math.max(14 * upx, radioToque() * 1.6 * escala);
  for (const [color, w] of [['rgba(255, 253, 248, 0.95)', 3], ['rgba(28, 24, 18, 0.9)', 1.25]] as const) {
    ctx.strokeStyle = color;
    ctx.lineWidth = w * upx;
    ctx.beginPath();
    ctx.arc(hx, hy, r, 0, Math.PI * 2);
    ctx.stroke();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      ctx.beginPath();
      ctx.moveTo(hx + dx * (r + 3 * upx), hy + dy * (r + 3 * upx));
      ctx.lineTo(hx + dx * (r + 9 * upx), hy + dy * (r + 9 * upx));
      ctx.stroke();
    }
  }

  // Onda que se abre y se apaga: en el dibujo lleno de marcas, es lo que
  // hace que la propia se encuentre de un vistazo al cerrar el recuadro.
  const queda = pulseUntil - performance.now();
  if (queda <= 0) return;
  const fase = (performance.now() % PULSE_MS) / PULSE_MS;
  const fin = Math.min(1, queda / 900);   // se desvanece al terminar
  // Mismo carmin que `--accent` en mural.css.
  ctx.strokeStyle = `rgba(158, 43, 43, ${(1 - fase) * 0.75 * fin})`;
  ctx.lineWidth = 2 * upx;
  ctx.beginPath();
  ctx.arc(hx, hy, r + fase * r * 2.4, 0, Math.PI * 2);
  ctx.stroke();
}

const PULSE_MS = 1500;

// ---------------------------------------------------------------- animacion

/**
 * Un solo bucle para todo lo que se mueve, y se apaga en cuanto no hace falta.
 *
 * Corre a 60 fps y solo mientras el mural esta a la vista, la pestana esta al
 * frente y el sistema no pide menos movimiento. Antes iba a 30 porque lo
 * unico que se movia era un pulso lento; la esquivada se sigue con el raton y
 * a 30 se nota a saltos, asi que esta vale los fotogramas. Se apaga sola: en
 * cuanto la red vuelve al reposo y no hay nada latiendo, no quedan
 * fotogramas pedidos.
 */
const FPS = 60;
let animRaf = 0;
let ultimoFrame = 0;
let muralVisible = true;

const menosMovimiento = window.matchMedia?.('(prefers-reduced-motion: reduce)');

function quiereAnimar(): boolean {
  if (menosMovimiento?.matches) return false;
  if (document.hidden || !drawing) return false;
  if (!muralVisible) return false;
  // Con el cursor encima la red se esta apartando; sin el, puede seguir
  // volviendo al reposo, y eso lo sabe `redViva`.
  if (cursor !== null || redViva) return true;
  return highlight !== null && performance.now() < pulseUntil;
}

/** Si queda algun nodo en camino: lo que mantiene el bucle vivo al soltar. */
let redViva = false;

function animar(): void {
  if (animRaf || !quiereAnimar()) return;
  ultimoFrame = performance.now();
  const tick = (ahora: number) => {
    animRaf = 0;
    if (!quiereAnimar()) return;
    const dt = Math.min(0.1, (ahora - ultimoFrame) / 1000);
    if (dt >= 1 / FPS) {
      ultimoFrame = ahora;
      if (red) redViva = evadir(red, cursor, RENDER.red, dt);
      paint();
    }
    animRaf = requestAnimationFrame(tick);
  };
  animRaf = requestAnimationFrame(tick);
}

function detenerAnimacion(): void {
  if (animRaf) cancelAnimationFrame(animRaf);
  animRaf = 0;
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) detenerAnimacion();
  else animar();
});

/** Hace latir la marca unos segundos sobre la mancha resaltada. */
function startPulse(ms = 6000): void {
  pulseUntil = performance.now() + ms;
  animar();
  // Sin animacion (movimiento reducido) la marca igual queda dibujada.
  if (!animRaf) paint();
}

/** Ficha de la persona, anclada a su mancha en el lienzo. */
function showFicha(point: PlacedPoint): void {
  const rect = view.getBoundingClientRect();
  tooltip.show(
    point,
    rect.left + (point.x / RENDER.width) * rect.width,
    rect.top + (point.y / RENDER.height) * rect.height,
    fmtValue
  );
}

function showFlash(text: string): void {
  flash.textContent = text;
  flash.classList.remove('hidden');
  window.clearTimeout(flashTimer);
  flashTimer = window.setTimeout(() => {
    flashTimer = 0;
    flash.classList.add('hidden');
    highlight = null;
    paint();
  }, 7000);
}

// ---------------------------------------------------------------- persistencia

/** Guarda `propios` y avisa si el navegador no dejo persistir. */
function persist(): boolean {
  const ok = saveLocal(propios);
  if (!ok) {
    // Modo privado o cuota llena: el mural sigue andando, pero lo registrado
    // se pierde al recargar. La copia a archivo es la salida.
    note('Este navegador no deja guardar: descarga una copia antes de cerrar.', 'bad');
  }
  return ok;
}

function note(text: string, kind: 'ok' | 'bad' | '' = ''): void {
  if (!backupNote) return;
  backupNote.className = `hint ${kind}`.trim();
  backupNote.textContent = text;
}

/** Reemplaza lo registrado en este dispositivo y repinta. */
function setPropios(next: DataRecord[]): void {
  propios = next;
  persist();
  ids.sync(records());
  highlight = null;
  placeAll();
  render();
}

function exportPropios(): void {
  if (propios.length === 0) {
    note('Todavía no has registrado a nadie en este dispositivo.', 'bad');
    return;
  }
  downloadText(
    `mural_registros_${todayIso()}.csv`,
    recordsToCsv(propios, PERSON_FIELD_KEYS),
    'text/csv'
  );
  note(`Copia bajada: ${plural(propios.length, 'registro', 'registros')} en CSV.`, 'ok');
}

async function importPropios(file: File): Promise<void> {
  let incoming: DataRecord[] = [];
  try {
    const batch = parseBackup(await file.text());
    // Si la copia se hizo con una regla anterior, se remapea al entrar.
    incoming = remapAll(batch.records, batch.mapeo, mapping()).records;
  } catch {
    incoming = [];
  }
  if (incoming.length === 0) {
    note('No se encontraron registros en ese archivo.', 'bad');
    return;
  }
  const known = new Set(base.map((r) => r.id));
  const { records: merged, added } = mergeById(propios, incoming.filter((r) => !known.has(r.id)));
  setPropios(merged);
  note(
    added === 0
      ? 'Ya estaban todos: no se agregó ninguno.'
      : `Se ${added === 1 ? 'sumó' : 'sumaron'} ${added} de ${plural(incoming.length, 'registro', 'registros')}.`,
    added === 0 ? '' : 'ok'
  );
}

/** Borrado en dos toques, para no perder todo por un click al pasar. */
function clearButton(): HTMLButtonElement {
  const LABEL = 'Borrar mis registros';
  let armed = 0;
  const b = button(LABEL, () => {
    if (!armed) {
      armed = window.setTimeout(() => { armed = 0; b.textContent = LABEL; }, 5000);
      b.textContent = '¿Seguro? Toca de nuevo';
      return;
    }
    window.clearTimeout(armed);
    armed = 0;
    b.textContent = LABEL;
    const n = propios.length;
    clearLocal();
    setPropios([]);
    note(n ? `Se ${n === 1 ? 'borró' : 'borraron'} ${plural(n, 'registro', 'registros')} de este dispositivo.` : 'No había nada para borrar.');
  }, 'danger');
  return b;
}

/** Bloque "Mis registros": respaldo a archivo y borrado, todo local. */
function backupBox(): HTMLElement {
  mine = el('p', { class: 'mb-2 text-xs text-muted' });
  backupNote = el('p', { class: 'hint' });
  const box = el('div', { class: 'backup' }, [
    el('p', { class: 'hint', text: 'Lo que registres queda solo en este dispositivo. Descarga una copia para no perderla si se borran los datos del navegador.' }),
    mine,
    row(
      button('Descargar copia', exportPropios),
      fileButton('Importar copia', '.csv,.json,text/csv,application/json', (f) => { void importPropios(f); })
    ),
    row(clearButton()),
    backupNote,
  ]);
  if (!storageAvailable()) {
    note('Este navegador no deja guardar datos (¿modo privado?): lo que registres se pierde al recargar.', 'bad');
  }
  return box;
}

// ---------------------------------------------------------------- alta y busqueda

function addPerson(p: Person): RegistroResult | null {
  if (zones.size === 0) return null;
  // El id va primero y no depende de la zona: si manana el mapeo manda a esta
  // persona a otro petalo, sigue siendo la misma y su mancha no se duplica.
  const rec = mapPerson(p, ids.next(p.fecha), mapping());
  if (!rec.zona) return null;
  propios.push(rec);
  persist();
  ids.sync(records());
  placeAll();
  render();
  // Queda marcada detras del recuadro: al cerrarlo la mancha ya esta ahi.
  highlight = placed.find((pt) => pt.record.id === rec.id) ?? null;
  paint();
  search?.refresh();
  ultimoNombre = p.nombre;
  return { id: rec.id, zona: rec.zona };
}

/** "Ver mi mancha": cierra el recuadro y deja el aviso sobre el mural. */
function verMancha(): void {
  if (ultimoNombre) showFlash(`Gracias, ${ultimoNombre}. Tu mancha ya está en el mural.`);
  setOpen(null);
  startPulse();
  alta?.reset();
}

function describeRecord(r: DataRecord): string {
  // `estado_animo` es como se llamaba el campo antes de que la pregunta fuera
  // por la alimentacion: lo guardado entonces sigue teniendo que decir algo.
  const sentir = r.extra['alimentacion'] ?? r.extra['estado_animo'];
  return [sentir, r.extra['lugar_origen'], r.extra['edad'] ? `edad ${r.extra['edad']}` : '']
    .filter(Boolean)
    .join(' · ');
}

function locateRecord(r: DataRecord): void {
  const point = placed.find((p) => p.record.id === r.id) ?? null;
  highlight = point;
  paint();
  if (point) { startPulse(4000); showFicha(point); }
  else tooltip.hide();
}

// ---------------------------------------------------------------- el cursor

/** El puntero en coordenadas de trabajo, o null si cayo fuera del lienzo. */
function enLienzo(clientX: number, clientY: number): { x: number; y: number } {
  const rect = view.getBoundingClientRect();
  return {
    x: ((clientX - rect.left) / rect.width) * RENDER.width,
    y: ((clientY - rect.top) / rect.height) * RENDER.height,
  };
}

/**
 * El cursor hace dos cosas a la vez: señala a quien tiene debajo y aparta a
 * los nodos de alrededor.
 *
 * Lo que se señala se busca contra el reposo del nodo y no contra donde esta
 * corrido. Parece al reves —el nodo visible se movio— pero es lo unico que
 * deja señalar a alguien: si la busqueda siguiera al nodo apartado, acercarse
 * lo empujaria fuera del radio de toque y la ficha nunca llegaria a abrir. El
 * empuje es chico a proposito (`empuje` contra `radioToque`), asi que el nodo
 * se aparta sin salirse de donde uno le esta apuntando.
 */
view.addEventListener('mousemove', (e) => {
  cursor = enLienzo(e.clientX, e.clientY);
  animar();
  if (!grid) return;
  const hit = grid.nearest(cursor.x, cursor.y, radioToque());
  if (hit) tooltip.show(hit, e.clientX, e.clientY, fmtValue);
  else tooltip.hide();
});

view.addEventListener('mouseleave', () => {
  cursor = null;
  animar();
  tooltip.hide();
});

// En un telefono no hay puntero que seguir, pero si dedo: al tocar, la red se
// aparta un momento del punto tocado y vuelve sola.
view.addEventListener('touchstart', (e) => {
  const t = e.touches[0];
  if (!t) return;
  cursor = enLienzo(t.clientX, t.clientY);
  animar();
}, { passive: true });

view.addEventListener('touchmove', (e) => {
  const t = e.touches[0];
  if (!t) return;
  cursor = enLienzo(t.clientX, t.clientY);
  animar();
}, { passive: true });

for (const fin of ['touchend', 'touchcancel'] as const) {
  view.addEventListener(fin, () => { cursor = null; animar(); }, { passive: true });
}
window.addEventListener('scroll', () => tooltip.hide(), { passive: true });

// ---------------------------------------------------------------- pagina publica

/**
 * Deja la ilustracion del Hero dibujandose sola en bucle. El ciclo solo corre
 * con el Hero a la vista: fuera de pantalla se queda quieto donde estaba y
 * sigue desde ahi al volver, para no gastar fotogramas en vano.
 */
function initHeroReveal(img: ImageData): void {
  if (!heroCanvas) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  heroReveal = createHeroReveal(img, paintHero);
  heroReveal.play();

  const hero = document.getElementById('inicio');
  if (!hero || !('IntersectionObserver' in window)) return;
  const observer = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting) heroReveal?.play();
      else heroReveal?.pause();
    }
  }, { threshold: 0 });
  observer.observe(hero);

  // Con la pestaña en segundo plano tampoco hace falta seguir pintando.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) heroReveal?.pause();
    else if (hero.getBoundingClientRect().bottom > 0) heroReveal?.play();
  });
}

/**
 * Deja que los bloques marcados con `data-revelar` aparezcan al llegar a la
 * pantalla: el CSS los tiene unos pixeles abajo y en transparente, y aqui
 * solo se les pone la clase `revelado` cuando entran. Es de una sola vez —el
 * bloque se deja de observar al revelarse—, asi que el texto ya leido no se
 * vuelve a desvanecer al subir.
 *
 * Los que entran en la misma tanda se escalonan: el retardo de cada uno es su
 * lugar en la tanda, de modo que un parrafo tras otro en vez de todos juntos.
 */
function initRevelados(): void {
  const root = document.documentElement;
  const bloques = document.querySelectorAll<HTMLElement>('[data-revelar]');

  // El script si corrio: el respaldo en linea de la pagina ya no tiene que
  // destapar nada. El nombre no es `data-revelar` a proposito: ese es el que
  // marca los bloques, y en el <html> lo recogeria el mismo selector.
  root.dataset.revelarListo = 'on';

  if (typeof IntersectionObserver === 'undefined') {
    root.classList.remove('revelar-activo');
    return;
  }

  const observer = new IntersectionObserver((entradas) => {
    // En orden de pagina, para que el escalonado siga al de la lectura.
    const entrando = entradas
      .filter((e) => e.isIntersecting)
      .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

    entrando.forEach((e, i) => {
      const bloque = e.target as HTMLElement;
      bloque.style.setProperty('--revelar-retardo', `${i * 90}ms`);
      bloque.classList.add('revelado');
      observer.unobserve(bloque);
    });
  }, {
    // Se destapa con el bloque ya bien dentro de la pantalla, no al asomar
    // el primer pixel; el margen de abajo recorta la zona por ese lado.
    threshold: 0.15,
    rootMargin: '0px 0px -12% 0px',
  });

  for (const bloque of bloques) observer.observe(bloque);

  // Los titulos van y vienen: aparecen al entrar y se desvanecen al salir.
  const titulos = new IntersectionObserver((entradas) => {
    for (const e of entradas) e.target.classList.toggle('visible', e.isIntersecting);
  }, { threshold: 0.6, rootMargin: '-6% 0px -10% 0px' });
  for (const t of document.querySelectorAll('[data-titulo]')) titulos.observe(t);
}

function initLanding(): void {
  initRevelados();

  // Muestras reales de acuarela para las tarjetas de la escala de la pagina.
  // La semilla se queda como estaba (`animo|<nombre>`): es lo que hace que
  // cada paso tenga siempre la misma silueta, en la pagina y en el alta.
  for (const node of document.querySelectorAll<HTMLCanvasElement>('canvas[data-sentir]')) {
    const name = node.dataset.sentir ?? '';
    const sentir = SENTIRES.find((s) => s.name === name);
    if (!sentir) continue;

    paintBlob(node, ramp, sentir.valor, { size: 58, seed: `animo|${sentir.name}` });

    // El medidor de la tarjeta se tine con el pigmento de su mancha, no con
    // un carmin de adorno: la barra y la muestra tienen que ser el mismo
    // color de la rampa para que el numero y la mancha digan lo mismo.
    const tarjeta = node.closest<HTMLElement>('.escala-tarjeta');
    if (tarjeta) {
      const { r, g, b } = ramp.at(sentir.valor);
      tarjeta.style.setProperty(
        '--tinta',
        `rgb(${Math.round(r)} ${Math.round(g)} ${Math.round(b)})`
      );
    }
  }

  // Botones del Hero y las secciones que bajan al mural y abren un panel.
  for (const btn of document.querySelectorAll<HTMLElement>('[data-mural-action]')) {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const action = btn.dataset.muralAction;
      const target = document.getElementById('mural') ?? page;
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (action === 'registrar') setOpen('registrar');
      else if (action === 'buscar') setOpen('buscar');
      else setOpen(null);
    });
  }

  // Animacion al salir del Hero haciendo scroll hacia el mural.
  const hero = document.getElementById('inicio');
  const heroContent = document.getElementById('hero-content');
  const heroBg = document.getElementById('hero-bg');
  const heroHint = document.getElementById('hero-hint');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // La barra superior se funde con el Hero mientras este a la vista y recupera
  // su fondo solido al entrar en el resto de las secciones.
  const nav = document.getElementById('nav');
  if (nav && hero) {
    const syncNav = () => {
      nav.classList.toggle('glass-nav--hero', window.scrollY < hero.offsetHeight * 0.5);
    };
    window.addEventListener('scroll', syncNav, { passive: true });
    window.addEventListener('resize', syncNav);
    syncNav();
  }

  // El Hero ocupa la pantalla entera: el primer gesto (rueda, deslizar, toque
  // o tecla) no desplaza de a poco sino que baja de un salto al mural. Solo
  // actua mientras la pagina esta arriba del todo; despues el scroll es normal.
  const muralSection = document.getElementById('mural');
  if (hero && muralSection) {
    let jumping = false;

    /** Arriba del todo, con el Hero llenando la pantalla. */
    const atHero = (): boolean => window.scrollY < 24;

    const goToMural = (e?: Event): void => {
      if (jumping || !atHero()) return;
      e?.preventDefault();
      jumping = true;
      muralSection.scrollIntoView({
        behavior: reduceMotion ? 'auto' : 'smooth',
        block: 'start',
      });
      // Candado mientras corre el desplazamiento suave, para que los gestos
      // que siguen no lo reinicien ni lo peleen.
      window.setTimeout(() => { jumping = false; }, reduceMotion ? 0 : 900);
    };

    // Rueda y trackpad: solo hacia abajo (hacia arriba ya no hay nada).
    window.addEventListener('wheel', (e) => {
      if (e.deltaY > 0) goToMural(e);
    }, { passive: false });

    // Dedo: cuenta como gesto en cuanto sube lo suficiente.
    let touchY: number | null = null;
    hero.addEventListener('touchstart', (e) => {
      touchY = e.touches[0]?.clientY ?? null;
    }, { passive: true });
    hero.addEventListener('touchmove', (e) => {
      const y = e.touches[0]?.clientY;
      if (touchY === null || y === undefined) return;
      if (touchY - y > 12) goToMural(e);
    }, { passive: false });

    // Toque o clic suelto sobre el Hero (no sobre un boton o enlace).
    hero.addEventListener('click', (e) => {
      if ((e.target as Element | null)?.closest('a, button, input, [data-mural-action]')) return;
      goToMural();
    });

    // Teclado: las teclas con las que se baja una pantalla.
    window.addEventListener('keydown', (e) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as Element | null;
      if (target?.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (['ArrowDown', 'PageDown', ' ', 'Spacebar', 'End'].includes(e.key)) goToMural(e);
    });
  }

  if (hero && (heroContent || heroBg) && !reduceMotion) {
    let ticking = false;
    const updateHeroExit = () => {
      ticking = false;
      const h = Math.max(1, hero.offsetHeight);
      const t = Math.min(1, Math.max(0, window.scrollY / (h * 0.85)));
      if (heroContent) {
        heroContent.style.opacity = String(Math.max(0, 1 - t * 1.15));
        heroContent.style.transform = `translate3d(0, ${-t * 44}px, 0) scale(${1 - t * 0.06})`;
        heroContent.style.filter = `blur(${t * 6}px)`;
      }
      if (heroBg) {
        heroBg.style.opacity = String(Math.max(0.15, 1 - t * 0.7));
        heroBg.style.transform = `translate3d(0, ${t * 56}px, 0) scale(${1 + t * 0.08})`;
      }
      if (heroHint) {
        heroHint.style.opacity = String(Math.max(0, 1 - t * 4));
      }
    };
    window.addEventListener('scroll', () => {
      if (!ticking) {
        ticking = true;
        requestAnimationFrame(updateHeroExit);
      }
    }, { passive: true });
    updateHeroExit();
  }
}

initLanding();

// ---------------------------------------------------------------- arranque

function panelHeader(title: string, lead: string): HTMLElement[] {
  return [
    el('h2', { text: title }),
    el('p', { class: 'mb-3 text-sm leading-[1.45] text-muted', text: lead }),
  ];
}

async function start(): Promise<void> {
  tools.classList.add('hidden');
  const loading = el('p', { class: 'text-sm text-muted', text: 'Cargando el mural…' });
  mural.append(loading);

  const [d, cfgText, csvText, espinaText, trazosText] = await Promise.all([
    loadDrawingUrl(PLANTILLA_DIBUJO),
    fetch(PLANTILLA_ZONAS).then((r) => r.text()),
    fetch(DATOS_EJEMPLO).then((r) => r.text()),
    // La espiral es el eje y las lineas son el detalle que se le va sumando
    // al recorrido. Si faltaran, el mural tiene que abrir igual: sin espiral
    // se cae al reparto por zonas de antes (ver `placeAll`), y sin lineas la
    // red se queda en el cuerpo, que es lo que dibujaba hasta ahora.
    fetch(PLANTILLA_ESPINA).then((r) => (r.ok ? r.text() : '')).catch(() => ''),
    fetch(PLANTILLA_TRAZOS).then((r) => (r.ok ? r.text() : '')).catch(() => ''),
  ]);

  drawing = d;
  RENDER.width = d.width;
  RENDER.height = d.height;
  // Sin fondo: la escena es transparente y un blanco aca volveria a dibujar
  // el recuadro al componer en multiply.
  lines = linesLayer(d, d.width, d.height, false);

  const cfg = parseConfig(cfgText);
  const analysis = analyzeDrawing(d.imageData, d.width, d.height, {
    threshold: cfg.threshold,
    dilate: cfg.dilate,
    // Mientras el boceto no cierre sus regiones, lo pintable es el relleno
    // del trazo (ver `strokeFill`); el dibujo terminado llegara con 0.
    close: cfg.close ?? 0,
    minArea: cfg.minArea ?? 180,
  });
  zones = zonesFromConfig(cfg, analysis, cfg.margin ?? 3).zones;
  field = { width: d.width, height: d.height, dist: analysis.dist };
  const medidas = medidasParaDibujo(
    Math.max(d.width, d.height),
    typicalDepth(zones, analysis.dist)
  );
  RENDER.watercolor = medidas.watercolor;
  RENDER.trazo = medidas.trazo;
  RENDER.rama = medidas.rama;
  RENDER.tronco = medidas.tronco;
  RENDER.testimonios = medidas.testimonios;

  if (espinaText) {
    try {
      espina = espinaDesde(parseEspinaJson(espinaText), d.width, d.height);
    } catch (err) {
      console.warn('No se pudo leer la espina del dibujo:', err);
    }
  }

  // Medir el dibujo y anclar cada linea a la espiral es trabajo de una sola
  // vez; lo que se rehace en cada alta es solo cuanto de el entra.
  if (espina && trazosText) {
    try {
      const boceto = bocetoDesde(parseBocetoJson(trazosText), d.width, d.height, RENDER.pincelada.tramo);
      trama = tramaDe(boceto, espina);
    } catch (err) {
      console.warn('No se pudieron leer las lineas del dibujo:', err);
    }
  }

  // El CSV simulado trae la zona que le toco en una version anterior del
  // dibujo: eso es cache, no dato. Se remapea con la regla vigente (mapeo 0 =
  // "de otra version", fuerza el recalculo) para que caiga donde corresponde
  // en la plantilla de hoy, igual que lo registrado en el dispositivo.
  base = remapAll(parseCsvText(csvText).records, 0, mapping()).records;

  // Lo guardado en este dispositivo puede venir de una version anterior del
  // mapeo: se recalcula con la regla vigente y se vuelve a guardar, asi no
  // quedan dos reglas mezcladas en el mismo mural.
  const guardado = loadLocal();
  const { records: propiosAlDia, remapped } = remapAll(guardado.records, guardado.mapeo, mapping());
  propios = propiosAlDia;
  if (remapped > 0) saveLocal(propios);
  ids.sync(records());

  alta = registroForm({ ramp, add: addPerson, onDone: verMancha });
  addPanel.append(
    ...panelHeader('Súmate al mural', 'Cinco pantallas cortas y tu mancha de acuarela queda en el mural.'),
    alta.root,
    // `count` no viste: es el gancho con el que `refreshCount` lo encuentra.
    el('p', { class: 'count mt-3 text-right text-xs text-muted' }),
    // El respaldo es tarea de quien atiende el kiosco, no de quien se registra.
    el('details', { class: 'mas' }, [el('summary', { text: 'Mis registros' }), backupBox()])
  );

  search = personSearch({
    search: (q) => searchByName(records(), q),
    locate: locateRecord,
    describe: describeRecord,
  });
  searchPanel.append(
    ...panelHeader('Buscar una persona', 'Escribe un nombre y elige un resultado para ver dónde quedó su mancha.'),
    search.root
  );

  loading.remove();
  tools.classList.remove('hidden');
  placeAll();
  render();

  observarVisibilidad();
  seguirTamano();
  animar();

  // Con la escena ya pintada, el Hero se dibuja solo trazo a trazo.
  initHeroReveal(d.imageData);
}

/** El pulso solo corre con el mural a la vista. */
function observarVisibilidad(): void {
  if (typeof IntersectionObserver === 'undefined') return;
  new IntersectionObserver((entradas) => {
    muralVisible = entradas.some((e) => e.isIntersecting);
    if (muralVisible) animar();
    else {
      // Fuera de la vista no hay cursor que esquivar: la red vuelve al reposo
      // de una vez, para que al volver no se la encuentre a medio camino.
      cursor = null;
      if (red) { enReposo(red); redViva = false; }
      detenerAnimacion();
    }
  }, { threshold: 0.05 }).observe(mural);
}

/**
 * Al cambiar el tamano de la caja hay que volver a rasterizar: la escena esta
 * pintada a la medida de la anterior. Se espera a que el gesto termine —un
 * arrastre de ventana son decenas de eventos y cada render son decimas— y se
 * re-renderiza solo si la escala cambio de verdad.
 */
function seguirTamano(): void {
  let timer = 0;
  const alCambiar = () => {
    clearTimeout(timer);
    timer = window.setTimeout(() => {
      const antes = escala;
      if (Math.abs(ajustarLienzo() - antes) > 0.01) render();
    }, 180);
  };
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(alCambiar).observe(mural);
  else window.addEventListener('resize', alCambiar);
}

start().catch((err) => {
  mural.append(el('p', { class: 'text-sm text-muted', text: `No se pudo cargar el mural: ${err}` }));
});
