/**
 * Alta en la pantalla publica: preguntas cortas en vez de un formulario
 * largo. Cada paso entra en una pantalla de telefono sin scrollear.
 *
 * El paso de la escala es el que da el tono: como se siente alguien con su
 * alimentacion no se elige en una lista sino tocando una mancha de acuarela
 * pintada con el pincel del mural, asi se ve de antemano el color que va a
 * quedar en el dibujo.
 *
 * Los pasos que siguen son las cuatro preguntas de opcion (`PREGUNTAS`), cada
 * una como una lista de opcion multiple: la respuesta se marca y queda a la
 * vista, con sus ejemplos debajo del encabezado. Cuantas entran por pantalla
 * lo decide la pregunta y no una constante (ver `enPasos`): una opcion con
 * ejemplos ocupa dos renglones, asi que las dos preguntas que los traen se
 * llevan una pantalla cada una y las dos de si/no comparten la suya. Este
 * formulario se llena de pie en un kiosco y ningun paso debe pedir scroll.
 *
 * El ultimo paso es una caja de texto en blanco. Antes traia las frases
 * sugeridas del punto de la escala, de un toque; se quitaron porque ponian
 * palabras en la boca de quien se registra —y lo que se lee en el mural es
 * justamente lo que nadie mas le dijo. Las frases siguen en `SENTIRES`: son
 * el habla del banco simulado (ver `tools/registros.mjs`).
 *
 * No toca el estado global: todo sale por los callbacks de `hooks`.
 */
import type { ColorRamp } from '@core/render/palette';
import {
  PREGUNTAS, SENTIRES, emptyPerson, sentirByName, todayIso,
  type Person, type Pregunta,
} from '@data/person';
import {
  ESTADOS_MEXICO, MENSAJE_SOLO_MEXICO, OPCION_EXTERNO, normalizarEstadoMexico,
} from '@data/mexico';
import {
  LIMITES_TEXTO, RATE_LIMIT_CONFIG, esDuplicadoReciente, limpiarTexto,
  moderarTexto, validarPersona, verificarRateLimit,
} from '@data/seguridad';
import { paintBlob } from './blob';
import { el } from './controls';

export interface RegistroResult {
  id: string;
  zona: string;
}

export type RegistroAddResult =
  | ({ ok: true } & RegistroResult)
  | { ok: false; error: string };

export interface RegistroFormHooks {
  /** Rampa del mural: las muestras usan el color de verdad. */
  ramp: ColorRamp;
  /** Da de alta la persona; devuelve error si se bloquea o todavia no hay zonas. */
  add: (person: Person) => RegistroAddResult | Promise<RegistroAddResult>;
  /** Se avisa al cerrar la tarjeta final ("ver mi mancha"). */
  onDone?: () => void;
}

export interface RegistroForm {
  root: HTMLElement;
  /** Vuelve al primer paso con los campos vacios. */
  reset: () => void;
}

type Single = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

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

/** Selector con la misma estetica de renglon que `campo`. */
function campoSelect(
  label: string,
  placeholder: string,
  opciones: { value: string; label: string }[]
): { root: HTMLElement; select: HTMLSelectElement } {
  const select = el('select', { class: 'campo-input campo-select' });
  select.append(el('option', { value: '', text: placeholder }));
  for (const o of opciones) {
    select.append(el('option', { value: o.value, text: o.label }));
  }
  return {
    root: el('label', { class: 'block mt-[15px]' }, [
      el('span', {
        class: 'block mb-px text-[10.5px] uppercase tracking-[0.08em] text-muted',
        text: label,
      }),
      select,
    ]),
    select,
  };
}

/* La pregunta y su bajada se repiten en todos los pasos y en la tarjeta final:
   van en una constante en vez de copiar la tira cinco veces. El margen de
   AYUDA queda afuera porque la tarjeta la usa como ultima linea, y entre dos
   utilidades de la misma propiedad gana la que Tailwind emite ultima, no la
   que este despues en el atributo `class`. */
const PREGUNTA = 'mb-[5px] text-2xl telefono:text-3xl font-mid leading-[1.3] tracking-[-0.005em]';
/* En los pasos de opcion el tamano grande no cabe: debajo de la pregunta va
   una lista que ocupa el resto de la pantalla. */
const PREGUNTA_OPCION = 'mb-2 text-lg telefono:text-xl font-mid leading-[1.35] tracking-[-0.005em]';
const AYUDA = 'text-[12.5px] leading-[1.45] text-muted';

