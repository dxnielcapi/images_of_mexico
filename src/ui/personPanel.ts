/**
 * Recuadro de registro ("una persona nueva") y buscador por nombre.
 * El panel no toca el estado global: todo pasa por los callbacks de `hooks`.
 */
import type { DataRecord } from '@core/types';
import {
  MOOD_NAMES, NAME_KEY, PERSON_FIELDS, emptyPerson, randomPerson, todayIso,
  type Person, type PersonFieldKey,
} from '@data/person';
import { mulberry32 } from '@core/sampling/prng';
import { el, button, row } from './controls';

export interface PersonPanelHooks {
  /** Zonas disponibles ahora mismo. */
  zoneNames: () => string[];
  /** Agrega el registro; devuelve el id generado, o null si no se pudo. */
  add: (person: Person, zona: string) => string | null;
  /** Agrega n personas al azar repartidas entre las zonas. */
  addRandom?: (n: number) => void;
}

export interface PersonFormOpts {
  /** Selector de zona; si se oculta, la zona se sortea al agregar. */
  zonePicker?: boolean;
  /** Fila "Generar N al azar"; fuera en la pantalla publica. */
  bulk?: boolean;
  /** Texto del boton principal. */
  submitLabel?: string;
  /** Linea de ayuda sobre los campos; null la saca. */
  intro?: string | null;
  /** Mensaje de confirmacion; por defecto uno con la zona y el id. */
  message?: (person: Person, zona: string, id: string) => string;
}

export interface SearchHooks {
  /** Registros cuyo nombre coincide con la consulta. */
  search: (query: string) => DataRecord[];
  /** Lleva la vista al registro y lo resalta. */
  locate: (record: DataRecord) => void;
  /** Texto corto de estado para un registro (zona, o si esta filtrado). */
  describe: (record: DataRecord) => string;
}

type FieldInput = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

function field(key: PersonFieldKey, label: string): { root: HTMLElement; input: FieldInput } {
  let input: FieldInput;
  if (key === 'estado_animo') {
    const sel = el('select');
    for (const m of MOOD_NAMES) sel.append(el('option', { value: m, text: m }));
    input = sel;
  } else if (key === 'mensaje') {
    input = el('textarea', { class: 'txt', rows: 2, placeholder: 'una frase, lo que quiera decir' });
  } else if (key === 'fecha') {
    input = el('input', { type: 'date', class: 'txt', value: todayIso() });
  } else if (key === 'edad') {
    input = el('input', { type: 'number', class: 'txt', min: '1', max: '120', placeholder: '18' });
  } else {
    input = el('input', { type: 'text', class: 'txt' });
  }
  input.name = key;
  return {
    root: el('label', { class: 'ctl' }, [el('span', { class: 'lbl', text: label }), input]),
    input,
  };
}

export interface PersonForm {
  root: HTMLElement;
  /** Vuelve a poblar el selector de zona (al crear o renombrar zonas). */
  refreshZones: () => void;
}

