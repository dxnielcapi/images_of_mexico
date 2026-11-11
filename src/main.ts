import './style.css';
import { loadDrawingFile, loadDrawingUrl, linesLayer, extractSvgPaths, type LoadedDrawing } from './io/loadDrawing';
import { parseCsvFile, parseCsvText, pointsToCsv, type CsvResult } from './io/loadCsv';
import { buildConfig, parseConfig, downloadText, downloadCanvas } from './io/zonesConfig';
import { type LabelResult } from './zones/connectedComponents';
import { buildZone, pastelFor, type Zone } from './zones/zoneMask';
import {
  analyzeDrawing, hueFor, placeRecords, zoneFromSeeds, zonesFromConfig, type Analysis,
} from './scene';
import { SpatialGrid } from './sampling/grid';
import { ColorRamp, PALETTES } from './render/palette';
import { DEFAULT_WATERCOLOR } from './render/watercolor';
import { renderScene } from './render/compose';
import { drawLegend } from './render/legend';
import { el, section, slider, button, row, checkbox, selectBox, fileButton, numberInput } from './ui/controls';
import { renderZoneList } from './ui/zonePanel';
import { Tooltip } from './ui/tooltip';
import { emptyFilters, applyFilters, renderFilters, type FilterState } from './ui/filters';
import { personForm, personSearch, type PersonForm, type PersonSearch } from './ui/personPanel';
import {
  NAME_KEY, PERSON_FIELD_KEYS, PersonIds, personToRecord, randomPerson, searchByName, type Person,
} from './data/person';
import { mulberry32 } from './sampling/prng';
import type { DataRecord, PlacedPoint, PlacementMode, RenderOptions, Warning, ZonesConfig } from './types';

// ---------------------------------------------------------------- estado

interface State {
  drawing: LoadedDrawing | null;
  ink: Uint8Array | null;
  dist: Float32Array | null;
  labeling: LabelResult | null;
  zones: Map<string, Zone>;
  zoneSeq: number;
  selected: string | null;
  hoverLabel: number;
  records: DataRecord[];
  placed: PlacedPoint[];
  warnings: Warning[];
  csv: CsvResult | null;
  filters: FilterState;
  fixedRange: { on: boolean; min: number; max: number };
  detect: { threshold: number; dilate: number; minArea: number; margin: number; useSvgPaths: boolean };
  placement: { mode: PlacementMode; minDistFactor: number };
  render: RenderOptions;
  view: 'zones' | 'render';
  showOriginal: boolean;
  /** Registro resaltado por el buscador o recien agregado. */
  highlightId: string | null;
}

const S: State = {
  drawing: null, ink: null, dist: null, labeling: null,
  zones: new Map(), zoneSeq: 0, selected: null, hoverLabel: 0,
  records: [], placed: [], warnings: [], csv: null,
  filters: emptyFilters(0, 1),
  fixedRange: { on: false, min: 0, max: 1 },
  detect: { threshold: 150, dilate: 1, minArea: 180, margin: 3, useSvgPaths: false },
  placement: { mode: 'random', minDistFactor: 1 },
  render: {
    width: 0, height: 0,
    watercolor: { ...DEFAULT_WATERCOLOR },
    bleed: 0, grain: 0.5, paletteId: 'pigmentos',
    globalSeed: 1234, showLines: true, lineAlpha: 0.9,
  },
  view: 'zones',
  showOriginal: false,
  highlightId: null,
};

let ramp = new ColorRamp(PALETTES[0].stops);
let sceneCanvas = document.createElement('canvas');
let inkCanvas: HTMLCanvasElement | null = null;
let linesCanvas: HTMLCanvasElement | null = null;
let zonesOverlay: HTMLCanvasElement | null = null;
const regionOverlayCache = new Map<number, { canvas: HTMLCanvasElement; x: number; y: number }>();
let grid: SpatialGrid<PlacedPoint & { x: number; y: number }> | null = null;
let sceneDirty = true;

// ---------------------------------------------------------------- layout

const app = el('div', { class: 'grid grid-cols-[320px_1fr] h-screen overflow-hidden' });

const sidebar = el('aside', {
  class: 'overflow-y-auto bg-panel border-r border-line px-3.5 pt-3 pb-12',
});

const stage = el('main', {
  class: 'relative flex items-center justify-center overflow-hidden px-5 pt-11 pb-9 '
    + 'bg-[radial-gradient(circle_at_50%_35%,#f7f2e8_0%,#e6dfd1_100%)]',
});

const view = el('canvas', {
  class: 'max-w-full max-h-full bg-paper shadow-paper cursor-crosshair',
});

const stageHint = el('div', {
  class: 'absolute top-2.5 right-3.5 px-2 py-[3px] rounded-[10px] '
    + 'bg-[rgb(255_253_248_/_0.85)] text-xs text-muted pointer-events-none',
});
stage.append(view, stageHint);
app.append(sidebar, stage);
document.body.append(app);
const tooltip = new Tooltip(document.body);
const viewCtx = view.getContext('2d')!;

const statusBar = el('div', { class: 'status', text: 'Carga un dibujo para empezar.' });
stage.append(statusBar);

function setStatus(msg: string, kind: 'info' | 'warn' | 'ok' = 'info') {
  statusBar.textContent = msg;
  statusBar.className = `status ${kind}`;
}

// ---------------------------------------------------------------- deteccion de zonas