/** True si las opciones de la pregunta traen ejemplos: ocupan dos renglones. */
const esLarga = (q: Pregunta) => q.opciones.some((o) => o.detalle);

/**
 * Reparte las preguntas de opcion en pasos, en el orden en que estan.
 *
 * Una pregunta larga se lleva la pantalla entera y las cortas —las de si/no,
 * sin ejemplos— se van juntando en la misma. Se calcula de las preguntas y no
 * se escribe a mano para que estrenar una opcion o una pregunta no deje un
 * paso con scroll sin que nadie se entere.
 */
function enPasos(preguntas: readonly Pregunta[]): Pregunta[][] {
  const pasos: Pregunta[][] = [];
  for (const q of preguntas) {
    const ultimo = pasos[pasos.length - 1];
    if (!esLarga(q) && ultimo && !ultimo.some(esLarga)) ultimo.push(q);
    else pasos.push([q]);
  }
  return pasos;
}

/** Las cuatro preguntas de opcion repartidas en pantallas. */
const PASOS_PREGUNTAS: Pregunta[][] = enPasos(PREGUNTAS);

/** Datos · escala · las preguntas de opcion · mensaje. */
const STEPS = 2 + PASOS_PREGUNTAS.length + 1;

/** Un grupo de opciones: se responde con un toque y se puede volver a cambiar. */
interface Grupo {
  root: HTMLElement;
  /** Lo elegido, o '' si todavia no hay respuesta. */
  valor: () => string;
  clear: () => void;
}

