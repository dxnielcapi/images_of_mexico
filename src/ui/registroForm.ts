/**
 * Alta en la pantalla publica: tres preguntas cortas en vez de un formulario
 * largo. Cada paso entra en una pantalla de telefono sin scrollear.
 *
 * El paso del medio es el que da el tono: el estado de animo no se elige en
 * una lista sino tocando una mancha de acuarela pintada con el pincel del
 * mural, asi se ve de antemano el color que va a quedar en la flor.
 *
 * No toca el estado global: todo sale por los callbacks de `hooks`.
 */
import type { ColorRamp } from '@core/render/palette';
import { MOODS, emptyPerson, todayIso, type Person } from '@data/person';
import { paintBlob } from './blob';
import { el } from './controls';

export interface RegistroResult {
  id: string;
  zona: string;
}

export interface RegistroFormHooks {
  /** Rampa del mural: las muestras usan el color de verdad. */
  ramp: ColorRamp;
  /** Da de alta la persona; null si todavia no hay zonas donde ubicarla. */
  add: (person: Person) => RegistroResult | null;
  /** Se avisa al cerrar la tarjeta final ("ver mi mancha"). */
  onDone?: () => void;
}

export interface RegistroForm {
  root: HTMLElement;
  /** Vuelve al primer paso con los campos vacios. */
  reset: () => void;
}

type Single = HTMLInputElement | HTMLTextAreaElement;

/** Campo de una linea: etiqueta chica arriba, texto grande abajo. */
function campo(
  label: string,
  attrs: Partial<HTMLInputElement> = {}
): { root: HTMLElement; input: HTMLInputElement } {
  const input = el('input', { type: 'text', class: 'campo-input', ...attrs });
  return {
    root: el('label', { class: 'block mt-[15px]' }, [
      el('span', {
        class: 'block mb-px text-[10.5px] uppercase tracking-[0.08em] text-muted',
        text: label,
      }),
      input,
    ]),
    input,
  };
}

/* La pregunta y su bajada se repiten en los tres pasos y en la tarjeta final:
   van en una constante en vez de copiar la tira cuatro veces. El margen de
   AYUDA queda afuera porque la tarjeta la usa como ultima linea, y entre dos
   utilidades de la misma propiedad gana la que Tailwind emite ultima, no la
   que este despues en el atributo `class`. */
const PREGUNTA = 'mb-[5px] text-2xl telefono:text-3xl font-mid leading-[1.3] tracking-[-0.005em]';
const AYUDA = 'text-[12.5px] leading-[1.45] text-muted';

const STEPS = 3;