function detectZones(preserve = true): void {
  if (!S.drawing) return;
  const t0 = performance.now();
  const { width, height, imageData } = S.drawing;

  const { ink, dist, labeling } = analyzeDrawing(imageData, width, height, S.detect);

  S.ink = ink;
  S.dist = dist;
  S.labeling = labeling;
  inkCanvas = inkToCanvas(ink, width, height);
  regionOverlayCache.clear();

  const seeds = preserve
    ? [...S.zones.values()].map((z) => ({ name: z.name, seedPoints: z.seedPoints }))
    : [];
  S.zones.clear();
  if (!preserve) S.zoneSeq = 0;
  for (const z of seeds) addZoneFromSeeds(z.name, z.seedPoints);

  rebuildZonesOverlay();
  invalidateScene();
  refreshZonePanel();
  refreshFilters();
  const ms = Math.round(performance.now() - t0);
  setStatus(`${labeling.regions.size} regiones detectadas en ${ms} ms · ${S.zones.size} zonas activas`, 'ok');
  paint();
}

function inkToCanvas(ink: Uint8Array, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < ink.length; i++) {
    const v = ink[i] ? 25 : 255;
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = v;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function labelAt(x: number, y: number): number {
  if (!S.labeling) return 0;
  const { width, height, labels } = S.labeling;
  if (x < 0 || y < 0 || x >= width || y >= height) return 0;
  return labels[(y | 0) * width + (x | 0)];
}

function zoneOfLabel(label: number): Zone | null {
  if (!label) return null;
  for (const z of S.zones.values()) if (z.regions.includes(label)) return z;
  return null;
}

/** El analisis vigente del dibujo, si ya se detecto. */
function currentAnalysis(): Analysis | null {
  if (!S.ink || !S.dist || !S.labeling) return null;
  return { ink: S.ink, dist: S.dist, labeling: S.labeling };
}

function addZoneFromSeeds(name: string, seedPoints: [number, number][]): Zone | null {
  const a = currentAnalysis();
  if (!a) return null;
  const zone = zoneFromSeeds(name, seedPoints, a, S.detect.margin, hueFor(S.zoneSeq));
  if (!zone) return null;
  S.zoneSeq++;
  S.zones.set(name, zone);
  return zone;
}

function rebuildZone(zone: Zone, regions: number[]): void {
  if (!S.labeling || !S.dist) return;
  const rebuilt = buildZone(zone.name, regions, S.labeling, S.dist, S.detect.margin, zone.hue);
  S.zones.set(zone.name, rebuilt);
}

function rebuildAllZones(): void {
  if (!S.labeling || !S.dist) return;
  for (const z of [...S.zones.values()]) rebuildZone(z, z.regions);
  rebuildZonesOverlay();
  invalidateScene();
}

function uniqueZoneName(base: string): string {
  if (!S.zones.has(base)) return base;
  let i = 2;
  while (S.zones.has(`${base}_${i}`)) i++;
  return `${base}_${i}`;
}

function createZoneAt(label: number): void {
  const name = uniqueZoneName(`zona_${String(S.zones.size + 1).padStart(2, '0')}`);
  const zone = addZoneFromSeeds(name, seedPointsOf([label]));
  if (!zone) return;
  S.selected = name;
  rebuildZonesOverlay();
  invalidateScene();
  refreshZonePanel(true);
  refreshFilters();
}

function seedPointsOf(labels: number[]): [number, number][] {
  const out: [number, number][] = [];
  for (const l of labels) {
    const r = S.labeling?.regions.get(l);
    if (r) out.push([r.seedX, r.seedY]);
  }
  return out;
}

/** Toma las N regiones mas grandes y las convierte en zonas nombradas. */
function autoZones(n: number): void {
  if (!S.labeling) return;
  const sorted = [...S.labeling.regions.values()].sort((a, b) => b.area - a.area).slice(0, n);
  S.zones.clear();
  S.zoneSeq = 0;
  sorted.forEach((r, i) => {
    addZoneFromSeeds(`zona_${String(i + 1).padStart(2, '0')}`, [[r.seedX, r.seedY]]);
  });
  S.selected = null;
  rebuildZonesOverlay();
  invalidateScene();
  refreshZonePanel();
  refreshFilters();
  placeAndRender();
  setStatus(`${S.zones.size} zonas creadas automaticamente.`, 'ok');
}

// ---------------------------------------------------------------- overlays

function rebuildZonesOverlay(): void {
  if (!S.labeling) { zonesOverlay = null; return; }
  const { width, height } = S.labeling;
  const c = document.createElement('canvas');
  c.width = width; c.height = height;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(width, height);
  for (const zone of S.zones.values()) {
    const { r, g, b } = hslToRgb(zone.hue, 0.7, 0.68);
    for (let y = 0; y < zone.maskH; y++) {
      for (let x = 0; x < zone.maskW; x++) {
        if (!zone.mask[y * zone.maskW + x]) continue;
        const gi = ((y + zone.minY) * width + (x + zone.minX)) * 4;
        img.data[gi] = r; img.data[gi + 1] = g; img.data[gi + 2] = b;
        img.data[gi + 3] = 110;
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  zonesOverlay = c;
}

function regionOverlay(label: number): { canvas: HTMLCanvasElement; x: number; y: number } | null {
  if (!S.labeling) return null;
  const cached = regionOverlayCache.get(label);
  if (cached) return cached;
  const r = S.labeling.regions.get(label);
  if (!r) return null;
  const w = r.maxX - r.minX + 1;
  const h = r.maxY - r.minY + 1;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  const { labels, width } = S.labeling;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (labels[(y + r.minY) * width + (x + r.minX)] !== label) continue;
      const i = (y * w + x) * 4;
      img.data[i] = 90; img.data[i + 1] = 140; img.data[i + 2] = 230; img.data[i + 3] = 120;
    }
  }
  ctx.putImageData(img, 0, 0);
  const entry = { canvas: c, x: r.minX, y: r.minY };
  if (regionOverlayCache.size > 400) regionOverlayCache.clear();
  regionOverlayCache.set(label, entry);
  return entry;
}

function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return { r: Math.round(f(0) * 255), g: Math.round(f(8) * 255), b: Math.round(f(4) * 255) };
}

// ---------------------------------------------------------------- datos y colocacion

function normalizedRange(): { min: number; max: number } {
  if (S.fixedRange.on) return { min: S.fixedRange.min, max: S.fixedRange.max };
  return { min: S.csv?.min ?? 0, max: S.csv?.max ?? 1 };
}

function placePoints(): void {
  const t0 = performance.now();
  S.placed = [];
  const warnings = S.warnings.filter((w) => w.kind !== 'zona-inexistente' && w.kind !== 'sin-lugar');
  if (!S.labeling) { S.warnings = warnings; return; }

  const { min, max } = normalizedRange();
  const res = placeRecords(applyFilters(S.records, S.filters), S.zones, {
    mode: S.placement.mode,
    minDistFactor: S.placement.minDistFactor,
    globalSeed: S.render.globalSeed,
    width: S.labeling.width,
    min, max,
  });

  S.placed = res.placed;
  S.warnings = [...warnings, ...res.warnings];
  buildGrid();
  invalidateScene();
  refreshWarnings();
  refreshZonePanel();
  const ms = Math.round(performance.now() - t0);
  setStatus(`${S.placed.length} puntos colocados en ${ms} ms (modo ${S.placement.mode}).`);
}

function buildGrid(): void {
  if (!S.labeling) { grid = null; return; }
  const cell = Math.max(8, S.render.watercolor.radius);
  grid = new SpatialGrid(cell, S.labeling.width, S.labeling.height);
  for (const p of S.placed) grid.insert({ ...p, x: p.x, y: p.y });
}

function invalidateScene(): void {
  sceneDirty = true;
}

function renderNow(): void {
  if (!S.labeling) return;
  const t0 = performance.now();
  renderScene(sceneCanvas, {
    zones: S.zones,
    points: S.placed,
    ramp,
    options: S.render,
    lines: linesCanvas,
  }, 1);
  sceneDirty = false;
  const ms = Math.round(performance.now() - t0);
  setStatus(`${S.placed.length} puntos renderizados en ${ms} ms.`, ms > 3000 ? 'warn' : 'ok');
}

function placeAndRender(): void {
  placePoints();
  if (S.view === 'render') { renderNow(); }
  paint();
}

// ---------------------------------------------------------------- pintado del lienzo

function paint(): void {
  if (!S.drawing) return;
  const { width, height } = S.drawing;
  if (view.width !== width || view.height !== height) {
    view.width = width;
    view.height = height;
  }
  viewCtx.setTransform(1, 0, 0, 1, 0, 0);
  viewCtx.clearRect(0, 0, width, height);

  if (S.view === 'render') {
    if (sceneDirty) renderNow();
    viewCtx.drawImage(sceneCanvas, 0, 0);
    drawHighlight();
    return;
  }

  const base = S.showOriginal || !inkCanvas ? S.drawing.canvas : inkCanvas;
  viewCtx.drawImage(base, 0, 0);
  if (zonesOverlay) viewCtx.drawImage(zonesOverlay, 0, 0);
  if (S.hoverLabel && !zoneOfLabel(S.hoverLabel)) {
    const ov = regionOverlay(S.hoverLabel);
    if (ov) viewCtx.drawImage(ov.canvas, ov.x, ov.y);
  }
  if (S.selected) {
    const z = S.zones.get(S.selected);
    if (z) {
      viewCtx.strokeStyle = pastelFor(z.hue, 1);
      viewCtx.lineWidth = 2;
      viewCtx.strokeRect(z.minX - 1, z.minY - 1, z.maxX - z.minX + 3, z.maxY - z.minY + 3);
    }
  }
  drawHighlight();
}

/** Punto colocado del registro resaltado, si sigue visible. */
function highlightPoint(): PlacedPoint | null {
  if (!S.highlightId) return null;
  return S.placed.find((p) => p.record.id === S.highlightId) ?? null;
}

/** Marca de punteria sobre la persona encontrada en el buscador. */
function drawHighlight(): void {
  const p = highlightPoint();
  if (!p) return;
  const r = Math.max(16, S.render.watercolor.radius * 2);
  viewCtx.save();
  // Dos pasadas: una clara debajo para que la marca se lea sobre las lineas.
  for (const [color, w] of [['rgba(255, 253, 248, 0.95)', 5], ['rgba(28, 24, 18, 0.9)', 2]] as const) {
    viewCtx.strokeStyle = color;
    viewCtx.lineWidth = w;
    viewCtx.beginPath();
    viewCtx.arc(p.x, p.y, r, 0, Math.PI * 2);
    viewCtx.stroke();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
      viewCtx.beginPath();
      viewCtx.moveTo(p.x + dx * (r + 4), p.y + dy * (r + 4));
      viewCtx.lineTo(p.x + dx * (r + 12), p.y + dy * (r + 12));
      viewCtx.stroke();
    }
  }
  viewCtx.restore();
}

