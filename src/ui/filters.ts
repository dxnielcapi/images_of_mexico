import type { DataRecord } from '../types';
import { el, checkbox } from './controls';

export interface FilterState {
  zones: Set<string>;      // vacio = todas
  min: number;
  max: number;
  idPrefix: string;
}

export function emptyFilters(min: number, max: number): FilterState {
  return { zones: new Set(), min, max, idPrefix: '' };
}

export function applyFilters(records: DataRecord[], f: FilterState): DataRecord[] {
  const prefix = f.idPrefix.trim().toUpperCase();
  return records.filter((r) => {
    if (f.zones.size && !f.zones.has(r.zona)) return false;
    if (r.valor < f.min || r.valor > f.max) return false;
    if (prefix && !r.id.toUpperCase().startsWith(prefix)) return false;
    return true;
  });
}

export function renderFilters(
  container: HTMLElement,
  zoneNames: string[],
  dataMin: number,
  dataMax: number,
  state: FilterState,
  onChange: () => void
): void {
  container.textContent = '';
  if (zoneNames.length === 0) {
    container.append(el('p', { class: 'hint', text: 'Define zonas y carga un CSV para filtrar.' }));
    return;
  }

  const zoneBox = el('div', { class: 'zone-filters' });
  for (const name of zoneNames) {
    zoneBox.append(
      checkbox(name, state.zones.size === 0 || state.zones.has(name), (on) => {
        if (state.zones.size === 0) for (const z of zoneNames) state.zones.add(z);
        if (on) state.zones.add(name);
        else state.zones.delete(name);
        if (state.zones.size === zoneNames.length) state.zones.clear();
        onChange();
      })
    );
  }
  container.append(zoneBox);

  const span = (dataMax - dataMin) || 1;
  const step = span / 200;
  const label = el('span', { class: 'val', text: `${state.min.toFixed(2)} – ${state.max.toFixed(2)}` });
  const lo = el('input', { type: 'range', min: String(dataMin), max: String(dataMax), step: String(step), value: String(state.min) });
  const hi = el('input', { type: 'range', min: String(dataMin), max: String(dataMax), step: String(step), value: String(state.max) });
  const sync = () => {
    let a = Number(lo.value), b = Number(hi.value);
    if (a > b) { [a, b] = [b, a]; }
    state.min = a; state.max = b;
    label.textContent = `${a.toFixed(2)} – ${b.toFixed(2)}`;
    onChange();
  };
  lo.addEventListener('change', sync);
  hi.addEventListener('change', sync);
  container.append(
    el('label', { class: 'ctl' }, [el('span', { class: 'lbl' }, ['rango de valor', label]), lo, hi])
  );

  const prefix = el('input', { type: 'text', class: 'txt', placeholder: 'prefijo de ID (ej. PETALO)', value: state.idPrefix });
  prefix.addEventListener('input', () => { state.idPrefix = prefix.value; onChange(); });
  container.append(el('label', { class: 'ctl' }, [el('span', { class: 'lbl', text: 'prefijo de ID' }), prefix]));
}
