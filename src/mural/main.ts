/**
 * Pantalla de registro: la ilustracion a pantalla completa y dos iconos
 * al pie, uno para buscar y otro para registrar. Cada uno abre su recuadro
 * hacia arriba; mientras tanto solo se ve el mural.
 *
 * Carga el mural de ejemplo (dibujo + zonas + CSV), le suma las personas que
 * se registraron en este dispositivo y vuelve a pintar con cada alta. No tiene
 * controles de parametros: esos viven en el studio (`/studio`).
 *
 * Todo queda en la maquina: el CSV de ejemplo es de solo lectura y las altas
 * se guardan en localStorage (ver `@data/repo/localRepo`), con copia a archivo para
 * no depender de que el navegador conserve sus datos.
 */
import { loadDrawingUrl, linesLayer, type LoadedDrawing } from '@io/readers/drawing';
import { parseCsvText } from '@io/readers/csv';
import { recordsToCsv } from '@io/writers/csv';
import { parseConfig } from '@io/zonesConfig';
import { DATOS_EJEMPLO, PLANTILLA_DIBUJO, PLANTILLA_ZONAS } from '@io/plantilla';
import { downloadText } from '@io/writers/download';
import { clearLocal, loadLocal, mergeById, parseBackup, saveLocal, storageAvailable } from '@data/repo/localRepo';
import { analyzeDrawing, placeRecords, typicalDepth, zonesFromConfig } from '@core/scene';
import { renderScene } from '@core/render/compose';
import { CARMIN, ColorRamp } from '@core/render/palette';
import { PAPER_COLOR } from '@core/render/paper';
import { DEFAULT_WATERCOLOR } from '@core/render/watercolor';
import { SpatialGrid } from '@core/sampling/grid';
import {
  MOODS, PERSON_FIELD_KEYS, PersonIds, searchByName, todayIso, type Person,
} from '@data/person';
import { mapPerson, remapAll, zonasDisponibles, type MappingContext } from '@data/mapping';
import { personSearch, type PersonSearch } from '@ui/personPanel';
import { registroForm, type RegistroForm, type RegistroResult } from '@ui/registroForm';
import { paintBlob } from '@ui/blob';
import { Tooltip } from '@ui/tooltip';
import { createHeroReveal, type HeroReveal } from './heroReveal';
import { el, button, fileButton, row } from '@ui/controls';
import type { DataRecord, PlacedPoint, RenderOptions, ZoneMap } from '@core/types';

const RENDER: RenderOptions = {
  width: 0, height: 0,
  watercolor: { ...DEFAULT_WATERCOLOR },
  bleed: 0, grain: 0.5,
  globalSeed: 1234, showLines: true, lineAlpha: 0.9,
  // Sin papel: la ilustracion va a sangre sobre el fondo de la pagina, sin el
  // recuadro que dibujaba el lienzo opaco.
  paper: false,
};

/**
 * Tamano de la mancha como fraccion del lado mayor del dibujo. La plantilla se
 * rasteriza al vuelo desde el SVG, asi que el lienzo mide lo que de el archivo
 * (hoy ~2000 px): con un radio fijo en pixeles las manchas se verian del
 * tamano de una mota. Atado a la proporcion, el mural se ve igual aunque
 * manana la ilustracion se exporte mas grande o mas chica.
 */
const RADIO_MANCHA = 0.019;

/**
 * ...salvo que el hueco donde tiene que caer sea mas angosto que eso: entonces
 * manda el hueco, y la mancha mide mas o menos su ancho (`typicalDepth` da la
 * mitad). Es lo que deja que el mismo mural sirva para un dibujo de petalos
 * anchos y para un boceto que todavia es una cinta de 14 px: con el radio de
 * siempre, cada mancha saldria recortada en una raya y el trazo entero se
 * empastaria de un solo rojo.
 */
const ANCHO_HUECO = 2.2;

/** Radio de mancha que le cabe a este dibujo. */
function radioMancha(lado: number, hueco: number): number {
  const porDibujo = lado * RADIO_MANCHA;
  const porHueco = hueco > 0 ? hueco * ANCHO_HUECO : porDibujo;
  return Math.max(4, Math.round(Math.min(porDibujo, porHueco)));
}

const ramp = new ColorRamp(CARMIN);
const ids = new PersonIds();

/** Lo que el mapeo necesita saber del mural: las zonas que hay ahora. */
const mapping = (): MappingContext => ({ zonas: zonasDisponibles(zones) });
const fmtValue = (v: number) => v.toFixed(3).replace(/\.?0+$/, '');

let drawing: LoadedDrawing | null = null;
let zones: ZoneMap = new Map();
let lines: HTMLCanvasElement | null = null;
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
let pulseRaf = 0;

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

// ---------------------------------------------------------------- pintado

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