function canvasPos(e: MouseEvent): { x: number; y: number } {
  const r = view.getBoundingClientRect();
  return {
    x: ((e.clientX - r.left) / r.width) * view.width,
    y: ((e.clientY - r.top) / r.height) * view.height,
  };
}

view.addEventListener('mousemove', (e) => {
  if (!S.labeling) return;
  const { x, y } = canvasPos(e);
  if (S.view === 'zones') {
    const l = labelAt(x, y);
    if (l !== S.hoverLabel) { S.hoverLabel = l; paint(); }
    const z = zoneOfLabel(l);
    stageHint.textContent = z ? `zona: ${z.name}` : l ? 'region libre — clic para crear zona' : '';
    tooltip.hide();
  } else if (grid) {
    const hit = grid.nearest(x, y, Math.max(6, S.render.watercolor.radius * 1.1));
    if (hit) tooltip.show(hit, e.clientX, e.clientY, fmtValue);
    else tooltip.hide();
  }
});

view.addEventListener('mouseleave', () => {
  S.hoverLabel = 0;
  tooltip.hide();
  stageHint.textContent = '';
  if (S.view === 'zones') paint();
});

view.addEventListener('click', (e) => {
  if (S.view !== 'zones' || !S.labeling) return;
  const { x, y } = canvasPos(e);
  const l = labelAt(x, y);
  if (!l) return;
  const existing = zoneOfLabel(l);

  if (e.shiftKey && S.selected) {
    const target = S.zones.get(S.selected);
    if (!target) return;
    if (existing && existing.name === target.name) {
      // Shift+clic sobre una region ya incluida: la quita del grupo.
      const regions = target.regions.filter((r) => r !== l);
      if (regions.length === 0) return;
      rebuildZone(target, regions);
    } else {
      if (existing) {
        const rest = existing.regions.filter((r) => r !== l);
        if (rest.length === 0) S.zones.delete(existing.name);
        else rebuildZone(existing, rest);
      }
      rebuildZone(target, [...target.regions, l]);
    }
    rebuildZonesOverlay();
    invalidateScene();
    refreshZonePanel();
    refreshFilters();
    placeAndRender();
    return;
  }

  if (existing) {
    S.selected = existing.name;
    refreshZonePanel();
    paint();
  } else {
    createZoneAt(l);
    placeAndRender();
  }
});

