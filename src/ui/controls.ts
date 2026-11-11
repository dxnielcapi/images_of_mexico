/** Helpers minimos de DOM para construir el panel lateral. */

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { class?: string; text?: string } = {},
  children: (Node | string)[] = []
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  const { class: cls, text, ...rest } = props as Record<string, unknown>;
  if (cls) node.className = String(cls);
  if (text !== undefined) node.textContent = String(text);
  Object.assign(node, rest);
  for (const c of children) node.append(c);
  return node;
}

export function section(title: string, open = true): HTMLDetailsElement {
  const d = el('details', { class: 'section' });
  d.open = open;
  d.append(el('summary', { text: title }));
  return d;
}

export interface SliderOpts {
  label: string;
  min: number; max: number; step: number; value: number;
  format?: (v: number) => string;
  onInput: (v: number) => void;
  /** Dispara onInput solo al soltar (para operaciones caras). */
  onChangeOnly?: boolean;
}

export function slider(o: SliderOpts): { root: HTMLElement; set: (v: number) => void; input: HTMLInputElement } {
  const fmt = o.format ?? ((v: number) => String(v));
  const value = el('span', { class: 'val', text: fmt(o.value) });
  const input = el('input', {
    type: 'range',
    min: String(o.min), max: String(o.max), step: String(o.step),
    value: String(o.value),
  });
  const fire = () => o.onInput(Number(input.value));
  input.addEventListener('input', () => {
    value.textContent = fmt(Number(input.value));
    if (!o.onChangeOnly) fire();
  });
  if (o.onChangeOnly) input.addEventListener('change', fire);
  const root = el('label', { class: 'ctl' }, [
    el('span', { class: 'lbl' }, [o.label, value]),
    input,
  ]);
  return {
    root,
    input,
    set: (v: number) => { input.value = String(v); value.textContent = fmt(v); },
  };
}

export function button(label: string, onClick: () => void, cls = ''): HTMLButtonElement {
  const b = el('button', { class: `btn ${cls}`.trim(), text: label });
  b.addEventListener('click', onClick);
  return b;
}

export function row(...nodes: (Node | string)[]): HTMLElement {
  return el('div', { class: 'row' }, nodes);
}

export function checkbox(label: string, checked: boolean, onChange: (v: boolean) => void): HTMLElement {
  const input = el('input', { type: 'checkbox', checked });
  input.addEventListener('change', () => onChange(input.checked));
  return el('label', { class: 'check' }, [input, el('span', { text: label })]);
}

export function selectBox(
  label: string,
  options: { value: string; label: string }[],
  value: string,
  onChange: (v: string) => void
): HTMLElement {
  const sel = el('select');
  for (const o of options) sel.append(el('option', { value: o.value, text: o.label }));
  sel.value = value;
  sel.addEventListener('change', () => onChange(sel.value));
  return el('label', { class: 'ctl' }, [el('span', { class: 'lbl', text: label }), sel]);
}

export function fileButton(label: string, accept: string, onFile: (f: File) => void, cls = ''): HTMLElement {
  const input = el('input', { type: 'file', accept, class: 'hidden' });
  input.addEventListener('change', () => {
    const f = input.files?.[0];
    if (f) onFile(f);
    input.value = '';
  });
  const b = button(label, () => input.click(), cls);
  return el('span', {}, [b, input]);
}

export function numberInput(label: string, value: number, step: number, onChange: (v: number) => void): HTMLElement {
  const input = el('input', { type: 'number', value: String(value), step: String(step), class: 'num' });
  input.addEventListener('change', () => onChange(Number(input.value)));
  return el('label', { class: 'ctl inline' }, [el('span', { class: 'lbl', text: label }), input]);
}
