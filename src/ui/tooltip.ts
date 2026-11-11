import type { PlacedPoint } from '@core/types';
import { parseId, formatIdDate } from '@core/ids/idCodec';
import { PERSON_FIELD_KEYS, fieldLabel, isPersonField, NAME_KEY } from '@data/person';
import { hashString, mulberry32 } from '@core/sampling/prng';
import { el } from './controls';

const MARKS = ['mark mark-azul', 'mark mark-amarillo'] as const;

/**
 * Sorteador de realces para una persona. El azar va sembrado con su ID: la
 * ficha se ve marcada a mano y distinta de la de al lado, pero le toca
 * siempre la misma combinacion. Si fuera azar puro, los colores cambiarian
 * en cada `mousemove` sobre la misma mancha.
 */
function marcador(seed: string): () => string {
  const rng = mulberry32(hashString(`realce|${seed}`));
  return () => MARKS[rng() < 0.5 ? 0 : 1];
}

/** Tooltip con los datos de la persona, el ID decodificado y el checksum. */
export class Tooltip {
  private node: HTMLElement;

  constructor(parent: HTMLElement) {
    this.node = el('div', { class: 'tooltip hidden' });
    parent.append(this.node);
  }

  hide(): void {
    this.node.classList.add('hidden');
  }

  show(point: PlacedPoint, clientX: number, clientY: number, valueFmt: (v: number) => string): void {
    const r = point.record;
    const p = parseId(r.id);
    this.node.textContent = '';

    const marca = marcador(r.id);
    this.node.append(el('div', { class: 'tt-name' }, [
      el('span', { class: marca(), text: r.extra[NAME_KEY] || '(sin nombre)' }),
    ]));
    this.node.append(el('div', { class: 'tt-id' }, [el('span', { class: marca(), text: r.id })]));

    // Datos de la persona, en el orden del esquema; luego columnas extra.
    const data = el('div', { class: 'tt-data' });
    const add = (k: string, v: string, cls = 'v') => {
      data.append(el('span', { class: 'k', text: k }), el('span', { class: cls, text: v }));
    };
    for (const key of PERSON_FIELD_KEYS) {
      if (key === NAME_KEY) continue;
      const v = r.extra[key];
      // El animo es lo que define el color de la mancha: va realzado.
      if (v) add(fieldLabel(key), v, key === 'estado_animo' ? `v strong ${marca()}` : 'v');
    }
    for (const [k, v] of Object.entries(r.extra)) {
      if (isPersonField(k)) continue;
      add(fieldLabel(k), v);
    }
    add('Zona', r.zona);
    add('Valor', valueFmt(r.valor));
    this.node.append(data);

    const parts = el('div', { class: 'tt-parts' });
    if (p.wellFormed) {
      const addPart = (k: string, v: string) => {
        parts.append(el('span', { class: 'k', text: k }), el('span', { class: 'v', text: v }));
      };
      addPart('categoria', p.categoria);
      addPart('fecha del id', formatIdDate(p.fecha));
      parts.append(
        el('span', { class: 'k', text: 'registro' }),
        el('span', { class: `v ${marca()}`, text: `R${String(p.registro).padStart(3, '0')}` })
      );
      parts.append(
        el('span', { class: 'k', text: 'checksum' }),
        el('span', { class: p.checksumOk ? 'v ok' : 'v bad', text: `${p.checksum} ${p.checksumOk ? 'valido' : 'INVALIDO'}` })
      );
    } else {
      parts.append(el('span', { class: 'k', text: 'id' }), el('span', { class: 'v bad', text: 'no sigue la convencion' }));
    }
    this.node.append(parts);

    this.node.classList.remove('hidden');
    const rect = this.node.getBoundingClientRect();
    const pad = 14;
    let x = clientX + pad;
    let y = clientY + pad;
    if (x + rect.width > window.innerWidth - 8) x = clientX - rect.width - pad;
    if (y + rect.height > window.innerHeight - 8) y = clientY - rect.height - pad;
    this.node.style.left = `${Math.max(8, x)}px`;
    this.node.style.top = `${Math.max(8, y)}px`;
  }
}