// ---------------------------------------------------------------- paneles

const zoneListBox = el('div', { class: 'my-2 max-h-[280px] overflow-y-auto' });
const warningsBox = el('div', { class: 'max-h-[260px] overflow-y-auto' });
const filtersBox = el('div');
const legendCanvas = el('canvas', { class: 'w-full mt-2.5' });
legendCanvas.width = 248; legendCanvas.height = 64;

function refreshZonePanel(focusLast = false): void {
  const counts = new Map<string, number>();
  for (const p of S.placed) counts.set(p.record.zona, (counts.get(p.record.zona) ?? 0) + 1);
  renderZoneList(zoneListBox, S.zones, counts, S.selected, {
    onRename: (oldName, newName) => {
      const z = S.zones.get(oldName);
      if (!z || S.zones.has(newName)) { refreshZonePanel(); return; }
      S.zones.delete(oldName);
      z.name = newName;
      S.zones.set(newName, z);
      if (S.selected === oldName) S.selected = newName;
      refreshZonePanel();
      refreshFilters();
      placeAndRender();
    },
    onDelete: (name) => {
      S.zones.delete(name);
      if (S.selected === name) S.selected = null;
      rebuildZonesOverlay();
      refreshZonePanel();
      refreshFilters();
      placeAndRender();
    },
    onHover: () => { /* el resaltado vive en el lienzo */ },
    onFocus: (name) => { S.selected = name; refreshZonePanel(); paint(); },
  });
  if (focusLast) {
    const inputs = zoneListBox.querySelectorAll<HTMLInputElement>('.zname');
    const last = inputs[inputs.length - 1];
    if (last) { last.focus(); last.select(); }
  }
}

function refreshWarnings(): void {
  warningsBox.textContent = '';
  if (S.warnings.length === 0) {
    warningsBox.append(el('p', { class: 'hint', text: 'Sin advertencias.' }));
    return;
  }
  const byKind = new Map<string, Warning[]>();
  for (const w of S.warnings) {
    const list = byKind.get(w.kind);
    if (list) list.push(w);
    else byKind.set(w.kind, [w]);
  }
  for (const [kind, list] of byKind) {
    const d = el('details', { class: 'warn-group' });
    d.append(el('summary', { text: `${kind} (${list.length})` }));
    for (const w of list.slice(0, 50)) {
      d.append(el('div', {
        class: 'py-px pl-2.5 text-2xs text-muted break-all',
        text: `${w.id}: ${w.message}`,
      }));
    }
    if (list.length > 50) d.append(el('div', { class: 'hint', text: `… y ${list.length - 50} mas` }));
    warningsBox.append(d);
  }
}

function refreshFilters(): void {
  const { min, max } = { min: S.csv?.min ?? 0, max: S.csv?.max ?? 1 };
  renderFilters(filtersBox, [...S.zones.keys()], min, max, S.filters, () => placeAndRender());
  // El selector de zona del formulario y la busqueda dependen de lo mismo.
  personFormRef?.refreshZones();
  personSearchRef?.refresh();
}

