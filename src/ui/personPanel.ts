/**
 * Buscador de personas por nombre.
 *
 * Aqui vivia tambien el formulario de alta con todos los campos a la vista y
 * el generador de gente al azar; eran del studio y se fueron con el. El alta
 * de la pantalla publica es otra cosa y vive en `@ui/registroForm`.
 *
 * El panel no toca el estado global: todo pasa por los callbacks de `hooks`.
 */
import type { DataRecord } from '@core/types';
import { NAME_KEY } from '@data/person';
import { el } from './controls';

export interface SearchHooks {
  /** Registros cuyo nombre coincide con la consulta. */
  search: (query: string) => DataRecord[];
  /** Lleva la vista al registro y lo resalta. */
  locate: (record: DataRecord) => void;
  /** Texto corto de estado para un registro (zona, o si esta filtrado). */
  describe: (record: DataRecord) => string;
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