export function registroForm(hooks: RegistroFormHooks): RegistroForm {
  const person: Person = { ...emptyPerson(), alimentacion: '', fecha: todayIso() };
  let step = 0;
  let openedAt = Date.now();
  let submitting = false;

  // ------------------------------------------------------------ paso 1
  const nombre = campo('Tu nombre', { autocomplete: 'name', maxLength: LIMITES_TEXTO.nombreMax });
  const edad = campo('Edad', {
    type: 'number', min: String(LIMITES_TEXTO.edadMin), max: String(LIMITES_TEXTO.edadMax),
    step: '1', inputMode: 'numeric',
  });
  const ocupacion = campo('A qué te dedicas', { maxLength: LIMITES_TEXTO.ocupacionMax });
  const origen = campoSelect(
    '¿De qué parte de México eres?',
    'Elige tu estado…',
    [
      ...ESTADOS_MEXICO.map((estado) => ({ value: estado, label: estado })),
      { value: OPCION_EXTERNO, label: 'Otro país (fuera de México)' },
    ]
  );

  // Campo trampa (honeypot) invisible para personas: si un bot lo rellena,
  // el envio se rechaza silenciosamente sin registrar nada.
  const trampa = el('input', {
    type: 'text',
    name: 'sitio_web',
    class: 'campo-trampa',
    tabIndex: -1,
    autocomplete: 'off',
  });
  trampa.setAttribute('aria-hidden', 'true');

  origen.select.addEventListener('change', () => {
    if (origen.select.value === OPCION_EXTERNO) {
      fail(MENSAJE_SOLO_MEXICO);
    } else if (origen.select.value) {
      clearAviso();
    }
  });

  const paso1 = el('div', { class: 'paso' }, [
    el('p', { class: PREGUNTA, text: '¿Cómo te llamas?' }),
    nombre.root,
    el('div', { class: 'grid grid-cols-[78px_1fr] gap-3.5' }, [edad.root, ocupacion.root]),
    origen.root,
    trampa,
  ]);

  // ------------------------------------------------------------ paso 2
  const escala = el('div', { class: 'grid grid-cols-3 gap-0.5 mt-0.5' });
  const botones = new Map<string, HTMLButtonElement>();

  for (const s of SENTIRES) {
    const b = el('button', { class: 'sentir', type: 'button', title: s.name });
    b.setAttribute('aria-pressed', 'false');
    const canvas = document.createElement('canvas');
    canvas.className = 'blob';
    paintBlob(canvas, hooks.ramp, s.valor, { size: 58, seed: `animo|${s.name}` });
    b.append(canvas, el('span', { class: 'leading-[1.2]', text: s.name }));
    b.addEventListener('click', () => pickSentir(s.name));
    botones.set(s.name, b);
    escala.append(b);
  }

  const paso2 = el('div', { class: 'paso' }, [
    el('p', { class: PREGUNTA, text: '¿Cómo te sientes con tu alimentación?' }),
    el('p', { class: `${AYUDA} mb-3`, text: 'Toca el color que más se te parezca: ese va a ser el de tu mancha.' }),
    escala,
  ]);

  // ------------------------------------------------------------ pasos 3 y 4

  /**
   * Una pregunta de opcion como lista: un renglon por respuesta, con su
   * encabezado y sus ejemplos, y la elegida marcada.
   *
   * Los renglones son `<input type="radio">` de verdad dentro de su etiqueta,
   * no botones: la pregunta admite una sola respuesta y el control nativo es
   * el que lo dice solo —se recorre con las flechas, lo lee un lector de
   * pantalla como lo que es, y marcar uno desmarca el anterior sin que haya
   * que mantenerlo a mano. Lo unico que se lleva en JS es la clase `sel`, que
   * es la que pinta el renglon entero.
   */
  function grupo(q: Pregunta): Grupo {
    let elegido = '';
    const idPregunta = `alta-pregunta-${q.key}`;
    const lista = el('div', { class: 'opciones' });
    lista.setAttribute('role', 'radiogroup');
    lista.setAttribute('aria-labelledby', idPregunta);
    const items = new Map<string, { radio: HTMLInputElement; fila: HTMLElement }>();

    for (const o of q.opciones) {
      const radio = el('input', {
        type: 'radio',
        class: 'opcion-marca',
        name: `alta-${q.key}`,
        value: o.valor,
      });
      const texto: Node[] = [el('span', { class: 'opcion-titulo', text: o.etiqueta })];
      if (o.detalle) texto.push(el('span', { class: 'opcion-detalle', text: o.detalle }));
      const fila = el('label', { class: 'opcion' }, [
        radio,
        el('span', { class: 'opcion-texto' }, texto),
      ]);
      radio.addEventListener('change', () => {
        if (!radio.checked) return;
        elegido = o.valor;
        for (const [v, item] of items) item.fila.classList.toggle('sel', v === o.valor);
        clearAviso();
      });
      items.set(o.valor, { radio, fila });
      lista.append(fila);
    }

    const titulo = el('p', { class: PREGUNTA_OPCION, text: q.pregunta });
    titulo.id = idPregunta;

    return {
      root: el('div', { class: 'mt-5 first:mt-0' }, [titulo, lista]),
      valor: () => elegido,
      clear: () => {
        elegido = '';
        for (const { radio, fila } of items.values()) {
          radio.checked = false;
          fila.classList.remove('sel');
        }
      },
    };
  }

  /** Un paso por pantalla de preguntas, con sus grupos a mano para validar. */
  const pasosPreguntas = PASOS_PREGUNTAS.map((preguntas) => {
    const grupos = preguntas.map(grupo);
    return {
      preguntas,
      grupos,
      root: el('div', { class: 'paso' }, grupos.map((g) => g.root)),
    };
  });

  // ------------------------------------------------------------ ultimo paso
  const mensaje = el('textarea', {
    class: 'campo-input campo-area',
    rows: 3,
    maxLength: LIMITES_TEXTO.mensajeMax,
  });
  // Sin placeholder y sin etiqueta propia: la pregunta de arriba la nombra.
  mensaje.setAttribute('aria-label', 'Qué te gustaría decir');
  const contadorMensaje = el('span', {
    class: 'block mt-1 text-right text-[11px] text-muted',
    text: `0 / ${LIMITES_TEXTO.mensajeMax}`,
  });
  const syncContador = () => {
    contadorMensaje.textContent = `${mensaje.value.length} / ${LIMITES_TEXTO.mensajeMax}`;
  };
  mensaje.addEventListener('input', syncContador);

  const pasoMensaje = el('div', { class: 'paso' }, [
    el('p', { class: PREGUNTA, text: '¿Qué te gustaría decir?' }),
    el('label', { class: 'block mt-[15px]' }, [mensaje, contadorMensaje]),
    el('p', { class: `${AYUDA} mb-3`, text: 'Con tus palabras. También puedes dejarlo en blanco. Lo que escribas se va a leer en el mural.' }),
  ]);

  /** Los pasos en orden: es lo que recorre `goto`. */
  const PASOS: HTMLElement[] = [paso1, paso2, ...pasosPreguntas.map((p) => p.root), pasoMensaje];

  // ------------------------------------------------------------ tarjeta final
  const listo = el('div', { class: 'paso hidden pt-1 text-center' });

  /**
   * Las zonas de la plantilla se llaman "zona_07": decirselo a quien se acaba
   * de registrar no le dice nada. Si alguien les puso nombre, se usa.
   */
  function dondeQuedo(zona: string): string {
    return /^zona[ _-]?\d+$/i.test(zona) ? 'en la serpiente' : `en ${zona}`;
  }

  function showListo(p: Person, res: RegistroResult): void {
    const sentir = sentirByName(p.alimentacion);
    const muestra = document.createElement('canvas');
    muestra.className = 'blob blob-grande';
    paintBlob(muestra, hooks.ramp, sentir?.valor ?? 0.5, { size: 108, seed: res.id, mechon: true });

    const otra = el('button', { class: 'btn', type: 'button', text: 'Sumar a otra persona' });
    otra.addEventListener('click', reset);
    const ver = el('button', { class: 'btn primary', type: 'button', text: 'Ver mi mancha' });
    ver.addEventListener('click', () => hooks.onDone?.());

    listo.textContent = '';
    listo.append(
      muestra,
      el('p', { class: PREGUNTA, text: `Ya eres parte del mural, ${p.nombre.split(' ')[0]}.` }),
      // Ultima linea de la tarjeta: sin el aire de abajo que llevan las demas.
      el('p', { class: AYUDA, text: `Tu mancha quedó ${dondeQuedo(res.zona)}, en el color de “${p.alimentacion}”.` }),
      el('p', {
        class: 'inline-block mt-3 px-[9px] py-[5px] rounded-[6px] border border-accent-line '
          + 'bg-paper font-mono text-xs text-muted break-all',
        text: res.id,
      }),
      el('div', { class: 'alta-acciones' }, [ver, otra])
    );
    for (const paso of PASOS) paso.classList.add('hidden');
    pasos.classList.add('hidden');
    nav.classList.add('hidden');
    aviso.classList.add('hidden');
    listo.classList.remove('hidden');
    cuerpo.closest('.panel')?.scrollTo({ top: 0 });
  }

  // ------------------------------------------------------------ navegacion
  const cuerpo = el('div', { class: 'min-h-[232px]' }, [...PASOS, listo]);

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

  function pickSentir(name: string): void {
    person.alimentacion = name;
    for (const [n, b] of botones) {
      const on = n === name;
      b.classList.toggle('sel', on);
      b.setAttribute('aria-pressed', String(on));
    }
    clearAviso();
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
      const nombreLimpio = limpiarTexto(nombre.input.value, LIMITES_TEXTO.nombreMax);
      if (!nombreLimpio) return fail('Nos falta tu nombre.', nombre.input), false;
      if (nombreLimpio.length < LIMITES_TEXTO.nombreMin || !/\p{L}/u.test(nombreLimpio)) {
        return fail('Escribe un nombre válido (al menos 2 letras).', nombre.input), false;
      }
      const edadRaw = edad.input.value.trim();
      if (edadRaw) {
        const n = Number(edadRaw);
        if (!/^\d{1,3}$/.test(edadRaw) || !Number.isInteger(n) || n < LIMITES_TEXTO.edadMin || n > LIMITES_TEXTO.edadMax) {
          return fail('La edad tiene que ser un número entre 1 y 120.', edad.input), false;
        }
      }
      const origenRaw = origen.select.value.trim();
      if (!origenRaw) {
        return fail('Elige de qué estado de México eres.', origen.select), false;
      }
      if (origenRaw === OPCION_EXTERNO) {
        return fail(MENSAJE_SOLO_MEXICO, origen.select), false;
      }
      const estado = normalizarEstadoMexico(origenRaw);
      if (!estado) {
        return fail(MENSAJE_SOLO_MEXICO, origen.select), false;
      }
      person.nombre = nombreLimpio;
      person.edad = edadRaw ? String(Number(edadRaw)) : '';
      person.ocupacion = limpiarTexto(ocupacion.input.value, LIMITES_TEXTO.ocupacionMax);
      person.lugar_origen = estado;
      return true;
    }
    if (step === 1) {
      if (!person.alimentacion) return fail('Elige cómo te sientes con tu alimentación.'), false;
      return true;
    }
    // Los pasos de opciones: las preguntas se contestan con un toque, asi que
    // se piden todas. Son las que va a leer el mapeo.
    const pantalla = pasosPreguntas[step - 2];
    if (pantalla) {
      for (const [i, g] of pantalla.grupos.entries()) {
        if (!g.valor()) {
          return fail(pantalla.grupos.length > 1 && i === 1
            ? 'Falta la segunda pregunta de esta pantalla.'
            : 'Elige una respuesta para seguir.'), false;
        }
      }
      for (const [i, g] of pantalla.grupos.entries()) person[pantalla.preguntas[i].key] = g.valor();
      return true;
    }
    const mensajeLimpio = limpiarTexto(mensaje.value, LIMITES_TEXTO.mensajeMax);
    const moderado = moderarTexto(mensajeLimpio);
    if (!moderado.ok) return fail(moderado.error, mensaje), false;
    // Lo que quede es lo que se va a leer en el mural: si la moderacion le
    // bajo el volumen a un grito, se ve aqui —con el mensaje todavia a la
    // vista— y no despues de enviar.
    if (moderado.texto !== mensaje.value) {
      mensaje.value = moderado.texto;
      syncContador();
    }
    person.mensaje = moderado.texto;
    return true;
  }

  function goto(next: number): void {
    if (next > step && !commit()) return;
    if (next < 0 || next >= STEPS) return;
    step = next;
    clearAviso();

    for (const [i, p] of PASOS.entries()) p.classList.toggle('hidden', i !== step);
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

  async function submit(): Promise<void> {
    if (submitting) return;
    if (!commit()) return;

    // 1. Honeypot: un usuario real nunca llena este campo.
    if (trampa.value.trim()) {
      fail('No se pudo procesar tu registro. Recarga e intenta de nuevo.');
      return;
    }

    // 2. Tiempo minimo de llenado: frena envios automatizados instantaneos.
    if (Date.now() - openedAt < RATE_LIMIT_CONFIG.tiempoMinimoLlenadoMs) {
      fail('Tómate un momento para revisar tus respuestas antes de enviar.');
      return;
    }

    // 3. Rate limit del navegador.
    const rl = verificarRateLimit();
    if (!rl.permitido) {
      fail(rl.motivo);
      return;
    }

    // 4. Validacion completa del esquema (ubicacion de Mexico, anti-spam, catalogo).
    person.fecha = todayIso();
    const validacion = validarPersona(person);
    if (!validacion.ok) {
      fail(validacion.error);
      return;
    }

    // 5. Evita registros duplicados inmediatos.
    if (esDuplicadoReciente(validacion.persona)) {
      fail('Ya recibimos un registro idéntico hace unos minutos.');
      return;
    }

    submitting = true;
    seguir.disabled = true;
    seguir.textContent = 'Guardando…';
    try {
      const res = await hooks.add(validacion.persona);
      if (!res.ok) {
        fail(res.error);
        return;
      }
      Object.assign(person, validacion.persona);
      showListo(validacion.persona, res);
    } finally {
      submitting = false;
      seguir.disabled = false;
      seguir.textContent = step === STEPS - 1 ? 'Sumar al mural' : 'Seguir';
    }
  }

  function reset(): void {
    Object.assign(person, { ...emptyPerson(), alimentacion: '', fecha: todayIso() });
    nombre.input.value = '';
    edad.input.value = '';
    ocupacion.input.value = '';
    origen.select.value = '';
    trampa.value = '';
    mensaje.value = '';
    syncContador();
    openedAt = Date.now();
    for (const b of botones.values()) {
      b.classList.remove('sel');
      b.setAttribute('aria-pressed', 'false');
    }
    for (const pantalla of pasosPreguntas) for (const g of pantalla.grupos) g.clear();
    listo.classList.add('hidden');
    pasos.classList.remove('hidden');
    nav.classList.remove('hidden');
    aviso.classList.remove('hidden');
    step = 1;      // para que goto(0) no dispare la validacion de "seguir"
    goto(0);
  }

  // Enter en un campo de una linea avanza, como el "Seguir".
  for (const i of [nombre.input, edad.input, ocupacion.input]) {
    i.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); goto(step + 1); }
    });
  }

  const root = el('div', { class: 'flex flex-col' }, [pasos, cuerpo, aviso, nav]);
  step = 1;
  goto(0);

  return { root, reset };
}