function refreshLegend(): void {
  const ctx = legendCanvas.getContext('2d')!;
  ctx.clearRect(0, 0, legendCanvas.width, legendCanvas.height);
  const { min, max } = normalizedRange();
  drawLegend(ctx, ramp, 6, 20, legendCanvas.width - 12, 22, min.toFixed(2), max.toFixed(2));
}

// ---------------------------------------------------------------- registro y busqueda

let personFormRef: PersonForm | null = null;
let personSearchRef: PersonSearch | null = null;
const personIds = new PersonIds();

const fmtValue = (v: number) => v.toFixed(3).replace(/\.?0+$/, '');

function zoneNames(): string[] {
  return [...S.zones.keys()];
}

/** Recalcula rango, leyenda y paneles tras tocar S.records. */
function afterRecordsChanged(): void {
  let min = Infinity, max = -Infinity;
  for (const r of S.records) {
    if (r.valor < min) min = r.valor;
    if (r.valor > max) max = r.valor;
  }
  if (!isFinite(min)) { min = 0; max = 1; }

  if (S.csv) {
    S.csv.records = S.records;
    S.csv.min = min;
    S.csv.max = max;
  } else {
    S.csv = { records: S.records, warnings: [], columns: ['id', 'zona', 'valor', ...PERSON_FIELD_KEYS], min, max };
  }
  // El rango del filtro se ensancha para que los registros nuevos se vean.
  S.filters.min = Math.min(S.filters.min, min);
  S.filters.max = Math.max(S.filters.max, max);
  if (!S.fixedRange.on) { S.fixedRange.min = min; S.fixedRange.max = max; }
  updateDataInfo();
  refreshFilters();
  refreshLegend();
}

function addPerson(p: Person, zona: string): string | null {
  if (!S.zones.has(zona)) return null;
  const rec = personToRecord(p, zona, personIds.next(zona, p.fecha));
  S.records.push(rec);
  // Si hay un filtro de zonas activo, se abre la zona del registro nuevo.
  if (S.filters.zones.size) S.filters.zones.add(zona);
  S.highlightId = rec.id;
  afterRecordsChanged();
  placeAndRender();
  if (S.view !== 'render') setView('render');
  const nombre = p.nombre || rec.id;
  const point = highlightPoint();
  if (point) {
    showTooltipAt(point);
    setStatus(`${nombre} registrada/o en ${zona} · ${rec.id}`, 'ok');
  } else {
    setStatus(`${nombre} registrada/o en ${zona}, pero su punto no se dibuja (revisa filtros y zonas).`, 'warn');
  }
  personSearchRef?.refresh();
  return rec.id;
}

/** Una persona sorteada, ya convertida en registro. */
function newRandomRecord(rng: () => number, zona: string): DataRecord {
  const p = randomPerson(rng);
  return personToRecord(p, zona, personIds.next(zona, p.fecha));
}

function addRandomPeople(n: number): void {
  const names = zoneNames();
  if (names.length === 0) {
    setStatus('Define zonas en el dibujo antes de generar personas.', 'warn');
    return;
  }
  const rng = mulberry32((Math.random() * 2 ** 32) >>> 0);
  for (let i = 0; i < n; i++) {
    const zona = names[Math.floor(rng() * names.length) % names.length];
    S.records.push(newRandomRecord(rng, zona));
  }
  S.highlightId = null;
  afterRecordsChanged();
  placeAndRender();
  if (S.view !== 'render') setView('render');
  setStatus(`${n} personas generadas al azar · ${S.records.length} registros en total.`, 'ok');
  personSearchRef?.refresh();
}

function describeRecord(r: DataRecord): string {
  const bits = [r.zona, r.extra['estado_animo'], r.extra['edad'] ? `edad ${r.extra['edad']}` : ''];
  const txt = bits.filter(Boolean).join(' · ');
  const placed = S.placed.some((p) => p.record.id === r.id);
  return placed ? txt : `${txt} · oculto`;
}

function showTooltipAt(point: PlacedPoint): void {
  const rect = view.getBoundingClientRect();
  tooltip.show(
    point,
    rect.left + (point.x / view.width) * rect.width,
    rect.top + (point.y / view.height) * rect.height,
    fmtValue
  );
}

/** Resalta el registro en el lienzo y muestra su ficha. */
function locateRecord(r: DataRecord): void {
  S.highlightId = r.id;
  if (S.view !== 'render') setView('render');
  else paint();
  const nombre = r.extra[NAME_KEY] || r.id;
  const point = highlightPoint();
  if (!point) {
    stageHint.textContent = `${nombre}: sin punto visible`;
    tooltip.hide();
    setStatus(`${nombre} esta en ${r.zona}, pero ahora no se dibuja (filtros, o la zona no existe en el dibujo).`, 'warn');
    return;
  }
  stageHint.textContent = `${nombre} · ${r.zona}`;
  showTooltipAt(point);
  setStatus(`${nombre} · ${r.zona} · ${r.extra['estado_animo'] ?? 'sin animo'} · valor ${fmtValue(r.valor)}`, 'ok');
}

function updateDataInfo(): void {
  if (!dataInfoRef) return;
  if (!S.csv || S.records.length === 0) {
    dataInfoRef.textContent = 'Sin datos: carga un CSV o registra personas a mano.';
    return;
  }
  const zonas = new Set(S.records.map((r) => r.zona));
  dataInfoRef.textContent =
    `${S.records.length} registros · ${zonas.size} zonas en los datos · valor ${fmtValue(S.csv.min)} … ${fmtValue(S.csv.max)}`;
}

