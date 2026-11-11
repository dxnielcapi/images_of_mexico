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
import { downloadText } from '@io/writers/download';
import { clearLocal, loadLocal, mergeById, parseBackup, saveLocal, storageAvailable } from '@data/repo/localRepo';
import { analyzeDrawing, placeRecords, zonesFromConfig } from '@core/scene';
import { renderScene } from '@core/render/compose';
import { ColorRamp, PALETTES } from '@core/render/palette';
import { DEFAULT_WATERCOLOR } from '@core/render/watercolor';
import { SpatialGrid } from '@core/sampling/grid';
import {
  PERSON_FIELD_KEYS, PersonIds, personToRecord, searchByName, todayIso, type Person,
} from '@data/person';
import { personSearch, type PersonSearch } from '@ui/personPanel';
import { registroForm, type RegistroForm, type RegistroResult } from '@ui/registroForm';
import { Tooltip } from '@ui/tooltip';
import { el, button, fileButton, row } from '@ui/controls';
import type { DataRecord, PlacedPoint, RenderOptions, ZoneMap } from '@core/types';

const BASE = import.meta.env.BASE_URL;

const RENDER: RenderOptions = {
  width: 0, height: 0,
  watercolor: { ...DEFAULT_WATERCOLOR },
  bleed: 0, grain: 0.5, paletteId: 'pigmentos',
  globalSeed: 1234, showLines: true, lineAlpha: 0.9,
};

const ramp = new ColorRamp(PALETTES[0].stops);
const ids = new PersonIds();
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

const view = el('canvas', { class: 'max-w-full max-h-full bg-paper shadow-paper' });

// El aviso flotante se apoya sobre la fila de iconos, nunca debajo.
const flash = el('div', {
  class: 'hidden absolute left-1/2 -translate-x-1/2 bottom-[calc(var(--bar)+14px)] '
    + 'max-w-[80%] telefono:max-w-[calc(100%-var(--edge)*2)] px-4 py-[9px] rounded-full '
    + 'bg-[rgb(32_28_22_/_0.92)] text-[#f6f1e6] text-base text-center shadow-[0_8px_24px_rgb(0_0_0_/_0.22)]',
});

const mural = el('section', {
  class: 'absolute inset-0 flex items-center justify-center overflow-hidden '
    + 'p-6 pb-[calc(24px+var(--bar))] '
    + 'bg-[radial-gradient(circle_at_50%_35%,#f7f2e8_0%,#e6dfd1_100%)]',
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
document.body.append(page);

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
  panel.querySelector('input')?.focus();
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
  if (mine) {
    mine.textContent = `${plural(propios.length, 'registro guardado', 'registros guardados')} en este dispositivo`;
  }
}

function render(): void {
  renderScene(scene, { zones, points: placed, ramp, options: RENDER, lines }, 1);
  paint();
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
    incoming = parseBackup(await file.text());
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

function zonaAlAzar(): string {
  const names = [...zones.keys()];
  return names[Math.floor(Math.random() * names.length)];
}

function addPerson(p: Person): RegistroResult | null {
  const zona = zonaAlAzar();
  if (!zona) return null;
  const rec = personToRecord(p, zona, ids.next(zona, p.fecha));
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
  return { id: rec.id, zona };
}

/** "Ver mi mancha": cierra el recuadro y deja el aviso sobre el mural. */
function verMancha(): void {
  if (ultimoNombre) showFlash(`Gracias, ${ultimoNombre}. Tu mancha ya está en la flor.`);
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
    loadDrawingUrl(`${BASE}samples/flor.png`),
    fetch(`${BASE}samples/flor.zones.json`).then((r) => r.text()),
    fetch(`${BASE}samples/datos_ejemplo.csv`).then((r) => r.text()),
  ]);

  drawing = d;
  RENDER.width = d.width;
  RENDER.height = d.height;
  lines = linesLayer(d, d.width, d.height);

  const cfg = parseConfig(cfgText);
  const analysis = analyzeDrawing(d.imageData, d.width, d.height, {
    threshold: cfg.threshold,
    dilate: cfg.dilate,
    minArea: cfg.minArea ?? 180,
  });
  zones = zonesFromConfig(cfg, analysis, cfg.margin ?? 3).zones;

  base = parseCsvText(csvText).records;
  propios = loadLocal();
  ids.sync(records());

  alta = registroForm({ ramp, add: addPerson, onDone: verMancha });
  addPanel.append(
    ...panelHeader('Súmate al mural', 'Tres preguntas y tu mancha de acuarela queda en la flor.'),
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
}

start().catch((err) => {
  mural.append(el('p', { class: 'text-sm text-muted', text: `No se pudo cargar el mural: ${err}` }));
});
