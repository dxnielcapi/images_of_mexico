/** Interpolacion de color en OKLab (perceptualmente uniforme), no en RGB. */

export interface Rgb { r: number; g: number; b: number }
export interface Oklab { L: number; a: number; b: number }

export function hexToRgb(hex: string): Rgb {
  const h = hex.replace('#', '').trim();
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return {
    r: parseInt(full.slice(0, 2), 16),
    g: parseInt(full.slice(2, 4), 16),
    b: parseInt(full.slice(4, 6), 16),
  };
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const c = (n: number) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

const srgbToLinear = (c: number) => {
  const x = c / 255;
  return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
};
const linearToSrgb = (x: number) => {
  const c = x <= 0.0031308 ? x * 12.92 : 1.055 * Math.pow(x, 1 / 2.4) - 0.055;
  return c * 255;
};

export function rgbToOklab(rgb: Rgb): Oklab {
  const r = srgbToLinear(rgb.r), g = srgbToLinear(rgb.g), b = srgbToLinear(rgb.b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

export function oklabToRgb(c: Oklab): Rgb {
  const l_ = c.L + 0.3963377774 * c.a + 0.2158037573 * c.b;
  const m_ = c.L - 0.1055613458 * c.a - 0.0638541728 * c.b;
  const s_ = c.L - 0.0894841775 * c.a - 1.291485548 * c.b;
  const l = l_ * l_ * l_, m = m_ * m_ * m_, s = s_ * s_ * s_;
  return {
    r: linearToSrgb(+4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    g: linearToSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    b: linearToSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  };
}

/**
 * La paleta del mural: carmin, y solo carmin.
 *
 * Una sola familia de color de punta a punta, asi el mural se lee como una
 * sola tinta aguada. Lo que varia con el valor no es el tono sino la
 * profundidad: del rosa ceniza mas lavado al carmin oscuro. Interpolado en
 * OKLab, el recorrido no pasa por ningun gris sucio intermedio.
 *
 * No hay selector de paleta ni paletas alternativas: si alguna vez hace falta
 * otra tinta, se cambian estas cuatro paradas y nada mas.
 */
export const CARMIN: string[] = ['#EFC3C7', '#DB8290', '#B82B41', '#8A1527'];

/** Rampa precalculada de la paleta: 256 colores interpolados en OKLab. */
export class ColorRamp {
  private lut: Rgb[] = [];

  constructor(stops: string[]) {
    const labs = stops.map((s) => rgbToOklab(hexToRgb(s)));
    const n = labs.length;
    for (let i = 0; i < 256; i++) {
      const t = i / 255;
      const pos = t * (n - 1);
      const i0 = Math.min(n - 1, Math.floor(pos));
      const i1 = Math.min(n - 1, i0 + 1);
      const f = pos - i0;
      const a = labs[i0], b = labs[i1];
      this.lut.push(oklabToRgb({
        L: a.L + (b.L - a.L) * f,
        a: a.a + (b.a - a.a) * f,
        b: a.b + (b.b - a.b) * f,
      }));
    }
  }

  /** t en [0,1] -> color. */
  at(t: number): Rgb {
    const i = Math.max(0, Math.min(255, Math.round(t * 255)));
    return this.lut[i];
  }

  rgbaAt(t: number, alpha: number): string {
    const { r, g, b } = this.at(t);
    return `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${alpha})`;
  }
}