// ---------------------------------------------------------------- sidebar

function buildSidebar(): void {
  sidebar.append(el('h1', {
    class: 'mt-0.5 mb-3.5 text-lg font-mid tracking-[0.02em]',
    text: 'Heatmap acuarela',
  }));

  // --- dibujo
  const sDraw = section('1 · Dibujo');
  const svgPathsRow = el('div', {});
  sDraw.append(
    row(
      fileButton('Cargar dibujo…', 'image/png,image/jpeg,image/svg+xml,.png,.jpg,.jpeg,.svg', async (f) => {
        setStatus('Cargando dibujo…');
        await useDrawing(await loadDrawingFile(f));
      }, 'primary'),
      button('Ejemplo (flor)', () => loadExample())
    ),
    svgPathsRow,
    slider({
      label: 'umbral', min: 20, max: 240, step: 1, value: S.detect.threshold,
      onChangeOnly: true,
      onInput: (v) => { S.detect.threshold = v; detectZones(); },
    }).root,
    slider({
      label: 'engrosar lineas', min: 0, max: 3, step: 1, value: S.detect.dilate,
      format: (v) => `${v} px`, onChangeOnly: true,
      onInput: (v) => { S.detect.dilate = v; detectZones(); },
    }).root,
    slider({
      label: 'area minima', min: 20, max: 4000, step: 10, value: S.detect.minArea,
      format: (v) => `${v} px`, onChangeOnly: true,
      onInput: (v) => { S.detect.minArea = v; detectZones(); },
    }).root,
    slider({
      label: 'margen interno', min: 0, max: 20, step: 1, value: S.detect.margin,
      format: (v) => `${v} px`, onChangeOnly: true,
      onInput: (v) => { S.detect.margin = v; rebuildAllZones(); placeAndRender(); },
    }).root,
    checkbox('ver dibujo original', S.showOriginal, (v) => { S.showOriginal = v; paint(); })
  );
  sidebar.append(sDraw);

  // --- zonas
  const sZones = section('2 · Zonas');
  const autoN = el('input', { type: 'number', class: 'num', value: '12', min: '1', max: '200' });
  sZones.append(
    row(
      button('Auto-zonas', () => autoZones(Math.max(1, Number(autoN.value) || 12)), 'primary'),
      autoN,
      button('Limpiar', () => {
        S.zones.clear(); S.zoneSeq = 0; S.selected = null;
        rebuildZonesOverlay(); refreshZonePanel(); refreshFilters(); placeAndRender();
      })
    ),
    zoneListBox,
    row(
      button('Exportar zonas', exportZones),
      fileButton('Importar zonas…', '.json,application/json', async (f) => {
        importZones(parseConfig(await f.text()));
      })
    )
  );
  sidebar.append(sZones);

  // --- datos
  const sData = section('3 · Datos');
  const dataInfo = el('p', { class: 'hint', text: 'Sin CSV cargado.' });
  const fixed = el('div', { class: 'fixed-range hidden' });
  fixed.append(
    numberInput('min', S.fixedRange.min, 0.01, (v) => { S.fixedRange.min = v; refreshLegend(); placeAndRender(); }),
    numberInput('max', S.fixedRange.max, 0.01, (v) => { S.fixedRange.max = v; refreshLegend(); placeAndRender(); })
  );
  sData.append(
    row(
      fileButton('Cargar CSV…', '.csv,text/csv', async (f) => useCsv(await parseCsvFile(f)), 'primary'),
      button('CSV de ejemplo', () => loadExampleCsv())
    ),
    dataInfo,
    checkbox('rango fijo de valor', S.fixedRange.on, (v) => {
      S.fixedRange.on = v;
      fixed.classList.toggle('hidden', !v);
      refreshLegend(); placeAndRender();
    }),
    fixed
  );
  sidebar.append(sData);
  dataInfoRef = dataInfo;

  // --- registro y busqueda de personas
  const sPeople = section('4 · Personas');
  personFormRef = personForm({
    zoneNames,
    add: addPerson,
    addRandom: addRandomPeople,
  });
  personSearchRef = personSearch({
    search: (q) => searchByName(S.records, q),
    locate: locateRecord,
    describe: describeRecord,
  });
  const kiosk = el('a', {
    class: 'inline-block mt-2 mb-0.5 text-xs text-accent no-underline hover:underline',
    href: `${import.meta.env.BASE_URL}registro.html`,
    target: '_blank',
    rel: 'noopener',
    text: 'Abrir pantalla de registro ↗',
  });
  sPeople.append(
    el('p', { class: 'hint', text: 'Registrar una persona nueva:' }),
    personFormRef.root,
    kiosk,
    personSearchRef.root
  );
  sidebar.append(sPeople);

  // --- colocacion
  const sPlace = section('5 · Colocacion');
  const seedInput = el('input', { type: 'number', class: 'num', value: String(S.render.globalSeed) });
  seedInput.addEventListener('change', () => {
    S.render.globalSeed = Number(seedInput.value) | 0;
    placeAndRender();
  });
  sPlace.append(
    selectBox('modo', [
      { value: 'random', label: 'Aleatorio puro (organico)' },
      { value: 'poisson', label: 'Poisson disk (parejo)' },
    ], S.placement.mode, (v) => { S.placement.mode = v as PlacementMode; placeAndRender(); }),
    slider({
      label: 'separacion poisson', min: 0.4, max: 2, step: 0.05, value: S.placement.minDistFactor,
      format: (v) => `${v.toFixed(2)}x`, onChangeOnly: true,
      onInput: (v) => { S.placement.minDistFactor = v; if (S.placement.mode === 'poisson') placeAndRender(); },
    }).root,
    el('label', { class: 'ctl inline' }, [el('span', { class: 'lbl', text: 'semilla' }), seedInput]),
    button('Re-sembrar', () => {
      S.render.globalSeed = (Math.random() * 1e9) | 0;
      seedInput.value = String(S.render.globalSeed);
      placeAndRender();
    })
  );
  sidebar.append(sPlace);

  // --- acuarela
  const sPaint = section('6 · Acuarela');
  const wc = S.render.watercolor;
  const reRender = () => { invalidateScene(); if (S.view === 'render') { renderNow(); paint(); } };
  sPaint.append(
    selectBox('paleta', PALETTES.map((p) => ({ value: p.id, label: p.name })), S.render.paletteId, (v) => {
      S.render.paletteId = v;
      const p = PALETTES.find((x) => x.id === v) ?? PALETTES[0];
      ramp = new ColorRamp(p.stops);
      refreshLegend();
      reRender();
    }),
    customPaletteRow(reRender),
    slider({ label: 'radio', min: 2, max: 60, step: 1, value: wc.radius, format: (v) => `${v} px`, onChangeOnly: true, onInput: (v) => { wc.radius = v; buildGrid(); reRender(); } }).root,
    slider({ label: 'capas', min: 6, max: 40, step: 1, value: wc.layers, onChangeOnly: true, onInput: (v) => { wc.layers = v; reRender(); } }).root,
    slider({ label: 'opacidad', min: 0.01, max: 0.12, step: 0.005, value: wc.opacity, format: (v) => `${(v * 100).toFixed(1)}%`, onChangeOnly: true, onInput: (v) => { wc.opacity = v; reRender(); } }).root,
    slider({ label: 'deformacion', min: 0, max: 1, step: 0.05, value: wc.deform, format: (v) => v.toFixed(2), onChangeOnly: true, onInput: (v) => { wc.deform = v; reRender(); } }).root,
    slider({ label: 'humedad', min: 0, max: 1, step: 0.05, value: wc.wetness, format: (v) => v.toFixed(2), onChangeOnly: true, onInput: (v) => { wc.wetness = v; reRender(); } }).root,
    slider({ label: 'borde', min: 0, max: 1, step: 0.05, value: wc.edge, format: (v) => v.toFixed(2), onChangeOnly: true, onInput: (v) => { wc.edge = v; reRender(); } }).root,
    slider({ label: 'sangrado', min: 0, max: 4, step: 1, value: S.render.bleed, format: (v) => `${v} px`, onChangeOnly: true, onInput: (v) => { S.render.bleed = v; reRender(); } }).root,
    slider({ label: 'grano del papel', min: 0, max: 1, step: 0.05, value: S.render.grain, format: (v) => v.toFixed(2), onChangeOnly: true, onInput: (v) => { S.render.grain = v; reRender(); } }).root,
    checkbox('lineas encima', S.render.showLines, (v) => { S.render.showLines = v; reRender(); }),
    slider({ label: 'opacidad lineas', min: 0.1, max: 1, step: 0.05, value: S.render.lineAlpha, format: (v) => v.toFixed(2), onChangeOnly: true, onInput: (v) => { S.render.lineAlpha = v; reRender(); } }).root,
    legendCanvas
  );
  sidebar.append(sPaint);

  // --- filtros
  const sFilters = section('7 · Filtros', false);
  sFilters.append(filtersBox);
  sidebar.append(sFilters);

  // --- advertencias
  const sWarn = section('8 · Advertencias', false);
  sWarn.append(warningsBox);
  sidebar.append(sWarn);

  // --- exportar
  const sExport = section('9 · Exportar', false);
  sExport.append(
    row(
      button('PNG 1x', () => exportPng(1)),
      button('PNG 2x', () => exportPng(2)),
      button('PNG 4x', () => exportPng(4))
    ),
    button('CSV de coordenadas', exportCoordsCsv)
  );
  sidebar.append(sExport);

  refreshZonePanel();
  refreshWarnings();
  refreshFilters();
  refreshLegend();
  updateDataInfo();
}

