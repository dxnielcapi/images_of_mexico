import type { PlacedPoint } from '@core/types';
import { parseId, formatIdDate } from '@core/ids/idCodec';
import {
  PERSON_FIELD_KEYS, fieldLabel, isPersonField, respuestaLegible, NAME_KEY,
} from '@data/person';
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

  /**
   * `caja` es el rectangulo dentro del que se queda la hoja del telefono: el
   * lienzo del mural, para no taparle los mandos que tiene debajo. Sin ella
   * se usa la ventana entera.
   */
  show(
    point: PlacedPoint,
    clientX: number,
    clientY: number,
    valueFmt: (v: number) => string,
    caja?: { top: number; bottom: number }
  ): void {
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
    // Lo que alguien escribio puede ser una frase entera, y en el telefono la
    // ficha va a dos pares por renglon: en media columna, "casi siempre hay
    // verdura en la mesa" sale en seis lineas de dos palabras. Los valores
    // largos se marcan y el CSS les da el renglon entero (ver `.tt-hoja`).
    const LARGO = 28;
    const add = (k: string, v: string, cls = 'v') => {
      const larga = v.length > LARGO;
      data.append(
        el('span', { class: larga ? 'k k-larga' : 'k', text: k }),
        el('span', { class: larga ? `${cls} v-larga` : cls, text: v })
      );
    };
    for (const key of PERSON_FIELD_KEYS) {
      if (key === NAME_KEY) continue;
      const v = r.extra[key];
      // Como se siente con su alimentacion es lo que define el color de la
      // mancha: va realzado.
      //
      // Las preguntas de opcion se guardan como token (`mexicana`) y aqui se
      // leen enteras, con sus ejemplos: la ficha es donde alguien se entera de
      // que alimentos hablaba la pregunta, y el token solo no lo dice. Los
      // demas campos pasan de largo por `respuestaLegible`.
      if (v) add(fieldLabel(key), respuestaLegible(key, v), key === 'alimentacion' ? `v strong ${marca()}` : 'v');
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

    // En un telefono la ficha mide casi el ancho de la pantalla: puesta al
    // lado del dedo tapaba justo la mancha que se acaba de senalar, que es lo
    // unico que se queria ver. Se ancla al borde que le quede mas lejos y
    // ocupa el ancho, como una hoja que sube: la mitad de pantalla donde esta
    // la mancha queda libre.
    const hoja = window.innerWidth < 560;
    this.node.classList.toggle('tt-hoja', hoja);
    const pad = 14;
    if (hoja) {
      const alto = (caja?.top ?? 0) + pad;
      const bajo = (caja?.bottom ?? window.innerHeight) - pad;
      // La hoja se queda con poco mas de la mitad de lo que haya libre: el
      // resto es para la mancha, que es lo que se fue a ver. Si los datos no
      // entran en eso, la hoja se desplaza por dentro. El tope se pone antes
      // de medir, o se mediria el alto que la ficha tendria sin el.
      const sitio = Math.max(0, bajo - alto);
      this.node.style.maxHeight = `${Math.min(sitio, Math.max(140, sitio * 0.54))}px`;
      const rect = this.node.getBoundingClientRect();
      // Al borde mas lejano de la mancha: la mitad donde esta queda libre.
      const arriba = clientY > (alto + bajo) / 2;
      this.node.style.left = `${pad}px`;
      this.node.style.top = `${arriba ? alto : Math.max(alto, bajo - rect.height)}px`;
      return;
    }
    this.node.style.maxHeight = '';
    const rect = this.node.getBoundingClientRect();
    let x = clientX + pad;
    let y = clientY + pad;
    if (x + rect.width > window.innerWidth - 8) x = clientX - rect.width - pad;
    if (y + rect.height > window.innerHeight - 8) y = clientY - rect.height - pad;
    this.node.style.left = `${Math.max(8, x)}px`;
    this.node.style.top = `${Math.max(8, y)}px`;
  }
}