function placeAll(): void {
  const { min, max } = valueRange();
  placed = placeRecords(records(), zones, {
    mode: 'random', minDistFactor: 1, globalSeed: RENDER.globalSeed,
    width: RENDER.width, min, max,
  }).placed;
  grid = new SpatialGrid(Math.max(8, RENDER.watercolor.radius), RENDER.width, RENDER.height);
  for (const p of placed) grid.insert(p);
  refreshCounts();
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

function render(): void {
  renderScene(scene, { zones, points: placed, ramp, options: RENDER, lines }, 1);
  paint();
  paintHero();
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

function paint(): void {
  if (!drawing) return;
  if (view.width !== RENDER.width || view.height !== RENDER.height) {
    view.width = RENDER.width;
    view.height = RENDER.height;
  }
  ctx.clearRect(0, 0, view.width, view.height);
  ctx.drawImage(scene, 0, 0);
  if (!highlight) return;

  // Marca sobre la mancha recien agregada o encontrada.
  const r = Math.max(16, RENDER.watercolor.radius * 2);
  for (const [color, w] of [['rgba(255, 253, 248, 0.95)', 5], ['rgba(28, 24, 18, 0.9)', 2]] as const) {
    ctx.strokeStyle = color;
    ctx.lineWidth = w;
    ctx.beginPath();
    ctx.arc(highlight.x, highlight.y, r, 0, Math.PI * 2);
    ctx.stroke();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      ctx.beginPath();
      ctx.moveTo(highlight.x + dx * (r + 4), highlight.y + dy * (r + 4));
      ctx.lineTo(highlight.x + dx * (r + 12), highlight.y + dy * (r + 12));
      ctx.stroke();
    }
  }

  // Onda que se abre y se apaga: en el dibujo lleno de manchas, es lo que
  // hace que la propia se encuentre de un vistazo al cerrar el recuadro.
  const queda = pulseUntil - performance.now();
  if (queda <= 0) return;
  const fase = (performance.now() % PULSE_MS) / PULSE_MS;
  const fin = Math.min(1, queda / 900);   // se desvanece al terminar
  // Mismo carmin que `--accent` en mural.css.
  ctx.strokeStyle = `rgba(158, 43, 43, ${(1 - fase) * 0.75 * fin})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(highlight.x, highlight.y, r + fase * r * 2.4, 0, Math.PI * 2);
  ctx.stroke();
}

const PULSE_MS = 1500;

/** Hace latir la marca unos segundos sobre la mancha resaltada. */
function startPulse(ms = 6000): void {
  pulseUntil = performance.now() + ms;
  if (pulseRaf) return;
  const tick = () => {
    pulseRaf = 0;
    paint();
    if (highlight && performance.now() < pulseUntil) pulseRaf = requestAnimationFrame(tick);
  };
  pulseRaf = requestAnimationFrame(tick);
}

/** Ficha de la persona, anclada a su mancha en el lienzo. */
function showFicha(point: PlacedPoint): void {
  const rect = view.getBoundingClientRect();
  tooltip.show(
    point,
    rect.left + (point.x / view.width) * rect.width,
    rect.top + (point.y / view.height) * rect.height,
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
  return [r.extra['estado_animo'], r.extra['lugar_origen'], r.extra['edad'] ? `edad ${r.extra['edad']}` : '']
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

// ---------------------------------------------------------------- hover

view.addEventListener('mousemove', (e) => {
  if (!grid) return;
  const rect = view.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * view.width;
  const y = ((e.clientY - rect.top) / rect.height) * view.height;
  const hit = grid.nearest(x, y, Math.max(6, RENDER.watercolor.radius * 1.1));
  if (hit) tooltip.show(hit, e.clientX, e.clientY, fmtValue);
  else tooltip.hide();
});
view.addEventListener('mouseleave', () => tooltip.hide());
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

function initLanding(): void {
  // Muestras reales de acuarela para la leyenda de emociones de la pagina.
  for (const node of document.querySelectorAll<HTMLCanvasElement>('canvas[data-mood]')) {
    const moodName = node.dataset.mood ?? '';
    const mood = MOODS.find((m) => m.name === moodName);
    if (mood) {
      paintBlob(node, ramp, mood.valor, { size: 62, seed: `animo|${mood.name}` });
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

  const [d, cfgText, csvText] = await Promise.all([
    loadDrawingUrl(PLANTILLA_DIBUJO),
    fetch(PLANTILLA_ZONAS).then((r) => r.text()),
    fetch(DATOS_EJEMPLO).then((r) => r.text()),
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
  RENDER.watercolor.radius = radioMancha(
    Math.max(d.width, d.height),
    typicalDepth(zones, analysis.dist)
  );

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
    ...panelHeader('Súmate al mural', 'Tres preguntas y tu mancha de acuarela queda en el mural.'),
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

  // Con la escena ya pintada, el Hero se dibuja solo trazo a trazo.
  initHeroReveal(d.imageData);
}

start().catch((err) => {
  mural.append(el('p', { class: 'text-sm text-muted', text: `No se pudo cargar el mural: ${err}` }));
});