let dataInfoRef: HTMLElement | null = null;

function customPaletteRow(onChange: () => void): HTMLElement {
  const inputs = ['#2E3A6B', '#3E8E8A', '#D9A441', '#B23A48'].map((c) => {
    const i = el('input', {
      type: 'color',
      value: c,
      class: 'w-[38px] h-[26px] p-0 rounded-sm border border-line',
    });
    i.addEventListener('change', () => {
      const stops = inputs.map((x) => x.value);
      ramp = new ColorRamp(stops);
      S.render.paletteId = 'custom';
      refreshLegend();
      onChange();
    });
    return i;
  });
  return el('label', { class: 'ctl' }, [el('span', { class: 'lbl', text: 'paleta propia' }), el('div', { class: 'row' }, inputs)]);
}

// ---------------------------------------------------------------- vista zonas/render

const viewToggle = el('div', {
  class: 'absolute top-0 left-0 z-2 flex overflow-hidden rounded-br-[6px] bg-tabbar',
});
const btnZones = button('Zonas', () => setView('zones'), 'tab active');
const btnRender = button('Render', () => setView('render'), 'tab');
viewToggle.append(btnZones, btnRender);
stage.append(viewToggle);

function setView(v: 'zones' | 'render'): void {
  S.view = v;
  btnZones.classList.toggle('active', v === 'zones');
  btnRender.classList.toggle('active', v === 'render');
  tooltip.hide();
  stageHint.textContent = '';
  if (v === 'render' && sceneDirty) renderNow();
  paint();
}