export function registroForm(hooks: RegistroFormHooks): RegistroForm {
  const person: Person = { ...emptyPerson(), estado_animo: '', fecha: todayIso() };
  let step = 0;

  // ------------------------------------------------------------ paso 1
  const nombre = campo('Tu nombre', { autocomplete: 'name' });
  const edad = campo('Edad', { type: 'number', min: '1', max: '120', inputMode: 'numeric' });
  const ocupacion = campo('A qué te dedicas');
  const origen = campo('De dónde eres');

  const paso1 = el('div', { class: 'paso' }, [
    el('p', { class: PREGUNTA, text: '¿Cómo te llamas?' }),
    nombre.root,
    el('div', { class: 'grid grid-cols-[78px_1fr] gap-3.5' }, [edad.root, ocupacion.root]),
    origen.root,
  ]);

  // ------------------------------------------------------------ paso 2
  const animos = el('div', { class: 'grid grid-cols-3 gap-0.5 mt-0.5' });
  const botones = new Map<string, HTMLButtonElement>();

  for (const m of MOODS) {
    const b = el('button', { class: 'animo', type: 'button', title: m.name });
    b.setAttribute('aria-pressed', 'false');
    const canvas = document.createElement('canvas');
    canvas.className = 'blob';
    paintBlob(canvas, hooks.ramp, m.valor, { size: 58, seed: `animo|${m.name}` });
    b.append(canvas, el('span', { class: 'leading-[1.2]', text: m.name }));
    b.addEventListener('click', () => pickMood(m.name));
    botones.set(m.name, b);
    animos.append(b);
  }

  const paso2 = el('div', { class: 'paso' }, [
    el('p', { class: PREGUNTA, text: '¿Cómo estás hoy?' }),
    el('p', { class: `${AYUDA} mb-3`, text: 'Toca el color que más se te parezca: ese va a ser el de tu mancha.' }),
    animos,
  ]);

  // ------------------------------------------------------------ paso 3
  const mensaje = el('textarea', { class: 'campo-input campo-area', rows: 3 });
  // Sin placeholder y sin etiqueta propia: la pregunta de arriba la nombra.
  mensaje.setAttribute('aria-label', 'Qué te gustaría decir');
  const frases = el('div', { class: 'flex flex-wrap gap-1.5 mt-[11px]' });

  const paso3 = el('div', { class: 'paso' }, [
    el('p', { class: PREGUNTA, text: '¿Qué te gustaría decir?' }),
    el('label', { class: 'block mt-[15px]' }, [mensaje]),
    frases,
    el('p', { class: `${AYUDA} mb-3`, text: 'Toca una frase para usarla, o escribe la tuya. También puedes dejarlo en blanco.' }),
  ]);

  /** Frases sugeridas del animo elegido: un toque las copia al mensaje. */
  function refreshFrases(): void {
    frases.textContent = '';
    const mood = MOODS.find((m) => m.name === person.estado_animo);
    if (!mood) return;
    for (const f of mood.frases) {
      const chip = el('button', {
        class: 'px-[11px] py-1.5 rounded-full border border-accent-line bg-paper '
          + 'text-sm leading-[1.3] text-left text-muted cursor-pointer touch-manipulation '
          + 'transition-[border-color,color] duration-[120ms] '
          + 'hover:border-accent hover:text-ink focus-visible:border-accent focus-visible:text-ink focus-visible:outline-none',
        type: 'button',
        text: f,
      });
      chip.addEventListener('click', () => {
        mensaje.value = f;
        mensaje.focus();
      });
      frases.append(chip);
    }
  }

  // ------------------------------------------------------------ tarjeta final
  const listo = el('div', { class: 'paso hidden pt-1 text-center' });

  /**
   * Las zonas de la muestra se llaman "zona_07": decirselo a quien se acaba
   * de registrar no le dice nada. Si alguien les puso nombre, se usa.
   */
  function dondeQuedo(zona: string): string {
    return /^zona[ _-]?\d+$/i.test(zona) ? 'entre los pétalos' : `en ${zona}`;
  }

  function showListo(p: Person, res: RegistroResult): void {
    const mood = MOODS.find((m) => m.name === p.estado_animo);
    const muestra = document.createElement('canvas');
    muestra.className = 'blob blob-grande';
    paintBlob(muestra, hooks.ramp, mood?.valor ?? 0.5, { size: 108, seed: res.id });

    const otra = el('button', { class: 'btn', type: 'button', text: 'Sumar a otra persona' });
    otra.addEventListener('click', reset);
    const ver = el('button', { class: 'btn primary', type: 'button', text: 'Ver mi mancha' });
    ver.addEventListener('click', () => hooks.onDone?.());

    listo.textContent = '';
    listo.append(
      muestra,
      el('p', { class: PREGUNTA, text: `Ya eres parte de la flor, ${p.nombre.split(' ')[0]}.` }),
      // Ultima linea de la tarjeta: sin el aire de abajo que llevan las demas.
      el('p', { class: AYUDA, text: `Tu mancha quedó ${dondeQuedo(res.zona)}, en el color de “${p.estado_animo}”.` }),
      el('p', {
        class: 'inline-block mt-3 px-[9px] py-[5px] rounded-[6px] border border-accent-line '
          + 'bg-paper font-mono text-xs text-muted break-all',
        text: res.id,
      }),
      el('div', { class: 'alta-acciones' }, [ver, otra])
    );
    for (const paso of [paso1, paso2, paso3]) paso.classList.add('hidden');
    pasos.classList.add('hidden');
    nav.classList.add('hidden');
    aviso.classList.add('hidden');
    listo.classList.remove('hidden');
    cuerpo.closest('.panel')?.scrollTo({ top: 0 });
  }

  // ------------------------------------------------------------ navegacion
  const cuerpo = el('div', { class: 'min-h-[232px]' }, [paso1, paso2, paso3, listo]);

  const pasos = el('div', { class: 'flex gap-[7px] mb-3.5' });
  const puntos: HTMLElement[] = [];
  for (let i = 0; i < STEPS; i++) {
    const p = el('span', { class: 'punto' });
    puntos.push(p);
    pasos.append(p);
  }

  const aviso = el('p', { class: 'aviso' });
  const atras = el('button', { class: 'btn ghost', type: 'button', text: 'Volver' });
  const seguir = el('button', { class: 'btn primary', type: 'button', text: 'Seguir' });
  const nav = el('div', { class: 'alta-nav' }, [atras, seguir]);

  atras.addEventListener('click', () => goto(step - 1));
  seguir.addEventListener('click', () => {
    if (step < STEPS - 1) goto(step + 1);
    else submit();
  });

  function pickMood(name: string): void {
    person.estado_animo = name;
    for (const [n, b] of botones) {
      const on = n === name;
      b.classList.toggle('sel', on);
      b.setAttribute('aria-pressed', String(on));
    }
    clearAviso();
    refreshFrases();
  }

  function clearAviso(): void {
    aviso.textContent = '';
    aviso.classList.remove('bad');
  }

  function fail(text: string, focus?: Single): void {
    aviso.textContent = text;
    aviso.classList.add('bad');
    focus?.focus();
  }

  /** Valida el paso actual y vuelca lo escrito en `person`. */
  function commit(): boolean {
    if (step === 0) {
      person.nombre = nombre.input.value.trim();
      if (!person.nombre) return fail('Nos falta tu nombre.', nombre.input), false;
      const n = Number(edad.input.value);
      if (edad.input.value && (!isFinite(n) || n < 1 || n > 120)) {
        return fail('La edad tiene que ser un número entre 1 y 120.', edad.input), false;
      }
      person.edad = edad.input.value.trim();
      person.ocupacion = ocupacion.input.value.trim();
      person.lugar_origen = origen.input.value.trim();
      return true;
    }
    if (step === 1) {
      if (!person.estado_animo) return fail('Elige cómo estás hoy.'), false;
      return true;
    }
    person.mensaje = mensaje.value.trim();
    return true;
  }

  function goto(next: number): void {
    if (next > step && !commit()) return;
    if (next < 0 || next >= STEPS) return;
    step = next;
    clearAviso();

    for (const [i, p] of [paso1, paso2, paso3].entries()) p.classList.toggle('hidden', i !== step);
    for (const [i, p] of puntos.entries()) {
      p.classList.toggle('on', i === step);
      p.classList.toggle('done', i < step);
    }
    atras.classList.toggle('hidden', step === 0);
    seguir.textContent = step === STEPS - 1 ? 'Sumar al mural' : 'Seguir';

    // En el telefono el teclado tapa medio panel: solo se enfoca el paso 1.
    if (step === 0) nombre.input.focus({ preventScroll: true });
    cuerpo.closest('.panel')?.scrollTo({ top: 0 });
  }

  function submit(): void {
    if (!commit()) return;
    person.fecha = todayIso();
    const res = hooks.add(person);
    if (!res) {
      fail('No se pudo sumar tu mancha. Prueba de nuevo en un momento.');
      return;
    }
    showListo(person, res);
  }

  function reset(): void {
    Object.assign(person, { ...emptyPerson(), estado_animo: '', fecha: todayIso() });
    nombre.input.value = '';
    edad.input.value = '';
    ocupacion.input.value = '';
    origen.input.value = '';
    mensaje.value = '';
    for (const b of botones.values()) {
      b.classList.remove('sel');
      b.setAttribute('aria-pressed', 'false');
    }
    refreshFrases();
    listo.classList.add('hidden');
    pasos.classList.remove('hidden');
    nav.classList.remove('hidden');
    aviso.classList.remove('hidden');
    step = 1;      // para que goto(0) no dispare la validacion de "seguir"
    goto(0);
  }

  // Enter en un campo de una linea avanza, como el "Seguir".
  for (const i of [nombre.input, edad.input, ocupacion.input, origen.input]) {
    i.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); goto(step + 1); }
    });
  }

  const root = el('div', { class: 'flex flex-col' }, [pasos, cuerpo, aviso, nav]);
  refreshFrases();
  step = 1;
  goto(0);

  return { root, reset };
}