export function personForm(hooks: PersonPanelHooks, opts: PersonFormOpts = {}): PersonForm {
  const box = el('div', { class: 'register' });
  const inputs = new Map<PersonFieldKey, FieldInput>();

  const intro = opts.intro === undefined ? 'Datos de la persona. "Al azar" los completa por ti.' : opts.intro;
  if (intro) box.append(el('p', { class: 'hint', text: intro }));
  for (const f of PERSON_FIELDS) {
    const { root, input } = field(f.key, f.label);
    inputs.set(f.key, input);
    box.append(root);
  }

  // Estado inicial coherente con emptyPerson (animo y fecha por defecto).
  const zoneSel = el('select');
  const zoneRow = el('label', { class: 'ctl' }, [
    el('span', { class: 'lbl', text: 'Zona del dibujo' }),
    zoneSel,
  ]);
  if (opts.zonePicker !== false) box.append(zoneRow);

  const refreshZones = () => {
    const names = hooks.zoneNames();
    const prev = zoneSel.value;
    zoneSel.textContent = '';
    zoneSel.append(el('option', { value: '', text: names.length ? 'al azar' : 'sin zonas definidas' }));
    for (const n of names) zoneSel.append(el('option', { value: n, text: n }));
    if (prev && names.includes(prev)) zoneSel.value = prev;
  };
  refreshZones();

  const feedback = el('p', { class: 'hint', text: '' });

  const read = (): Person => {
    const p = emptyPerson();
    for (const [key, input] of inputs) p[key] = input.value.trim();
    return p;
  };

  const write = (p: Person) => {
    for (const [key, input] of inputs) input.value = p[key];
  };

  write(emptyPerson());

  const fillRandom = () => {
    write(randomPerson(mulberry32((Math.random() * 2 ** 32) >>> 0), { fecha: todayIso() }));
    feedback.className = 'hint';
    feedback.textContent = 'Datos sorteados: revisalos y agregalos.';
  };

  const submit = () => {
    const p = read();
    if (!p.nombre) {
      feedback.className = 'hint bad';
      feedback.textContent = 'Falta el nombre.';
      inputs.get('nombre')?.focus();
      return;
    }
    const edad = Number(p.edad);
    if (p.edad && (!isFinite(edad) || edad < 1 || edad > 120)) {
      feedback.className = 'hint bad';
      feedback.textContent = 'La edad tiene que ser un numero entre 1 y 120.';
      return;
    }
    if (!p.fecha) p.fecha = todayIso();

    const names = hooks.zoneNames();
    if (names.length === 0) {
      feedback.className = 'hint bad';
      feedback.textContent = 'Primero define zonas en el dibujo.';
      return;
    }
    const zona = zoneSel.value || names[Math.floor(Math.random() * names.length)];
    const id = hooks.add(p, zona);
    if (!id) {
      feedback.className = 'hint bad';
      feedback.textContent = 'No se pudo agregar el registro.';
      return;
    }
    feedback.className = 'hint ok';
    feedback.textContent = opts.message
      ? opts.message(p, zona, id)
      : `${p.nombre} agregada/o en ${zona} · ${id}`;
    const keep = p.fecha;
    write({ ...emptyPerson(), fecha: keep });
  };

  box.append(
    row(
      button(opts.submitLabel ?? 'Agregar', submit, 'primary'),
      button('Al azar', fillRandom),
      button('Limpiar', () => { write({ ...emptyPerson(), fecha: todayIso() }); feedback.textContent = ''; })
    ),
    feedback
  );

  const addRandom = hooks.addRandom;
  if (addRandom && opts.bulk !== false) {
    const n = el('input', { type: 'number', class: 'num', value: '10', min: '1', max: '500' });
    box.append(
      row(button('Generar', () => addRandom(Math.max(1, Number(n.value) || 10))), n, el('span', { class: 'hint', text: 'al azar' }))
    );
  }

  // Enter en cualquier campo de una linea agrega el registro.
  for (const input of inputs.values()) {
    if (input instanceof HTMLTextAreaElement) continue;
    (input as HTMLElement).addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
    });
  }

  return { root: box, refreshZones };
}

export interface PersonSearch {
  root: HTMLElement;
  /** Vuelve a correr la busqueda actual (tras agregar o filtrar datos). */
  refresh: () => void;
}

export function personSearch(hooks: SearchHooks): PersonSearch {
  const box = el('div', { class: 'search' });
  const input = el('input', { type: 'search', class: 'txt', placeholder: 'buscar por nombre…' });
  const results = el('div', { class: 'results' });
  box.append(
    el('label', { class: 'ctl' }, [el('span', { class: 'lbl', text: 'Buscar persona' }), input]),
    results
  );

  const MAX = 12;

  const run = () => {
    const q = input.value.trim();
    results.textContent = '';
    if (!q) {
      results.append(el('p', { class: 'hint', text: 'Escribe un nombre para ubicar su mancha en el dibujo.' }));
      return;
    }
    const found = hooks.search(q);
    if (found.length === 0) {
      results.append(el('p', { class: 'hint', text: `Sin resultados para "${q}".` }));
      return;
    }
    for (const r of found.slice(0, MAX)) {
      const item = el('div', { class: 'ritem' }, [
        el('span', { class: 'text-sm', text: r.extra[NAME_KEY] || r.id }),
        el('span', { class: 'text-2xs text-muted', text: hooks.describe(r) }),
      ]);
      item.addEventListener('click', () => hooks.locate(r));
      results.append(item);
    }
    if (found.length > MAX) {
      results.append(el('p', { class: 'hint', text: `y ${found.length - MAX} más…` }));
    }
  };

  input.addEventListener('input', run);
  run();

  return { root: box, refresh: run };
}
