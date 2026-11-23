/**
 * El pintado: el mural no aparece, se pinta.
 *
 * La escena es un bitmap que se re-renderiza solo cuando cambian los datos, y
 * hasta ahora salia de una vez: se abria la pagina y la serpiente ya estaba
 * ahi. Pero la figura es el trabajo de doscientas y pico de personas, y eso
 * se cuenta mostrandolo: las pinceladas entran de a una, cada una crece desde
 * donde el pincel apoyo hasta donde levanto, y el dibujo se va cerrando a la
 * vista. En el orden del reparto (ver `@core/render/boceto`), que es disperso:
 * no se pinta un rincon y despues otro, aparece la figura entera a la vez y
 * se va haciendo densa.
 *
 * Dos lienzos y ninguna copia de mas:
 *
 * - **Lo que ya esta seco** vive en la escena cacheada. Cada pincelada que
 *   termina se estampa ahi una sola vez, con el mismo pincel que la habria
 *   pintado en el render completo (`pintarRamaDe`), asi que el mural que
 *   queda es exactamente el que saldria sin animacion.
 * - **Lo que esta mojado** —las pocas que estan creciendo— se repinta entero
 *   en cada fotograma sobre el lienzo que se ve, que de todos modos se borra
 *   y se vuelve a estampar para los brotes. No hace falta una capa aparte, y
 *   como se borra no hay pigmento que se acumule por repintar.
 *
 * Tambien pinta las altas: quien se registra ve su propia pincelada
 * dibujarse. Es la misma maquina, con una sola pendiente en la cola.
 */
import { largoRama, recortarRama, type Rama } from '@core/render/rama';
import { pintarRamaDe } from '@core/render/compose';
import type { ColorRamp } from '@core/render/palette';
import type { RenderOptions } from '@core/types';

/** Lo que tarda el mural entero en pintarse, en segundos. */
const PINTADO_S = 9;
/** Lo que corre el pincel, en px de trabajo por segundo. */
const VELOCIDAD = 900;
/** Lo que puede estar mojado a la vez: el techo del costo por fotograma. */
const A_LA_VEZ = 9;
/** Lo que tarda la pincelada mas corta y la mas larga, en segundos. */
const MINIMO_S = 0.18;
const MAXIMO_S = 0.9;

/** Una pincelada en curso. */
interface Viva {
  rama: Rama;
  /** Cuanto lleva pintado, en [0,1]. */
  avance: number;
  /** Cuanto avanza por segundo. */
  paso: number;
}

export class Pintado {
  private cola: Rama[] = [];
  private proxima = 0;
  private vivas: Viva[] = [];
  /** Pinceladas que toca arrancar y todavia no cuajaron en una entera. */
  private resto = 0;
  private ritmo = 1;

  /** `true` mientras quede algo por pintar. */
  get activo(): boolean {
    return this.vivas.length > 0 || this.proxima < this.cola.length;
  }

  /**
   * Pone estas pinceladas a pintarse. Lo que hubiera en curso se descarta:
   * quien llama ya repinto la escena con lo que estaba seco.
   */
  empezar(ramas: readonly Rama[]): void {
    this.cola = [...ramas];
    this.proxima = 0;
    this.vivas = [];
    this.resto = 1;   // la primera arranca en el mismo fotograma
    // El mural entero tarda lo mismo sea cual sea la concurrencia; un alta
    // suelta no espera su turno de nueve segundos, arranca y ya.
    this.ritmo = Math.max(1, this.cola.length / PINTADO_S);
  }

  /**
   * Avanza el pintado `dt` segundos. Las que terminan salen por `secar`, que
   * es quien las estampa en la escena cacheada.
   */
  avanzar(dt: number, secar: (rama: Rama) => void): void {
    this.resto += this.ritmo * dt;
    while (this.resto >= 1 && this.vivas.length < A_LA_VEZ && this.proxima < this.cola.length) {
      this.resto -= 1;
      const rama = this.cola[this.proxima++];
      // Una pincelada larga tarda mas que una corta: el pincel corre, no
      // aparece. De ahi sale cuantas hay mojadas a la vez.
      const duracion = Math.min(MAXIMO_S, Math.max(MINIMO_S, largoRama(rama) / VELOCIDAD));
      this.vivas.push({ rama, avance: 0, paso: 1 / duracion });
    }
    // Con el cupo lleno no se acumula deuda: si no, al liberarse entrarian
    // treinta de golpe y el pintado daria un salto.
    if (this.resto > 1) this.resto = 1;

    let quedan = 0;
    for (const viva of this.vivas) {
      viva.avance += viva.paso * dt;
      if (viva.avance < 1) this.vivas[quedan++] = viva;
      else secar(viva.rama);
    }
    this.vivas.length = quedan;
  }

  /**
   * Dibuja lo que esta mojado sobre `ctx`. `escala` lleva de coordenadas de
   * trabajo a las del lienzo, igual que en el render.
   */
  dibujar(
    ctx: CanvasRenderingContext2D,
    ramp: ColorRamp,
    options: RenderOptions,
    escala: number,
    nucleo = false
  ): void {
    if (this.vivas.length === 0) return;
    ctx.globalCompositeOperation = 'multiply';
    for (const viva of this.vivas) {
      pintarRamaDe(ctx, recortarRama(viva.rama, viva.avance), ramp, options, escala, nucleo);
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  /**
   * Seca todo lo que falta de una vez, sin animar. Es lo que corre cuando el
   * sistema pide menos movimiento: el mural tiene que estar igual de entero,
   * solo que sin el espectaculo.
   */
  terminar(secar: (rama: Rama) => void): void {
    for (const viva of this.vivas) secar(viva.rama);
    for (let i = this.proxima; i < this.cola.length; i++) secar(this.cola[i]);
    this.vivas = [];
    this.proxima = this.cola.length;
  }
}