// ---------------------------------------------------------------- acciones

async function useDrawing(d: LoadedDrawing): Promise<void> {
  S.drawing = d;
  S.render.width = d.width;
  S.render.height = d.height;
  linesCanvas = linesLayer(d, d.width, d.height);
  S.zones.clear();
  S.zoneSeq = 0;
  S.selected = null;
  if (d.svgText) {
    const { paths } = extractSvgPaths(d.svgText);
    if (paths.length > 1) {
      setStatus(`SVG con ${paths.length} paths: se usan igualmente las regiones cerradas rasterizadas.`);
    }
  }
  detectZones(false);
  setView('zones');
}

function useCsv(res: CsvResult): void {
  S.csv = res;
  S.records = res.records;
  S.warnings = [...res.warnings];
  S.filters = emptyFilters(res.min, res.max);
  S.highlightId = null;
  if (!S.fixedRange.on) { S.fixedRange.min = res.min; S.fixedRange.max = res.max; }
  personIds.sync(S.records);
  updateDataInfo();
  refreshFilters();
  refreshLegend();
  placeAndRender();
  setView('render');
}

function exportZones(): void {
  if (!S.drawing || !S.labeling) return;
  const cfg = buildConfig(
    S.drawing.name, S.labeling.width, S.labeling.height,
    S.detect.threshold, S.detect.dilate, S.detect.minArea, S.detect.margin, S.zones
  );
  const base = S.drawing.name.replace(/\.[^.]+$/, '');
  downloadText(`${base}.zones.json`, JSON.stringify(cfg, null, 2));
}

function importZones(cfg: ZonesConfig): void {
  if (!S.drawing) { setStatus('Carga primero el dibujo.', 'warn'); return; }
  S.detect.threshold = cfg.threshold ?? S.detect.threshold;
  S.detect.dilate = cfg.dilate ?? S.detect.dilate;
  if (cfg.minArea !== undefined) S.detect.minArea = cfg.minArea;
  if (cfg.margin !== undefined) S.detect.margin = cfg.margin;

  S.zones.clear();
  S.zoneSeq = 0;
  detectZones(false);
  const a = currentAnalysis();
  if (!a) return;
  const { zones, missing } = zonesFromConfig(cfg, a, S.detect.margin);
  S.zones = zones;
  S.zoneSeq = cfg.zones.length;
  rebuildZonesOverlay();
  refreshZonePanel();
  refreshFilters();
  placeAndRender();
  setStatus(
    missing.length
      ? `${S.zones.size} zonas cargadas, ${missing.length} no se pudieron reconstruir.`
      : `${S.zones.size} zonas cargadas.`,
    missing.length ? 'warn' : 'ok'
  );
}

function exportPng(scale: number): void {
  if (!S.labeling) return;
  setStatus(`Renderizando PNG ${scale}x…`);
  const out = document.createElement('canvas');
  const t0 = performance.now();
  renderScene(out, { zones: S.zones, points: S.placed, ramp, options: S.render, lines: linesCanvas }, scale);
  const base = (S.drawing?.name ?? 'heatmap').replace(/\.[^.]+$/, '');
  downloadCanvas(`${base}_heatmap_${scale}x.png`, out);
  setStatus(`PNG ${scale}x exportado (${out.width}×${out.height}) en ${Math.round(performance.now() - t0)} ms.`, 'ok');
}

function exportCoordsCsv(): void {
  const rows = S.placed.map((p) => ({ id: p.record.id, zona: p.record.zona, valor: p.record.valor, x: p.x, y: p.y }));
  const base = (S.drawing?.name ?? 'heatmap').replace(/\.[^.]+$/, '');
  downloadText(`${base}_puntos.csv`, pointsToCsv(rows), 'text/csv');
}

async function loadExample(): Promise<void> {
  setStatus('Cargando dibujo de ejemplo…');
  await useDrawing(await loadDrawingUrl(`${import.meta.env.BASE_URL}samples/flor.png`));
  autoZones(12);
  await loadExampleCsv();
}

async function loadExampleCsv(): Promise<void> {
  const text = await fetch(`${import.meta.env.BASE_URL}samples/datos_ejemplo.csv`).then((r) => r.text());
  useCsv(parseCsvText(text));
}

// ---------------------------------------------------------------- arranque

buildSidebar();
setStatus('Carga un dibujo de lineas, o prueba el ejemplo.');

// Gancho de depuracion en desarrollo: permite verificar determinismo,
// estabilidad de posiciones y tiempos desde la consola.
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__heatmap = {
    S, sceneCanvas, placePoints, renderNow, paint, setView,
    loadExample, loadExampleCsv, useCsv, parseCsvText, autoZones,
    exportZones, importZones, parseConfig, buildConfig,
    renderAt(scale: number) {
      const out = document.createElement('canvas');
      const t0 = performance.now();
      renderScene(out, { zones: S.zones, points: S.placed, ramp, options: S.render, lines: linesCanvas }, scale);
      return { width: out.width, height: out.height, ms: Math.round(performance.now() - t0) };
    },
    get scene() { return sceneCanvas; },
  };
}
